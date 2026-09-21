import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveMessengerChannel } from "../../resolvers/messenger-channel.js";
import type { MessengerLog } from "../../api/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { output, truncate } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

// 서버가 받아주는 size 상한. 넘겨도 1000 건만 오므로 조용히 자르지 않고 거부한다.
export const MAX_LOG_COUNT = 1000;
const DEFAULT_LOG_COUNT = 20;

/**
 * `2026-09-18T11:38:11+09:00` → `2026-09-18 11:38`.
 * 문자열을 자르기만 한다 — Date 로 파싱하면 서버가 준 offset 기준 시각이
 * 실행 장비의 타임존으로 밀려 보인다.
 */
export function formatSentAt(sentAt?: string): string {
  if (!sentAt) return "";
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(sentAt);
  return m ? `${m[1]} ${m[2]}` : sentAt;
}

function senderId(log: MessengerLog): string | undefined {
  // sender.type 이 member 가 아닌 경우(봇 등)엔 organizationMemberId 가 없을 수 있다.
  return log.sender?.member?.organizationMemberId;
}

/**
 * 발신자 id → 표시명. 고유 id 마다 한 번씩만 조회하고,
 * 실패한 id 는 map 에 넣지 않아 호출자가 id 를 그대로 보여주게 한다.
 */
export async function buildSenderNameMap(
  client: DoorayApiClient,
  logs: MessengerLog[],
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const log of logs) {
    const id = senderId(log);
    if (id) ids.add(id);
  }

  const map = new Map<string, string>();
  for (const id of ids) {
    try {
      const detail = await client.getMemberDetail(id);
      if (detail.result?.name) map.set(id, detail.result.name);
    } catch {
      // 이름 조회 실패는 명령 전체를 실패시키지 않는다 — 표에 id 를 그대로 쓴다.
    }
  }
  return map;
}

export const messengerLogsCommand = new Command("logs")
  .description("메신저 대화방 메시지 조회 (최근 N건, 최대 1000건)")
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
    try {
      const res = await client.getChannelLogs(channelId, n);
      logs = res.result ?? [];
      stopSpinner(true, "조회 완료");
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    if (globalOpts.json) {
      // 서버 응답 result 원형 (ADR-031 의 raw 출력과 같은 취지) — 이름을 끼워넣지 않는다.
      output(globalOpts, { headers: [], rows: [], raw: logs, ids: [] });
      return;
    }

    // API 는 최신이 앞(seq 내림차순). 대화는 위에서 아래로 읽으므로 뒤집는다.
    const ordered = [...logs].reverse();

    if (globalOpts.quiet) {
      output(globalOpts, { headers: [], rows: [], raw: ordered, ids: ordered.map((l) => l.id) });
      return;
    }

    const nameMap = await buildSenderNameMap(client, ordered);
    const rows = ordered.map((log) => {
      const id = senderId(log);
      const sender = (id && nameMap.get(id)) || id || log.sender?.type || "";
      return [formatSentAt(log.sentAt), sender, truncate(log.text ?? "", 60)];
    });

    output(globalOpts, {
      headers: ["시각", "보낸이", "내용"],
      rows,
      raw: ordered,
      ids: ordered.map((l) => l.id),
    });
  });
