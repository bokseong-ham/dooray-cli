import { describe, expect, it } from "vitest";
import { expandDateOnly, localOffset, resolveTimeRange } from "./date-range.js";

// 실행 장비의 타임존에 따라 offset 이 달라지므로 기대값을 박지 않고 그 장비의 값을 쓴다.
function offsetOn(year: number, month: number, day: number, hour: number): string {
  return localOffset(new Date(year, month - 1, day, hour, 0, 0));
}

describe("localOffset", () => {
  it("`+HH:MM` 형태로 낸다", () => {
    expect(offsetOn(2026, 9, 20, 0)).toMatch(/^[+-]\d{2}:\d{2}$/);
  });
});

describe("expandDateOnly", () => {
  it("from 은 그 날 00:00:00 으로 늘린다", () => {
    expect(expandDateOnly("2026-09-20", "from")).toBe(
      `2026-09-20T00:00:00${offsetOn(2026, 9, 20, 0)}`,
    );
  });

  it("to 는 그 날 23:59:59 로 늘린다", () => {
    expect(expandDateOnly("2026-09-20", "to")).toBe(
      `2026-09-20T23:59:59${offsetOn(2026, 9, 20, 23)}`,
    );
  });

  it("없는 날짜는 다음 달로 넘기지 않고 거부한다", () => {
    expect(() => expandDateOnly("2026-02-31", "from")).toThrow(/읽을 수 없습니다/);
  });

  it("날짜가 아닌 값은 거부한다", () => {
    expect(() => expandDateOnly("2026-9-20", "from")).toThrow(/읽을 수 없습니다/);
  });
});

describe("resolveTimeRange", () => {
  const now = new Date(2026, 8, 20, 15, 30, 0); // 2026-09-20 15:30 로컬

  it("둘 다 없으면 오늘 하루로 잡는다", () => {
    expect(resolveTimeRange(undefined, undefined, now)).toEqual({
      timeMin: `2026-09-20T00:00:00${offsetOn(2026, 9, 20, 0)}`,
      timeMax: `2026-09-20T23:59:59${offsetOn(2026, 9, 20, 23)}`,
    });
  });

  it("--from 만 주면 --to 를 오늘 끝으로 채운다", () => {
    expect(resolveTimeRange("2026-09-18", undefined, now)).toEqual({
      timeMin: `2026-09-18T00:00:00${offsetOn(2026, 9, 18, 0)}`,
      timeMax: `2026-09-20T23:59:59${offsetOn(2026, 9, 20, 23)}`,
    });
  });

  it("--to 만 주면 --from 을 오늘 시작으로 채운다", () => {
    expect(resolveTimeRange(undefined, "2026-09-22", now)).toEqual({
      timeMin: `2026-09-20T00:00:00${offsetOn(2026, 9, 20, 0)}`,
      timeMax: `2026-09-22T23:59:59${offsetOn(2026, 9, 22, 23)}`,
    });
  });

  it("ISO8601 은 그대로 보낸다", () => {
    expect(
      resolveTimeRange("2026-09-20T09:00:00+09:00", "2026-09-20T18:00:00+09:00", now),
    ).toEqual({
      timeMin: "2026-09-20T09:00:00+09:00",
      timeMax: "2026-09-20T18:00:00+09:00",
    });
  });

  it("Z 와 소수 초가 붙은 ISO8601 도 받는다", () => {
    expect(resolveTimeRange("2026-09-20T00:00:00.000Z", "2026-09-20T23:59:59Z", now)).toEqual({
      timeMin: "2026-09-20T00:00:00.000Z",
      timeMax: "2026-09-20T23:59:59Z",
    });
  });

  it("offset 이 없는 일시는 거부한다", () => {
    expect(() => resolveTimeRange("2026-09-20T09:00:00", undefined, now)).toThrow(
      /--from 값을 읽을 수 없습니다/,
    );
  });

  it("어느 쪽이 잘못됐는지 옵션 이름으로 알린다", () => {
    expect(() => resolveTimeRange(undefined, "어제", now)).toThrow(/--to 값을 읽을 수 없습니다/);
  });
});
