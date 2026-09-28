import { describe, expect, it } from "vitest";
import { formatParticipation } from "./participation.js";

// ANSI escape 시작 바이트. 리터럴로 두면 편집기에서 보이지 않아 escape 표기로 쓴다.
const ESC = "\u001b";

describe("formatParticipation", () => {
  it("참석자는 응답과 함께 적는다", () => {
    expect(formatParticipation({ userType: "to", status: "accepted" })).toBe("참석·수락");
    expect(formatParticipation({ userType: "to", status: "declined" })).toBe("참석·거절");
    expect(formatParticipation({ userType: "to", status: "tentative" })).toBe("참석·미정");
  });

  it("참조자도 응답과 함께 적는다", () => {
    expect(formatParticipation({ userType: "cc", status: "not_confirmed" })).toBe("참조·미응답");
  });

  it("등록자는 수락이면 주최만 적는다", () => {
    expect(formatParticipation({ userType: "from", status: "accepted" })).toBe("주최");
  });

  it("등록자라도 수락이 아닌 응답이면 붙인다", () => {
    expect(formatParticipation({ userType: "from", status: "declined" })).toBe("주최·거절");
  });

  it("응답이 없으면 역할만 적는다", () => {
    expect(formatParticipation({ userType: "to" })).toBe("참석");
  });

  it("참여자가 아니면 빈 칸이다", () => {
    expect(formatParticipation({ type: "member", member: { organizationMemberId: "member-1" } })).toBe("");
    expect(formatParticipation(undefined)).toBe("");
    expect(formatParticipation(null)).toBe("");
  });

  it("알 수 없는 값은 원형을 보여준다", () => {
    expect(formatParticipation({ userType: "guest", status: "maybe" })).toBe("guest·maybe");
  });

  it("알 수 없는 값의 control char 는 ? 로 바꾼다", () => {
    expect(formatParticipation({ userType: `to${ESC}[31m`, status: `ok${ESC}` })).toBe("to?[31m·ok?");
  });

  it("Object 원형의 속성 이름을 라벨로 오인하지 않는다", () => {
    expect(formatParticipation({ userType: "toString" })).toBe("toString");
  });
});
