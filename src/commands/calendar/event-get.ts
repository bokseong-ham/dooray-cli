import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import type { CalendarEventDetail, CalendarEventUser } from "../../api/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson, printTable } from "../../formatters/table.js";
import { sanitizeForTerminal } from "../../utils/sanitize.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { formatEventTime } from "./event-time.js";

/** 상세 응답의 참석자에는 이름이 들어 있다. 없으면 id 로 대신한다 — 멤버를 따로 조회하지 않는다. */
function userLabel(user: CalendarEventUser): string {
  return user.member?.name ?? user.member?.organizationMemberId ?? "";
}

function joinUsers(users: CalendarEventUser[] | null | undefined): string {
  if (users == null || users.length === 0) return "";
  return users.map(userLabel).filter((label) => label !== "").join(", ");
}

export const calendarEventGetCommand = new Command("get")
  .description("일정 상세 조회")
  .argument("<calendar-id>", "캘린더 ID (calendar list 로 확인)")
  .argument("<event-id>", "일정 ID (calendar event list --quiet 으로 확인)")
  .action(async (calendarId: string, eventId: string) => {
    const globalOpts = calendarEventGetCommand.optsWithGlobals() as OutputOptions;

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("일정 조회 중...");
    let event: CalendarEventDetail;
    try {
      const res = await client.getCalendarEvent(calendarId, eventId);
      event = res.result;
    } catch (e) {
      stopSpinner(false);
      throw e;
    }
    stopSpinner(true, "조회 완료");

    if (globalOpts.json) {
      printJson(event);
      return;
    }
    if (globalOpts.quiet) {
      process.stdout.write(event.id + "\n");
      return;
    }

    const cc = joinUsers(event.users?.cc);
    // 서버가 준 문자열은 외부 통제 값이라 출력 직전 control char 를 없앤다.
    printTable(
      ["Field", "Value"],
      [
        ["제목", sanitizeForTerminal(event.subject ?? "")],
        ["시각", formatEventTime(event)],
        ["장소", sanitizeForTerminal(event.location ?? "")],
        ["등록자", sanitizeForTerminal(event.users?.from ? userLabel(event.users.from) : "")],
        ["참석자", sanitizeForTerminal(joinUsers(event.users?.to))],
        ...(cc === "" ? [] : [["참조", sanitizeForTerminal(cc)]]),
      ],
    );
  });
