import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  it("--from 만 주면 그 날 하루로 잡는다", () => {
    expect(resolveTimeRange("2026-09-18", undefined, now)).toEqual({
      timeMin: `2026-09-18T00:00:00${offsetOn(2026, 9, 18, 0)}`,
      timeMax: `2026-09-18T23:59:59${offsetOn(2026, 9, 18, 23)}`,
    });
  });

  it("--to 만 주면 그 날 하루로 잡는다", () => {
    expect(resolveTimeRange(undefined, "2026-09-22", now)).toEqual({
      timeMin: `2026-09-22T00:00:00${offsetOn(2026, 9, 22, 0)}`,
      timeMax: `2026-09-22T23:59:59${offsetOn(2026, 9, 22, 23)}`,
    });
  });

  it("--from 만 준 미래 날짜가 뒤집힌 범위를 만들지 않는다", () => {
    const range = resolveTimeRange("2026-10-01", undefined, now);
    expect(range).toEqual({
      timeMin: `2026-10-01T00:00:00${offsetOn(2026, 10, 1, 0)}`,
      timeMax: `2026-10-01T23:59:59${offsetOn(2026, 10, 1, 23)}`,
    });
    expect(Date.parse(range.timeMin)).toBeLessThan(Date.parse(range.timeMax));
  });

  it("--to 만 준 과거 날짜가 뒤집힌 범위를 만들지 않는다", () => {
    const range = resolveTimeRange(undefined, "2026-08-01", now);
    expect(range).toEqual({
      timeMin: `2026-08-01T00:00:00${offsetOn(2026, 8, 1, 0)}`,
      timeMax: `2026-08-01T23:59:59${offsetOn(2026, 8, 1, 23)}`,
    });
    expect(Date.parse(range.timeMin)).toBeLessThan(Date.parse(range.timeMax));
  });

  it("단독으로 준 ISO8601 은 날짜 부분과 그 값의 offset 으로 반대쪽을 세운다", () => {
    expect(resolveTimeRange("2026-10-01T09:00:00+09:00", undefined, now)).toEqual({
      timeMin: "2026-10-01T09:00:00+09:00",
      timeMax: "2026-10-01T23:59:59+09:00",
    });
    expect(resolveTimeRange(undefined, "2026-08-01T18:00:00Z", now)).toEqual({
      timeMin: "2026-08-01T00:00:00Z",
      timeMax: "2026-08-01T18:00:00Z",
    });
  });

  it("둘 다 줬는데 뒤집혀 있으면 거부한다", () => {
    expect(() => resolveTimeRange("2026-10-01", "2026-09-20", now)).toThrow(/--from 이 --to 보다 뒤/);
  });

  it("offset 이 달라도 시각으로 견줘 판정한다", () => {
    // 같은 날짜지만 09:00+09:00(00:00Z) 가 01:00Z 보다 앞이라 뒤집히지 않았다.
    expect(() =>
      resolveTimeRange("2026-09-20T09:00:00+09:00", "2026-09-20T01:00:00Z", now),
    ).not.toThrow();
    expect(() =>
      resolveTimeRange("2026-09-20T09:00:00Z", "2026-09-20T09:00:00+09:00", now),
    ).toThrow(/--from 이 --to 보다 뒤/);
  });

  it("양끝이 같은 시각인 범위는 통과시킨다", () => {
    expect(() =>
      resolveTimeRange("2026-09-20T09:00:00+09:00", "2026-09-20T09:00:00+09:00", now),
    ).not.toThrow();
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

  describe("ISO8601 의 값까지 본다", () => {
    it("없는 날짜를 거부한다", () => {
      expect(() => resolveTimeRange("2026-02-31T00:00:00+09:00", undefined, now)).toThrow(
        /--from 값을 읽을 수 없습니다/,
      );
      expect(() => resolveTimeRange("2026-99-99T00:00:00+09:00", undefined, now)).toThrow(
        /--from 값을 읽을 수 없습니다/,
      );
    });

    it("범위를 벗어난 시·분·초를 거부한다", () => {
      expect(() => resolveTimeRange("2026-09-20T25:99:99+09:00", undefined, now)).toThrow(
        /--from 값을 읽을 수 없습니다/,
      );
    });

    it("범위를 벗어난 offset 을 거부한다", () => {
      expect(() => resolveTimeRange("2026-09-20T00:00:00+99:99", undefined, now)).toThrow(
        /--from 값을 읽을 수 없습니다/,
      );
      expect(() => resolveTimeRange("2026-09-20T00:00:00+15:00", undefined, now)).toThrow(
        /--from 값을 읽을 수 없습니다/,
      );
    });

    it("실재하는 값은 통과시킨다", () => {
      expect(resolveTimeRange("2028-02-29T23:59:59+14:00", undefined, now).timeMin).toBe(
        "2028-02-29T23:59:59+14:00",
      );
      expect(resolveTimeRange("2026-09-20T00:00:00-12:00", undefined, now).timeMin).toBe(
        "2026-09-20T00:00:00-12:00",
      );
    });
  });
});

/**
 * 서머타임이 자정에 시작하는 지역에서는 그 날 00:00 이 없다.
 * Node 는 실행 중 `process.env.TZ` 변경을 반영하므로 그 지역으로 바꿔 확인한다.
 */
describe("자정에 서머타임이 시작하는 날", () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/Santiago";
  });

  afterEach(() => {
    if (originalTZ == null) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("없는 자정 대신 그 날의 실제 첫 시각을 낸다", () => {
    // 이 장비에 tz 데이터가 없으면 전제가 성립하지 않으므로 먼저 확인한다.
    expect(new Date(2026, 8, 6, 0, 0, 0).getHours()).toBe(1);

    expect(expandDateOnly("2026-09-06", "from")).toBe("2026-09-06T01:00:00-03:00");
  });

  it("하루의 끝은 그대로 23:59:59 다", () => {
    expect(expandDateOnly("2026-09-06", "to")).toBe("2026-09-06T23:59:59-03:00");
  });

  it("그 날 하루가 앞 날로 넘어가지 않는다", () => {
    const range = resolveTimeRange("2026-09-06", undefined, new Date(2026, 8, 6, 12, 0, 0));
    expect(Date.parse(range.timeMin)).toBeGreaterThanOrEqual(
      Date.parse("2026-09-06T00:00:00-04:00"),
    );
    expect(Date.parse(range.timeMin)).toBeLessThan(Date.parse(range.timeMax));
  });
});
