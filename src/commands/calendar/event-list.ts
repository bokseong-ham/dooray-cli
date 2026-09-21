import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import type { CalendarEvent } from "../../api/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { output, truncate } from "../../formatters/table.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveTimeRange } from "./date-range.js";
import { formatEventTime } from "./event-time.js";

const SUBJECT_MAX_LEN = 40;

export const calendarEventListCommand = new Command("list")
  .description(
    "기간 안의 일정 조회 (기본 오늘 하루). " +
      "공식 API 문서에 없는 endpoint 라 예고 없이 막힐 수 있다",
  )
  .option("--from <일시>", "시작 (YYYY-MM-DD 또는 ISO8601). 단독으로 주면 그 날 하루")
  .option("--to <일시>", "끝 (YYYY-MM-DD 또는 ISO8601). 단독으로 주면 그 날 하루")
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
