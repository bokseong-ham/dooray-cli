import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import type { CalendarEvent } from "../../api/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { output, truncate } from "../../formatters/table.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveTimeRange } from "./date-range.js";

const SUBJECT_MAX_LEN = 40;

/**
 * `2026-09-20T14:00:00+09:00` → `{ date: "2026-09-20", time: "14:00" }`.
 *
 * `Date` 로 파싱하지 않는다 — 파싱하면 서버가 준 offset 기준 시각이
 * 실행 장비의 타임존으로 밀려 보인다.
 * offset 을 떼는 것은 `+09:00` 일 때뿐이다. 다른 offset 이나 `Z` 를 떼면
 * 그 시각을 KST 로 오독하므로 원형을 그대로 보여준다.
 */
function splitStamp(value: string): { date: string; time: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(?:\.\d+)?\+09:00$/.exec(value);
  return m ? { date: m[1]!, time: m[2]! } : null;
}

/**
 * 종일 일정의 `2026-09-18+09:00` → `2026-09-18`.
 *
 * 종일 일정은 시각 없이 날짜와 offset 만 온다. 일반 일정과 형식이 다르다.
 * 일반 일정과 같은 이유로 `+09:00` 일 때만 offset 을 뗀다.
 */
function splitDateStamp(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})\+09:00$/.exec(value);
  return m ? m[1]! : null;
}

/**
 * `2026-09-19` → `2026-09-18`.
 *
 * 지역 시간대를 거치지 않으려고 UTC 자정으로 세운 뒤 하루를 뺀다.
 * UTC 에는 서머타임이 없어 하루가 항상 24시간이고, 윤년과 월말은 `Date` 가 처리한다.
 */
function previousDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const at = new Date(Date.UTC(year, month - 1, day));
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

/**
 * 일정의 시각 열 문자열.
 *
 * - 종일 일정의 `endedAt` 은 그 날을 포함하지 않는다(실측). 마지막 날은 하루 앞이라
 *   하루짜리는 날짜 하나로, 여러 날이면 기간으로 적는다.
 * - 같은 날에 끝나는 일반 일정은 날짜를 한 번만 적는다.
 * - `+09:00` 이 아닌 값은 손대지 않고 원형을 그대로 보여준다.
 */
export function formatEventTime(event: CalendarEvent): string {
  const startedAt = event.startedAt ?? "";
  const endedAt = event.endedAt ?? "";

  if (event.wholeDayFlag === true) {
    const first = startedAt === "" ? null : splitDateStamp(startedAt);
    if (first == null) return startedAt === "" ? "(종일)" : `${startedAt} (종일)`;

    const endDay = endedAt === "" ? null : splitDateStamp(endedAt);
    if (endDay == null) return `${first} (종일)`;

    const last = previousDay(endDay);
    // 하루짜리는 last 가 first 와 같다. 어긋난 데이터로 last 가 앞서면 기간을 그리지 않는다.
    return last > first ? `${first} ~ ${last} (종일)` : `${first} (종일)`;
  }

  const start = startedAt === "" ? null : splitStamp(startedAt);
  const end = endedAt === "" ? null : splitStamp(endedAt);

  if (start && end) {
    return start.date === end.date
      ? `${start.date} ${start.time}-${end.time}`
      : `${start.date} ${start.time} ~ ${end.date} ${end.time}`;
  }
  if (start && endedAt === "") return `${start.date} ${start.time}`;

  // 한쪽이라도 해석되지 않으면 짝을 맞추지 않고 원형을 그대로 낸다.
  return endedAt === "" ? startedAt : `${startedAt} ~ ${endedAt}`;
}

export const calendarEventListCommand = new Command("list")
  .description(
    "기간 안의 일정 조회 (기본 오늘 하루). " +
      "공식 API 문서에 없는 endpoint 라 예고 없이 막힐 수 있다",
  )
  .option("--from <일시>", "시작 (YYYY-MM-DD 또는 ISO8601, 기본 오늘 00:00:00)")
  .option("--to <일시>", "끝 (YYYY-MM-DD 또는 ISO8601, 기본 오늘 23:59:59)")
  .action(async (opts: { from?: string; to?: string }) => {
    const globalOpts = calendarEventListCommand.optsWithGlobals() as OutputOptions;

    // 검증은 spinner 시작 전 (messenger logs 와 동일 순서).
    const { timeMin, timeMax } = resolveTimeRange(opts.from, opts.to);

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("일정 조회 중...");
    let events: CalendarEvent[];
    try {
      const res = await client.getCalendarEvents(timeMin, timeMax);
      events = res.result ?? [];
    } catch (e) {
      stopSpinner(false);
      throw e;
    }

    if (events.length === 0) {
      stopSpinner(true, "일정 없음");
      if (globalOpts.json) {
        output(globalOpts, { headers: [], rows: [], raw: events, ids: [] });
        return;
      }
      // 빈 배열에 printQuiet 를 부르면 빈 줄 하나가 나간다 (messenger logs 와 동일 처리).
      if (!globalOpts.quiet) process.stdout.write("일정이 없습니다.\n");
      return;
    }

    stopSpinner(true, "조회 완료");
    output(globalOpts, {
      headers: ["시각", "제목", "캘린더"],
      // 서버가 준 문자열은 외부 통제 값이라 출력 직전 control char 를 없앤다.
      rows: events.map((e) => [
        formatEventTime(e),
        sanitizeForTerminal(truncate(e.subject ?? "", SUBJECT_MAX_LEN)),
        sanitizeForTerminal(e.calendar?.name ?? ""),
      ]),
      // 서버가 주는 순서를 그대로 둔다. 정렬 기준을 확인하지 않아 다시 세우지 않는다.
      raw: events,
      ids: events.map((e) => e.id),
    });
  });
