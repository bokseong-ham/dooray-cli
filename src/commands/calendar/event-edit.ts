/**
 * `dooray calendar event edit` — 일정 수정. `PUT calendar/v1/calendars/{calendar-id}/events/{event-id}`.
 *
 * 서버는 빈 값이 아닌 필드만 반영하므로(공식 문서) 사용자가 준 옵션의 필드만 보낸다. 다만 `users` 는 통째로 바뀌므로(실측)
 * `--to`·`--cc` 중 한쪽만 주면 상세를 조회해 다른 쪽을 기존 값으로 채운다.
 * 반복 일정 회차 id 는 거부한다. 회차 id 로 수정하면 남은 회차 전체가 바뀐다(실측).
 * `personalSettings`(알림·비공개)도 통째로 바뀌는데 상세 응답에 없어 채울 수 없으므로, 지워질 설정을 stderr 로 알린다.
 * 시각은 기존 값을 조회하지 않는다. 일반 일정은 `--start` 와 `--end` 를 함께 줘야 하고 종일은 `--start` 만 줘도 된다.
 * `$EDITOR` 로 폴백하지 않는다. 일정에는 편집기로 고칠 하나의 본문이 아니라 필드가 여럿이다.
 */

import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import type { CalendarEventWriteRequest } from "../../api/types.js";
import type { OutputOptions } from "../../formatters/table.js";
import { printJson } from "../../formatters/table.js";
import {
  formatCalendarLabel,
  resolveWritableCalendar,
  type ResolvedCalendar,
} from "../../resolvers/calendar.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { isDateOnlyForm } from "../../utils/local-date.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import {
  instanceOriginalId,
  isEmptyEventRequest,
  mergeExistingUsers,
  needsExistingUsers,
} from "./event-request.js";
import {
  addEventFieldOptions,
  type EventFieldOptions,
  hasEventFieldOption,
  prepareEventFields,
  resolveEventRequest,
  warnDryRunOutputOptions,
} from "./event-write.js";

function nothingToEdit(): DoorayCliError {
  return new DoorayCliError(
    "수정할 항목이 없습니다. --title, --start, --body, --location, --to 같은 옵션을 하나 이상 주세요.",
    EXIT_PARAM_ERROR,
  );
}

/** 회차 id 를 API 호출 전에 거부한다. 경고만 하고 진행하면 사용자가 뜻하지 않은 범위가 조용히 바뀐다. */
export function rejectInstanceId(eventId: string): void {
  const originalId = instanceOriginalId(eventId);
  if (originalId == null) return;
  throw new DoorayCliError(
    `반복 일정의 회차 id 입니다: ${eventId}\n` +
      "회차 하나만 고칠 수 없고, 회차 id 로 수정하면 남은 반복 전체가 바뀝니다.\n" +
      `반복 전체를 고치려면 원본 id(${originalId}) 로 다시 실행하세요.`,
    EXIT_PARAM_ERROR,
  );
}

/**
 * 수정에서 지워질 수 있는 개인 설정을 stderr 로 알린다.
 *
 * 서버는 `personalSettings` 를 통째로 바꾸고(실측) 상세 응답에는 그 값이 없어 기존 값을 채워 보낼 수 없다.
 * `--alarm` 만 주면 비공개가 공개로, `--private` 만 주면 알림이 모두 지워진다.
 * 일반 일정을 종일로 바꿔도 알림이 지워진다(실측). 기존 일정이 일반인지 모르므로 종일 시각을 주면 알린다.
 */
export function warnPersonalSettingsReset(opts: EventFieldOptions): void {
  const hasAlarm = (opts.alarm ?? []).length > 0;
  const isPrivate = opts.private === true;
  if (hasAlarm && !isPrivate) {
    process.stderr.write(
      "⚠  --alarm 만 주면 비공개 일정이 공개로 바뀝니다. 비공개를 유지하려면 --private 를 함께 주세요.\n",
    );
  }
  if (isPrivate && !hasAlarm) {
    process.stderr.write(
      "⚠  --private 만 주면 기존 알림이 모두 지워집니다. 알림을 유지하려면 --alarm 을 함께 주세요.\n",
    );
  }
  if (!hasAlarm && opts.start != null && isDateOnlyForm(opts.start)) {
    process.stderr.write(
      "⚠  일반 일정을 종일로 바꾸면 기존 알림이 지워집니다. 알림이 필요하면 --alarm 을 함께 주세요.\n",
    );
  }
}

export const calendarEventEditCommand = addEventFieldOptions(
  new Command("edit")
    .description("일정 수정 (준 옵션의 필드만 바꾼다. 반복 일정 회차 id 는 받지 않는다)")
    .argument("<calendar>", "캘린더 ID 또는 이름 (calendar list 로 확인)")
    .argument("<event-id>", "일정 ID (calendar event list --quiet 으로 확인)"),
).action(async (calendarInput: string, eventId: string, opts: EventFieldOptions) => {
  const globalOpts = calendarEventEditCommand.optsWithGlobals() as OutputOptions;

  rejectInstanceId(eventId);
  if (!hasEventFieldOption(opts)) throw nothingToEdit();
  const prepared = await prepareEventFields(opts);
  if (opts.dryRun) warnDryRunOutputOptions(globalOpts);
  warnPersonalSettingsReset(opts);

  const config = await getConfigOrThrow();
  const client = new DoorayApiClient(config.apiKey, config.baseUrl);

  startSpinner(opts.dryRun ? "이름 해석 중..." : "일정 수정 중...");
  let calendar: ResolvedCalendar;
  let request: CalendarEventWriteRequest;
  try {
    calendar = await resolveWritableCalendar(client, calendarInput);
    request = await resolveEventRequest(client, prepared, "edit");
    // dry-run 도 같은 조회를 해서 실제로 보낼 본문을 보여준다.
    if (needsExistingUsers(request)) {
      const res = await client.getCalendarEvent(calendar.id, eventId);
      request = mergeExistingUsers(request, res.result?.users);
    }
  } catch (e) {
    stopSpinner(false);
    throw e;
  }
  // `--body ""` 처럼 옵션은 있으나 보낼 값이 비는 경우. 빈 요청을 보내면 아무것도 안 바뀌고 성공만 돌아온다.
  if (isEmptyEventRequest(request)) {
    stopSpinner(false);
    throw nothingToEdit();
  }
  const calendarLabel = formatCalendarLabel(calendar);

  if (opts.dryRun) {
    stopSpinner(true, `dry-run: ${calendarLabel} 의 일정 ${eventId} 에 보낼 요청입니다. API 는 부르지 않았습니다.`);
    printJson(request);
    return;
  }

  let raw: unknown;
  try {
    const res = await client.updateCalendarEvent(calendar.id, eventId, request);
    raw = res.result;
  } catch (e) {
    stopSpinner(false);
    throw e;
  }
  stopSpinner(true, "일정 수정 완료");

  if (globalOpts.json) {
    printJson(raw ?? null);
  } else if (globalOpts.quiet) {
    process.stdout.write(eventId + "\n");
  } else {
    process.stdout.write(`일정을 수정했습니다: ${eventId} (캘린더: ${calendarLabel})\n`);
  }
});
