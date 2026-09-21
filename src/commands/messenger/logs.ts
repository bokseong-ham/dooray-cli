import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveMessengerChannel } from "../../resolvers/messenger-channel.js";
import { buildOrganizationMemberNameMap } from "../../resolvers/member.js";
import type { MessengerLog } from "../../api/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { output, printJson, truncate } from "../../formatters/table.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

// 서버가 받아주는 size 상한. 넘겨도 1000 건만 오므로 조용히 자르지 않고 거부한다.
export const MAX_LOG_COUNT = 1000;
const DEFAULT_LOG_COUNT = 20;
const TEXT_MAX_LEN = 60;

/**
 * `2026-09-18T11:38:11+09:00` → `2026-09-18 11:38`.
 *
 * `Date` 로 파싱하지 않는다 — 파싱하면 서버가 준 offset 기준 시각이
 * 실행 장비의 타임존으로 밀려 보인다.
 * 다만 offset 을 떼는 것은 `+09:00` 일 때뿐이다. 다른 offset 이나 `Z` 를
 * 떼면 그 시각을 KST 로 오독하므로 원형을 그대로 보여준다.
 */
export function formatSentAt(sentAt?: string): string {
  if (!sentAt) return "";
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(?:\.\d+)?\+09:00$/.exec(sentAt);
  return m ? `${m[1]} ${m[2]}` : sentAt;
}

function senderId(log: MessengerLog): string | undefined {
  // sender.type 이 member 가 아닌 경우(봇 등)엔 organizationMemberId 가 없을 수 있다.
  return log.sender?.member?.organizationMemberId;
}

// 더 오래된 메시지가 있어도 이 API 로는 갈 수 없다 (ADR-061). 데이터가 아니라 안내이므로 stderr.
function warnHasMore(hasMore: boolean | undefined): void {
  if (hasMore !== true) return;
  process.stderr.write(
    `⚠  이보다 오래된 메시지가 더 있지만 이 API 는 그 이전으로 갈 수단을 주지 않습니다.\n`,
  );
}

export const messengerLogsCommand = new Command("logs")
  .description(
    "메신저 대화방 메시지 조회 (최근 N건, 최대 1000건). " +
      "공식 API 문서에 없는 endpoint 라 예고 없이 막힐 수 있다",
  )
  .argument("<channel>", "대화방 channelId 또는 이름 (부분일치)")
  .option("-n, --count <n>", `가져올 개수 (기본 ${DEFAULT_LOG_COUNT})`, String(DEFAULT_LOG_COUNT))
  .action(async (channel: string, opts: { count: string }) => {
    const globalOpts = messengerLogsCommand.optsWithGlobals() as OutputOptions;

    // 검증은 spinner 시작 전 (comment latest 와 동일 순서)
    const n = Number(opts.count);
    if (!Number.isInteger(n) || n <= 0) {
      throw new DoorayCliError("--count는 양의 정수여야 합니다.", EXIT_PARAM_ERROR);
    }
    if (n > MAX_LOG_COUNT) {
      throw new DoorayCliError(
        `--count는 최대 ${MAX_LOG_COUNT}까지 지원합니다. 이 API는 그 이전 메시지로 거슬러 갈 수단이 없습니다.`,
        EXIT_PARAM_ERROR,
      );
    }

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    const channelId = await resolveMessengerChannel(client, channel);

    startSpinner("메시지 조회 중...");
    let logs: MessengerLog[];
    let hasMore: boolean | undefined;
    try {
      const res = await client.getChannelLogs(channelId, n);
      logs = res.result ?? [];
      hasMore = res.hasMore;
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    if (globalOpts.json) {
      // 서버 응답 result 원형 (ADR-031 의 raw 출력과 같은 취지) — 이름을 끼워넣지 않는다.
      stopSpinner(true, "조회 완료");
      printJson(logs);
      warnHasMore(hasMore);
      return;
    }

    // API 는 최신이 앞(seq 내림차순). 대화는 위에서 아래로 읽으므로 뒤집는다.
    const ordered = [...logs].reverse();

    if (globalOpts.quiet) {
      stopSpinner(true, ordered.length > 0 ? "조회 완료" : "메시지 없음");
      // 빈 배열에 printQuiet 를 부르면 빈 줄 하나가 나간다. 아무것도 내지 않는다.
      if (ordered.length > 0) {
        output(globalOpts, { headers: [], rows: [], raw: ordered, ids: ordered.map((l) => l.id) });
      }
      warnHasMore(hasMore);
      return;
    }

    if (ordered.length === 0) {
      stopSpinner(true, "메시지 없음");
      process.stdout.write("메시지가 없습니다.\n");
      warnHasMore(hasMore);
      return;
    }

    // 이름 해석까지 끝난 뒤에 완료를 찍는다 — 조회 직후에 찍으면 뒤따르는
    // 멤버 조회 동안 멈춘 것처럼 보인다.
    const nameMap = await buildOrganizationMemberNameMap(
      client,
      ordered.map(senderId).filter((id): id is string => !!id),
    );
    stopSpinner(true, "조회 완료");

    const rows = ordered.map((log) => {
      const id = senderId(log);
      const sender = (id && nameMap.get(id)) || id || log.sender?.type || "";
      // 서버가 준 문자열은 외부 통제 값이라 출력 직전 control char 를 없앤다.
      return [
        formatSentAt(log.sentAt),
        sanitizeForTerminal(sender),
        sanitizeForTerminal(truncate(log.text ?? "", TEXT_MAX_LEN)),
      ];
    });

    output(globalOpts, {
      headers: ["시각", "보낸이", "내용"],
      rows,
      raw: ordered,
      ids: ordered.map((l) => l.id),
    });
    warnHasMore(hasMore);
  });
