import { describe, expect, it } from "vitest";
import {
  DAY_END,
  DAY_START,
  expandLocalDate,
  isDateOnlyForm,
  localOffset,
  parseIsoInstant,
  parseLocalDate,
} from "./local-date.js";

describe("parseLocalDate", () => {
  it("달력에 있는 날짜를 읽는다", () => {
    expect(parseLocalDate("2026-09-01")).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it("형태는 맞아도 달력에 없는 날짜는 null", () => {
    expect(isDateOnlyForm("2026-02-31")).toBe(true);
    expect(parseLocalDate("2026-02-31")).toBeNull();
  });

  it("자릿수가 다르면 null", () => {
    expect(parseLocalDate("2026-9-1")).toBeNull();
  });
});

describe("parseIsoInstant", () => {
  it("날짜 부분과 offset 을 떼어 준다", () => {
    expect(parseIsoInstant("2026-09-01T09:00:00.123+09:00")).toEqual({
      date: "2026-09-01",
      offset: "+09:00",
    });
    expect(parseIsoInstant("2026-09-01T09:00:00Z")).toEqual({ date: "2026-09-01", offset: "Z" });
  });

  it.each([
    "2026-09-01T09:00:00",
    "2026-02-31T09:00:00+09:00",
    "2026-09-01T24:00:00+09:00",
    "2026-09-01T09:00:00+15:00",
    "2026-09-01T09:00:00+09:60",
  ])("%s 는 null", (value) => {
    expect(parseIsoInstant(value)).toBeNull();
  });
});

describe("expandLocalDate", () => {
  it("그 날짜의 지역 offset 을 붙인다", () => {
    const date = { year: 2026, month: 9, day: 1 };
    expect(expandLocalDate(date, DAY_START)).toBe(
      `2026-09-01T00:00:00${localOffset(new Date(2026, 8, 1, 0, 0, 0))}`,
    );
    expect(expandLocalDate(date, DAY_END)).toBe(
      `2026-09-01T23:59:59${localOffset(new Date(2026, 8, 1, 23, 59, 59))}`,
    );
  });
});
