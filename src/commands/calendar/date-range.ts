/**
 * `--from`·`--to` 를 서버에 보낼 `timeMin`·`timeMax` 로 확정하는 순수 함수.
 *
 * 날짜만 주면 그 날짜의 로컬 offset 으로 `--from` 은 그 날 00:00:00, `--to` 는 그 날 23:59:59 로
 * 늘린다. 서머타임으로 00:00 이 없는 날은 `Date` 가 옮긴 실제 시각을 되읽는다.
 * 한쪽만 주면 빠진 쪽을 준 값과 같은 날로 채운다.
 * 형식·실재성·뒤집힘·기간 상한(50일)은 API 를 부르기 전에 `EXIT_PARAM_ERROR` 로 거른다.
 */

import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import {
  DAY_END,
  DAY_START,
  type DayTime,
  expandLocalDate,
  isDateOnlyForm,
  pad2,
  parseIsoInstant,
  parseLocalDate,
} from "../../utils/local-date.js";

/**
 * 한 번에 조회할 수 있는 최대 기간(일).
 *
 * 공식 문서 표제는 1년치지만 실측으로는 50일까지만 받는다. 51일째에 들어서면 400
 * `USER_INVALID_EXCEED_MAXIMUM_PERIOD` 가 온다.
 */
export const MAX_RANGE_DAYS = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RangeEdge = "from" | "to";

export interface TimeRange {
  timeMin: string;
  timeMax: string;
}

function paramError(edge: RangeEdge, value: string): DoorayCliError {
  return new DoorayCliError(
    `--${edge} 값을 읽을 수 없습니다: "${value}" ` +
      `(YYYY-MM-DD 또는 2026-09-20T09:00:00+09:00 형태로 주세요)`,
    EXIT_PARAM_ERROR,
  );
}

/**
 * 날짜만 받은 값을 그 날의 시작(`00:00:00`)이나 끝(`23:59:59`)으로 늘리고
 * 지역 시간대 offset 을 붙인다.
 *
 * `timeMax` 는 문서상 포함하지 않지만 다음 날 00:00 으로 보내지 않는다. 서버가 종일 일정을
 * 날짜 단위로 견줘 다음 날 시작하는 종일 일정이 섞여 나온다(실측).
 */
export function expandDateOnly(value: string, edge: RangeEdge): string {
  return expandDateOnlyAs(value, edge === "from" ? DAY_START : DAY_END, edge);
}

/**
 * 세울 시각(`time`)과 오류에 적을 옵션 이름(`reportEdge`)을 따로 받는다.
 * 한쪽만 준 호출에서는 `--from` 값으로 `--to` 경계를 세우므로 둘이 어긋난다.
 */
function expandDateOnlyAs(
  value: string,
  time: DayTime,
  reportEdge: RangeEdge,
): string {
  const date = parseLocalDate(value);
  if (date == null) throw paramError(reportEdge, value);
  return expandLocalDate(date, time);
}

/** 사용자가 준 값을 그대로 쓸 수 있는 형태로 확정한다. */
function normalizeBound(value: string, edge: RangeEdge): string {
  if (isDateOnlyForm(value)) return expandDateOnly(value, edge);

  if (parseIsoInstant(value) == null) throw paramError(edge, value);
  return value;
}

/**
 * 한쪽만 준 호출에서 반대쪽 경계를 그 값이 가리키는 **같은 날** 로 세운다.
 *
 * 오늘로 채우면 준 값이 오늘 반대편에 있을 때 범위가 뒤집힌다.
 * offset 은 준 값의 것을 그대로 쓴다. 지역 offset 을 붙이면 시간대가 엇갈려 또 뒤집힐 수 있다.
 * 오류는 사용자가 실제로 준 옵션(`sourceEdge`) 이름으로 알린다.
 */
function counterpartBound(value: string, sourceEdge: RangeEdge): string {
  const time = sourceEdge === "from" ? DAY_END : DAY_START;
  if (isDateOnlyForm(value)) return expandDateOnlyAs(value, time, sourceEdge);

  const parts = parseIsoInstant(value);
  if (parts == null) throw paramError(sourceEdge, value);

  return `${parts.date}T${pad2(time[0])}:${pad2(time[1])}:${pad2(time[2])}${parts.offset}`;
}

/** 오늘 하루. 값이 하나도 없을 때만 쓴다. */
function today(now: Date, edge: RangeEdge): string {
  return expandLocalDate(
    { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() },
    edge === "from" ? DAY_START : DAY_END,
  );
}

/** 서버가 받는 최대 기간을 넘는 범위를 API 를 부르기 전에 거부한다. */
function checkMaxRange(range: TimeRange): TimeRange {
  // 서버는 날짜 단위로 세어 50일째 23:59:59 까지 받고 51일째 00:00 부터 거절한다(실측). 그 경계에 맞춘다.
  if (Date.parse(range.timeMax) - Date.parse(range.timeMin) >= (MAX_RANGE_DAYS + 1) * DAY_MS) {
    throw new DoorayCliError(
      `조회 기간이 너무 깁니다: ${range.timeMin} ~ ${range.timeMax}. ` +
        `한 번에 조회할 수 있는 기간은 최대 ${MAX_RANGE_DAYS}일입니다 ` +
        `(날짜만 준 --to 는 그 날까지 포함해 셉니다)`,
      EXIT_PARAM_ERROR,
    );
  }
  return range;
}

/**
 * `--from` 과 `--to` 를 서버에 보낼 `timeMin`·`timeMax` 로 바꾼다.
 *
 * 한쪽만 줘도 둘 다 보내는 이유가 있다. 서버는 `timeMin` 하나만 받으면 그것을 무시하고
 * 범위를 걸지 않은 것과 같은 결과를 준다. 빠진 쪽은 준 값과 같은 날로 채워
 * `--from` 단독과 `--to` 단독이 모두 "그 날 하루" 가 되게 한다.
 *
 * 형식이 어긋나거나 범위가 뒤집혔거나 최대 기간을 넘으면 API 를 부르기 전에 끝낸다.
 */
export function resolveTimeRange(
  from: string | undefined,
  to: string | undefined,
  now: Date = new Date(),
): TimeRange {
  if (from == null && to == null) {
    return { timeMin: today(now, "from"), timeMax: today(now, "to") };
  }
  if (to == null) {
    // 준 값을 먼저 검증한다 — 순서가 뒤바뀌면 오류가 주지도 않은 옵션 이름으로 나간다.
    const timeMin = normalizeBound(from!, "from");
    return { timeMin, timeMax: counterpartBound(from!, "from") };
  }
  if (from == null) {
    const timeMax = normalizeBound(to, "to");
    return { timeMin: counterpartBound(to, "to"), timeMax };
  }

  const timeMin = normalizeBound(from, "from");
  const timeMax = normalizeBound(to, "to");
  // 비교만 파싱한다 (표시용 문자열은 끝까지 손대지 않는다). offset 이 서로 달라도 시각으로 견준다.
  if (Date.parse(timeMin) > Date.parse(timeMax)) {
    throw new DoorayCliError(
      `--from 이 --to 보다 뒤입니다: ${timeMin} > ${timeMax}`,
      EXIT_PARAM_ERROR,
    );
  }
  // 한쪽만 준 범위는 하루라 상한에 걸리지 않는다. 둘 다 준 경우만 본다.
  return checkMaxRange({ timeMin, timeMax });
}
