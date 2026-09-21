import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const DAY_START = [0, 0, 0] as const;
const DAY_END = [23, 59, 59] as const;

export type RangeEdge = "from" | "to";

export interface TimeRange {
  timeMin: string;
  timeMax: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * `Date` 가 놓인 지역 시간대의 offset 을 `+09:00` 형태로 낸다.
 *
 * 고정값을 쓰지 않고 넘어온 시각으로 구하는 이유가 있다. 서머타임을 쓰는 지역에서는
 * 같은 장비라도 날짜에 따라 offset 이 달라서, 지금 시각의 offset 을 다른 날짜에 붙이면
 * 한 시간 어긋난 범위를 서버에 보내게 된다.
 */
export function localOffset(at: Date): string {
  // getTimezoneOffset 은 UTC 기준 "서쪽으로 몇 분" 이라 부호가 뒤집혀 있다.
  const minutesWest = at.getTimezoneOffset();
  const sign = minutesWest > 0 ? "-" : "+";
  const abs = Math.abs(minutesWest);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

function paramError(edge: RangeEdge, value: string): DoorayCliError {
  return new DoorayCliError(
    `--${edge} 값을 읽을 수 없습니다: "${value}" ` +
      `(YYYY-MM-DD 또는 2026-09-20T09:00:00+09:00 형태로 주세요)`,
    EXIT_PARAM_ERROR,
  );
}

/** 달력에 있는 날짜인지 본다. `Date` 는 2026-02-31 을 3월로 넘겨버리므로 되돌려 대조한다. */
function isRealDate(year: number, month: number, day: number): boolean {
  const at = new Date(Date.UTC(year, month - 1, day));
  return (
    at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
  );
}

/**
 * ISO8601 문자열이 실재하는 시각인지 본다.
 *
 * 자릿수만 맞으면 통과시키면 `2026-02-31T25:99:99+09:00` 이 그대로 서버로 나가고,
 * 서버에는 형식 검증이 없어 500 으로 돌아온다.
 */
function isRealIsoInstant(m: RegExpExecArray): boolean {
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [
    number, number, number, number, number, number,
  ];
  if (!isRealDate(year, month, day)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  const offset = m[7]!;
  if (offset === "Z") return true;
  const offsetHour = Number(offset.slice(1, 3));
  const offsetMinute = Number(offset.slice(4, 6));
  if (offsetMinute > 59) return false;
  // 실제로 쓰이는 UTC offset 은 -12:00 에서 +14:00 사이다.
  return offsetHour * 60 + offsetMinute <= 14 * 60;
}

function expand(
  year: number,
  month: number,
  day: number,
  time: readonly [number, number, number],
): string {
  const at = new Date(year, month - 1, day, time[0], time[1], time[2]);

  // 서머타임이 자정에 시작하는 지역에는 그 날 00:00 이 없다. 요청한 시·분·초를 그대로 박으면
  // 존재하지 않는 시각에 밀린 offset 을 붙여 하루가 한 시간 일찍 시작한다.
  // Date 가 옮겨 놓은 실제 시각을 되읽어 문자열을 세운다.
  return (
    `${pad4(at.getFullYear())}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}` +
    `T${pad2(at.getHours())}:${pad2(at.getMinutes())}:${pad2(at.getSeconds())}` +
    localOffset(at)
  );
}

/**
 * 날짜만 받은 값을 그 날의 시작(`00:00:00`)이나 끝(`23:59:59`)으로 늘리고
 * 지역 시간대 offset 을 붙인다.
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
  time: readonly [number, number, number],
  reportEdge: RangeEdge,
): string {
  const m = DATE_ONLY.exec(value);
  if (m == null) throw paramError(reportEdge, value);

  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isRealDate(year, month, day)) throw paramError(reportEdge, value);

  return expand(year, month, day, time);
}

/** 사용자가 준 값을 그대로 쓸 수 있는 형태로 확정한다. */
function normalizeBound(value: string, edge: RangeEdge): string {
  if (DATE_ONLY.test(value)) return expandDateOnly(value, edge);

  const m = ISO_WITH_OFFSET.exec(value);
  if (m == null || !isRealIsoInstant(m)) throw paramError(edge, value);
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
  if (DATE_ONLY.test(value)) return expandDateOnlyAs(value, time, sourceEdge);

  const m = ISO_WITH_OFFSET.exec(value);
  if (m == null || !isRealIsoInstant(m)) throw paramError(sourceEdge, value);

  return `${m[1]}-${m[2]}-${m[3]}T${pad2(time[0])}:${pad2(time[1])}:${pad2(time[2])}${m[7]}`;
}

/** 오늘 하루. 값이 하나도 없을 때만 쓴다. */
function today(now: Date, edge: RangeEdge): string {
  return expand(now.getFullYear(), now.getMonth() + 1, now.getDate(), edge === "from" ? DAY_START : DAY_END);
}

/**
 * `--from` 과 `--to` 를 서버에 보낼 `timeMin`·`timeMax` 로 바꾼다.
 *
 * 한쪽만 줘도 둘 다 보내는 이유가 있다. 서버는 `timeMin` 하나만 받으면 그것을 무시하고
 * 범위를 걸지 않은 것과 같은 결과를 준다. 빠진 쪽은 준 값과 같은 날로 채워
 * `--from` 단독과 `--to` 단독이 모두 "그 날 하루" 가 되게 한다.
 *
 * 형식이 어긋나거나 범위가 뒤집혔으면 API 를 부르기 전에 끝낸다.
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
  return { timeMin, timeMax };
}
