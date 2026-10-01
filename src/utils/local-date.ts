/**
 * 날짜·시각 입력을 읽고 지역 시간대 기준 ISO8601 문자열로 세우는 순수 함수 모음.
 *
 * `YYYY-MM-DD` 와 offset 이 붙은 ISO8601 두 형태를 다룬다. 둘 다 달력에 실재하는 값인지 본다.
 * 날짜만 받은 값은 그 날짜의 지역 offset 으로 시각을 붙인다. 지금 시각의 offset 을 빌려 쓰지 않는다.
 * 옵션 이름과 오류 문구는 호출하는 쪽이 정한다. 여기서는 값이 맞는지만 알려준다.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** 시·분·초. */
export type DayTime = readonly [number, number, number];

export const DAY_START: DayTime = [0, 0, 0];
export const DAY_END: DayTime = [23, 59, 59];

export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

/** 실재성 검증을 통과한 ISO8601 시각에서 날짜 부분과 offset 만 떼어 둔 것. */
export interface IsoInstantParts {
  /** `YYYY-MM-DD` */
  date: string;
  /** `Z` 또는 `+09:00` 형태 */
  offset: string;
}

export function pad2(n: number): string {
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

/** 달력에 있는 날짜인지 본다. `Date` 는 2026-02-31 을 3월로 넘겨버리므로 되돌려 대조한다. */
function isRealDate(year: number, month: number, day: number): boolean {
  const at = new Date(Date.UTC(year, month - 1, day));
  return (
    at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
  );
}

/** 자릿수로 보아 `YYYY-MM-DD` 형태인지만 본다. 실재성은 `parseLocalDate` 가 본다. */
export function isDateOnlyForm(value: string): boolean {
  return DATE_ONLY.test(value);
}

/** `YYYY-MM-DD` 를 읽는다. 형태가 다르거나 달력에 없는 날짜면 `null`. */
export function parseLocalDate(value: string): LocalDate | null {
  const m = DATE_ONLY.exec(value);
  if (m == null) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return isRealDate(year, month, day) ? { year, month, day } : null;
}

/**
 * offset 이 붙은 ISO8601 문자열을 읽는다. 형태가 다르거나 실재하지 않는 시각이면 `null`.
 *
 * 자릿수만 맞으면 통과시키면 `2026-02-31T25:99:99+09:00` 이 그대로 서버로 나가고,
 * 서버에는 형식 검증이 없어 500 으로 돌아온다.
 */
export function parseIsoInstant(value: string): IsoInstantParts | null {
  const m = ISO_WITH_OFFSET.exec(value);
  if (m == null) return null;

  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [
    number, number, number, number, number, number,
  ];
  if (!isRealDate(year, month, day)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const offset = m[7]!;
  if (offset !== "Z") {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetMinute > 59) return null;
    // 실제로 쓰이는 UTC offset 은 -12:00 에서 +14:00 사이다.
    if (offsetHour * 60 + offsetMinute > 14 * 60) return null;
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, offset };
}

/** 그 날짜의 `time` 시각을 지역 offset 을 붙인 ISO8601 문자열로 세운다. */
export function expandLocalDate(date: LocalDate, time: DayTime): string {
  const at = new Date(date.year, date.month - 1, date.day, time[0], time[1], time[2]);

  // 서머타임이 자정에 시작하는 지역에는 그 날 00:00 이 없다. 요청한 시·분·초를 그대로 박으면
  // 존재하지 않는 시각에 밀린 offset 을 붙여 하루가 한 시간 일찍 시작한다.
  // Date 가 옮겨 놓은 실제 시각을 되읽어 문자열을 세운다.
  return (
    `${pad4(at.getFullYear())}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}` +
    `T${pad2(at.getHours())}:${pad2(at.getMinutes())}:${pad2(at.getSeconds())}` +
    localOffset(at)
  );
}
