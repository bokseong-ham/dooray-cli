/**
 * 일정 생성·수정 요청 본문을 조립하는 순수 함수 모음. 알림 표기 해석, 반복 규칙 조립, 본문 조립,
 * 수정 때 기존 참석자 병합, 반복 회차 id 판별을 맡는다.
 *
 * 생성은 `users` 와 `body` 키가 없으면 서버가 500 을 내므로(실측) 값이 비어도 두 키를 항상 싣는다.
 * 수정은 빈 값이 아닌 필드만 반영하므로(공식 문서) 사용자가 준 값만 담는다.
 * 이름을 id 로 바꾸는 일은 여기서 하지 않는다. 부르는 쪽이 해석을 끝낸 id 를 넘긴다.
 */

import type {
  CalendarEventAlarm,
  CalendarEventUser,
  CalendarEventPersonalSettings,
  CalendarEventRecurrenceRule,
  CalendarEventWriteRequest,
  CalendarEventWriteUser,
} from "../../api/types.js";
import { MARKDOWN_MIME } from "../../utils/body-input.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { EventSchedule } from "./event-schedule.js";
import { resolveRepeatUntil } from "./event-schedule.js";

/**
 * 일정 본문의 기본 mimeType. 공식 문서의 요청 예시는 `text/html` 이지만 업무 생성과 같은 markdown 으로 둔다.
 * 서버는 두 형식을 모두 받고, 웹은 `**굵게**` 를 두 형식 모두에서 굵게 그렸다(실측).
 */
export const EVENT_BODY_DEFAULT_MIME = MARKDOWN_MIME;

const ALARM_RE = /^(?:(mail|app):)?(\d+)([mhdw])$/;

/**
 * `[mail|app:]<n><m|h|d|w>` → `{ action, trigger }`.
 *
 * `10m` → `TRIGGER:-PT10M`, `2h` → `TRIGGER:-PT2H`, `1d` → `TRIGGER:-P1D`, `1w` → `TRIGGER:-P1W`.
 * 시작 몇 분·시간·일·주 **전** 이라 부호는 항상 `-` 다. action 을 생략하면 `app` 이다.
 */
export function parseAlarm(spec: string): CalendarEventAlarm {
  const m = ALARM_RE.exec(spec.trim());
  if (m == null) {
    throw new DoorayCliError(
      `--alarm 값을 읽을 수 없습니다: "${spec}" ` +
        `([mail:|app:]<숫자><m|h|d|w> 형태로 주세요. 예: 10m, mail:1d, app:2h)`,
      EXIT_PARAM_ERROR,
    );
  }
  const action = (m[1] ?? "app") as CalendarEventAlarm["action"];
  const amount = Number(m[2]);
  const unit = m[3]!.toUpperCase();
  // 분·시간은 시각 부분(T 뒤), 일·주는 날짜 부분이다 (RFC 2445 duration).
  const duration = unit === "M" || unit === "H" ? `-PT${amount}${unit}` : `-P${amount}${unit}`;
  return { action, trigger: `TRIGGER:${duration}` };
}

export const REPEAT_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;

export interface RepeatOptions {
  repeat?: string;
  repeatInterval?: string;
  repeatUntil?: string;
  repeatByday?: string;
  repeatBymonth?: string;
  repeatBymonthday?: string;
}

function parseIntInRange(flag: string, value: string, min: number, max: number): number {
  const trimmed = value.trim();
  const n = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new DoorayCliError(
      `${flag} 는 ${min} 에서 ${max} 사이의 정수여야 합니다: "${value}"`,
      EXIT_PARAM_ERROR,
    );
  }
  return n;
}

/**
 * 쉼표 목록(`18,19,20`)의 각 값을 범위로 거르고 공백 없이 다시 잇는다.
 * 서버는 쉼표 목록을 받아 각 값으로 전개한다(실측). 빈 항목(`18,,20`)은 거부한다.
 */
function parseIntListInRange(flag: string, value: string, min: number, max: number): string {
  const items = value.split(",").map((v) => v.trim());
  if (items.some((v) => v === "")) {
    throw new DoorayCliError(
      `${flag} 에 빈 항목이 있습니다: "${value}" (예: 18,19,20)`,
      EXIT_PARAM_ERROR,
    );
  }
  return items.map((v) => String(parseIntInRange(flag, v, min, max))).join(",");
}

/** 부속 옵션 가운데 하나라도 주어졌는지. `--repeat` 없이 주면 오류로 끊는다. */
function hasRepeatDetail(opts: RepeatOptions): boolean {
  return (
    opts.repeatInterval != null ||
    opts.repeatUntil != null ||
    opts.repeatByday != null ||
    opts.repeatBymonth != null ||
    opts.repeatBymonthday != null
  );
}

/**
 * `--repeat*` 옵션을 `recurrenceRule` 로 조립한다. `--repeat` 이 없으면 `undefined`.
 *
 * `timezoneName` 은 실행 장비의 시간대를 넣는다. `byday` 는 문서가 보여주는 표기가 여럿이라
 * (`TH`, `1 MO`, `-1 WE`) 손대지 않고 넘긴다. `bymonth`·`bymonthday` 는 쉼표 목록을 받고 각 값을 문서의 범위로 거른다.
 * `monthly` + `byday TH` + `bymonthday 18,...,24` 는 매월 18-24일 사이의 목요일이 된다(실측).
 */
export function buildRecurrenceRule(
  opts: RepeatOptions,
  timezoneName: string,
): CalendarEventRecurrenceRule | undefined {
  if (opts.repeat == null) {
    if (hasRepeatDetail(opts)) {
      throw new DoorayCliError(
        "--repeat-interval·--repeat-until·--repeat-byday·--repeat-bymonth·--repeat-bymonthday 는 " +
          "--repeat 과 함께 주어야 합니다.",
        EXIT_PARAM_ERROR,
      );
    }
    return undefined;
  }

  const frequency = opts.repeat.trim().toLowerCase();
  if (!(REPEAT_FREQUENCIES as readonly string[]).includes(frequency)) {
    throw new DoorayCliError(
      `--repeat 는 ${REPEAT_FREQUENCIES.join(", ")} 중 하나여야 합니다: "${opts.repeat}"`,
      EXIT_PARAM_ERROR,
    );
  }

  const rule: CalendarEventRecurrenceRule = {
    frequency,
    interval:
      opts.repeatInterval == null
        ? 1
        : parseIntInRange("--repeat-interval", opts.repeatInterval, 1, 999),
    timezoneName,
  };
  if (opts.repeatUntil != null) rule.until = resolveRepeatUntil(opts.repeatUntil);
  if (opts.repeatByday != null) {
    const byday = opts.repeatByday.trim();
    if (byday === "") {
      throw new DoorayCliError("--repeat-byday 가 비어 있습니다.", EXIT_PARAM_ERROR);
    }
    rule.byday = byday;
  }
  if (opts.repeatBymonth != null) {
    rule.bymonth = parseIntListInRange("--repeat-bymonth", opts.repeatBymonth, 1, 12);
  }
  if (opts.repeatBymonthday != null) {
    rule.bymonthday = parseIntListInRange("--repeat-bymonthday", opts.repeatBymonthday, 1, 31);
  }
  return rule;
}

/** 실행 장비의 IANA 시간대 이름. 얻지 못하면 `UTC` 로 둔다. */
export function localTimezoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** 해석이 끝난 값들. `undefined` 인 항목은 요청에 넣지 않는다. */
export interface EventRequestParts {
  subject?: string;
  /** 빈 문자열이면 본문을 보내지 않는다. */
  bodyContent?: string;
  mimeType?: string;
  location?: string;
  to?: string[];
  cc?: string[];
  schedule?: EventSchedule | null;
  alarms?: CalendarEventAlarm[];
  isPrivate?: boolean;
  recurrenceRule?: CalendarEventRecurrenceRule;
}

export type EventRequestMode = "create" | "edit";

function toUsers(ids: string[]): CalendarEventWriteUser[] {
  return ids.map((organizationMemberId) => ({
    type: "member",
    member: { organizationMemberId },
  }));
}

/**
 * 해석이 끝난 값으로 요청 본문을 만든다.
 *
 * - `create` 는 `users` 와 `body` 를 항상 싣는다. 참석자가 없으면 `users: {}`, 본문이 없으면 `content: ""` 다.
 *   둘 중 하나라도 빠지면 서버가 500 을 낸다(실측). 수정에는 이 제약이 없다.
 * - `edit` 은 본문이 비어 있으면 `body` 키를 만들지 않는다.
 * - `personalSettings` 는 알림과 비공개 중 준 것만 담고, 둘 다 없으면 키를 만들지 않는다.
 * - 시각은 세 필드(`startedAt`·`endedAt`·`wholeDayFlag`)를 함께 넣는다. 종일 여부만 따로 바뀌지 않게 한다.
 */
export function buildEventRequest(
  parts: EventRequestParts,
  mode: EventRequestMode = "edit",
): CalendarEventWriteRequest {
  const req: CalendarEventWriteRequest = {};
  const create = mode === "create";

  if (parts.subject != null) req.subject = parts.subject;
  const content = parts.bodyContent ?? "";
  if (create || content !== "") {
    req.body = { mimeType: parts.mimeType ?? EVENT_BODY_DEFAULT_MIME, content };
  }
  if (parts.location != null) req.location = parts.location;

  if (create || parts.to != null || parts.cc != null) {
    req.users = {
      ...(parts.to != null && { to: toUsers(parts.to) }),
      ...(parts.cc != null && { cc: toUsers(parts.cc) }),
    };
  }

  if (parts.schedule != null) {
    req.startedAt = parts.schedule.startedAt;
    req.endedAt = parts.schedule.endedAt;
    req.wholeDayFlag = parts.schedule.wholeDayFlag;
  }

  if (parts.recurrenceRule != null) req.recurrenceRule = parts.recurrenceRule;

  const settings: CalendarEventPersonalSettings = {};
  if (parts.alarms != null && parts.alarms.length > 0) settings.alarms = parts.alarms;
  if (parts.isPrivate === true) settings.class = "private";
  if (Object.keys(settings).length > 0) req.personalSettings = settings;

  return req;
}

/** 요청에 실을 필드가 하나도 없는지. 수정 명령이 API 를 부르기 전에 막는 데 쓴다. */
export function isEmptyEventRequest(req: CalendarEventWriteRequest): boolean {
  return Object.keys(req).length === 0;
}

/**
 * 상세 응답의 참석자를 쓰기 요청 형태로 옮긴다. `member` 와 `emailUser` 만 옮길 수 있고,
 * 그 밖의 종류나 식별자가 빠진 항목이 있으면 오류로 멈춘다. 건너뛰면 그 사람이 조용히 일정에서 빠진다.
 */
export function toWriteUsers(
  existing: CalendarEventUser[] | null | undefined,
  side: "to" | "cc",
): CalendarEventWriteUser[] {
  return (existing ?? []).map((u) => {
    if (u.type === "member" && u.member?.organizationMemberId) {
      return { type: "member", member: { organizationMemberId: u.member.organizationMemberId } };
    }
    if (u.type === "emailUser" && u.emailUser?.emailAddress) {
      return {
        type: "emailUser",
        emailUser: { emailAddress: u.emailUser.emailAddress, name: u.emailUser.name ?? "" },
      };
    }
    throw new DoorayCliError(
      `기존 ${side === "to" ? "참석자" : "참조자"} 중 옮길 수 없는 항목이 있습니다 (type: ${u.type ?? "없음"}). ` +
        "--to 와 --cc 를 둘 다 주면 기존 값을 읽지 않고 준 목록으로 바꿉니다.",
      EXIT_PARAM_ERROR,
    );
  });
}

/**
 * 수정 요청의 `users` 에서 빠진 쪽을 기존 값으로 채운다.
 *
 * 서버는 `users` 를 통째로 바꾼다(실측). `--cc` 만 보내면 참석자(to)가 비워지므로,
 * 한쪽만 준 경우 다른 쪽은 기존 목록을 그대로 실어 보낸다. 둘 다 줬거나 둘 다 없으면 손대지 않는다.
 */
export function mergeExistingUsers(
  req: CalendarEventWriteRequest,
  existing: { to?: CalendarEventUser[] | null; cc?: CalendarEventUser[] | null } | undefined,
): CalendarEventWriteRequest {
  const users = req.users;
  if (users == null) return req;
  const hasTo = users.to != null;
  const hasCc = users.cc != null;
  if (hasTo === hasCc) return req;
  return {
    ...req,
    users: {
      to: hasTo ? users.to : toWriteUsers(existing?.to, "to"),
      cc: hasCc ? users.cc : toWriteUsers(existing?.cc, "cc"),
    },
  };
}

/** `users` 를 한쪽만 실어 기존 값 조회가 필요한지. */
export function needsExistingUsers(req: CalendarEventWriteRequest): boolean {
  const users = req.users;
  return users != null && (users.to != null) !== (users.cc != null);
}

const INSTANCE_ID_RE = /^(.+)-(\d{8}T\d{6}Z)$/;

/**
 * 반복 일정 회차 id(`<원본 id>-20261109T000000Z`)면 원본 id 를 돌려주고 아니면 `null`.
 *
 * 회차 id 로 수정하면 그 회차가 아니라 남은 회차 전체가 바뀐다(실측). 공식 문서의 수정에는 범위 파라미터가 없다.
 */
export function instanceOriginalId(eventId: string): string | null {
  const m = INSTANCE_ID_RE.exec(eventId);
  return m ? m[1]! : null;
}
