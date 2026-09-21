import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type RangeEdge = "from" | "to";

export interface TimeRange {
  timeMin: string;
  timeMax: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
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

/**
 * 날짜만 받은 값을 그 날의 시작(`00:00:00`)이나 끝(`23:59:59`)으로 늘리고
 * 지역 시간대 offset 을 붙인다.
 */
export function expandDateOnly(value: string, edge: RangeEdge): string {
  const m = DATE_ONLY.exec(value);
  if (m == null) throw paramError(edge, value);

  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const time = edge === "from" ? [0, 0, 0] : [23, 59, 59];
  const at = new Date(year, month - 1, day, time[0]!, time[1]!, time[2]!);

  // Date 는 2026-02-31 을 3월 3일로 넘겨버린다. 되돌려 대조해 없는 날짜를 거른다.
  if (
    at.getFullYear() !== year ||
    at.getMonth() !== month - 1 ||
    at.getDate() !== day
  ) {
    throw paramError(edge, value);
  }

  return `${m[1]}-${m[2]}-${m[3]}T${pad2(time[0]!)}:${pad2(time[1]!)}:${pad2(time[2]!)}${localOffset(at)}`;
}

/**
 * 한쪽 경계를 확정한다. 값이 없으면 `now` 가 놓인 날 하루로 채운다.
 *
 * 한쪽만 준 호출에서도 나머지를 채우는 이유가 있다. 서버는 `timeMin` 하나만 받으면
 * 그것을 무시하고 범위를 걸지 않은 것과 같은 결과를 준다.
 */
export function resolveBound(value: string | undefined, edge: RangeEdge, now: Date): string {
  if (value == null) {
    const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    return expandDateOnly(today, edge);
  }
  if (DATE_ONLY.test(value)) return expandDateOnly(value, edge);
  if (ISO_WITH_OFFSET.test(value)) return value;
  throw paramError(edge, value);
}

/**
 * `--from` 과 `--to` 를 서버에 보낼 `timeMin`·`timeMax` 로 바꾼다.
 * 형식이 어긋나면 API 를 부르기 전에 끝낸다 — 서버에 형식 검증이 없어 500 이 오기 때문이다.
 */
export function resolveTimeRange(
  from: string | undefined,
  to: string | undefined,
  now: Date = new Date(),
): TimeRange {
  return {
    timeMin: resolveBound(from, "from", now),
    timeMax: resolveBound(to, "to", now),
  };
}
