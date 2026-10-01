/**
 * `post list` 의 `--created`·`--updated` 값을 업무 목록 API 의 `createdAt`·`updatedAt` 값으로 확정하는 순수 함수.
 *
 * `A~B`, `A~`, `~B`, `prev-<N>d` 를 받는다. A·B 는 `YYYY-MM-DD` 또는 offset 이 붙은 ISO8601 이다.
 * 날짜만 주면 그 날짜의 지역 offset 으로 A 는 00:00:00, B 는 23:59:59 로 늘린다.
 * 서버가 거절하는 형태는 API 를 부르기 전에 `EXIT_PARAM_ERROR` 로 거른다 (ADR-064).
 */

import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import {
  DAY_END,
  DAY_START,
  type DayTime,
  expandLocalDate,
  isDateOnlyForm,
  parseIsoInstant,
  parseLocalDate,
} from "../../utils/local-date.js";

export type DateFilterOption = "created" | "updated";

const PREV_DAYS = /^prev-\d+d$/;

/**
 * `~B` 의 빈 시작을 채울 값.
 *
 * 서버는 끝만 준 `~B` 를 400 으로 거절하고 `1970-01-01T00:00:00Z~B` 는 받는다(실측).
 * 업무가 이보다 앞서 만들어졌을 리 없으므로 "처음부터" 와 같다.
 */
export const OPEN_START = "1970-01-01T00:00:00Z";

function paramError(option: DateFilterOption, value: string, reason: string): DoorayCliError {
  return new DoorayCliError(
    `--${option} 값을 읽을 수 없습니다: "${value}" (${reason}. ` +
      `예: 2026-09-01~2026-09-30, 2026-09-01~, "~2026-09-30", ` +
      `2026-09-01T09:00:00+09:00~, prev-7d)`,
    EXIT_PARAM_ERROR,
  );
}

/** 한쪽 경계를 서버에 보낼 ISO8601 로 확정한다. 날짜만 주면 `time` 으로 늘린다. */
function normalizeBound(
  bound: string,
  time: DayTime,
  option: DateFilterOption,
  value: string,
): string {
  if (isDateOnlyForm(bound)) {
    const date = parseLocalDate(bound);
    if (date == null) throw paramError(option, value, `달력에 없는 날짜입니다: ${bound}`);
    return expandLocalDate(date, time);
  }
  if (parseIsoInstant(bound) == null) {
    throw paramError(option, value, `YYYY-MM-DD 나 offset 이 붙은 ISO8601 이 아닙니다: ${bound}`);
  }
  return bound;
}

/**
 * 사용자가 준 기간을 서버가 받는 형태로 바꾼다.
 *
 * 서버는 날짜만 준 범위(`2026-09-01~2026-09-30`)와 끝만 준 범위(`~B`)와
 * 시작과 끝이 같은 범위를 400 으로 거절한다(실측). 앞의 둘은 받는 형태로 바꿔 보내고,
 * 시작이 끝과 같거나 뒤인 범위는 여기서 거부한다.
 */
export function resolveDateFilter(value: string, option: DateFilterOption): string {
  if (PREV_DAYS.test(value)) return value;

  const parts = value.split("~");
  if (parts.length !== 2) {
    throw paramError(option, value, "A~B, A~, ~B, prev-<N>d 중 하나로 주세요");
  }
  const [rawStart, rawEnd] = parts as [string, string];
  if (rawStart === "" && rawEnd === "") {
    throw paramError(option, value, "시작과 끝 중 하나는 있어야 합니다");
  }

  const start = rawStart === "" ? null : normalizeBound(rawStart, DAY_START, option, value);
  const end = rawEnd === "" ? null : normalizeBound(rawEnd, DAY_END, option, value);

  // 빈 시작을 채운 뒤에 견준다. `~1969-12-31` 도 서버에는 뒤집힌 범위로 나간다.
  const from = start ?? OPEN_START;
  if (end != null && Date.parse(from) >= Date.parse(end)) {
    throw new DoorayCliError(
      `--${option} 의 시작이 끝과 같거나 뒤입니다: ${from} ~ ${end}`,
      EXIT_PARAM_ERROR,
    );
  }
  return `${from}~${end ?? ""}`;
}
