import { describe, it, expect, vi } from "vitest";
import {
  buildOrganizationMemberNameMap,
  resolveMember,
  resolveMemberByIdOrEmail,
} from "./member.js";
import type { DoorayApiClient } from "../api/client.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR } from "../utils/exit-codes.js";

vi.mock("../cache/store.js", () => ({
  getMembers: vi.fn().mockResolvedValue(null),
  setMembers: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockReturnValue(true),
}));

function mockClient(opts: {
  getMemberDetail?: (id: string) => Promise<any>;
  searchMembers?: (p: any) => Promise<any>;
  getProjectMembers?: (...args: any[]) => Promise<any>;
}): DoorayApiClient {
  return {
    getMemberDetail: opts.getMemberDetail ?? vi.fn(),
    searchMembers: opts.searchMembers ?? vi.fn(),
    getProjectMembers:
      opts.getProjectMembers ??
      vi.fn().mockResolvedValue({ result: [], totalCount: 0 }),
  } as unknown as DoorayApiClient;
}

describe("resolveMember 입력 자동 분기", () => {
  it("15자리 이상 숫자 → getMemberDetail 호출 후 input 반환", async () => {
    const id = "1234567890123456789";
    const client = mockClient({
      getMemberDetail: vi
        .fn()
        .mockResolvedValue({ result: { id, name: "X" } }),
    });
    expect(await resolveMember(client, "proj", id)).toBe(id);
  });

  it("15자리 이상 숫자 + getMemberDetail 404 (DoorayCliError + EXIT_API_ERROR) → '찾을 수 없습니다' 메시지", async () => {
    // toDoorayCliError 가 404 HTTP 에러에 EXIT_API_ERROR 부여 — 실제 동작 mirror
    const client = mockClient({
      getMemberDetail: vi
        .fn()
        .mockRejectedValue(new DoorayCliError("API 호출 실패: not found", EXIT_API_ERROR)),
    });
    await expect(
      resolveMember(client, "proj", "1234567890123456789"),
    ).rejects.toThrow(/찾을 수 없습니다/);
  });

  it("15자리 이상 숫자 + 네트워크/5xx 에러 → 원본 에러 그대로 re-throw", async () => {
    const networkErr = new Error("ECONNREFUSED");
    const client = mockClient({
      getMemberDetail: vi.fn().mockRejectedValue(networkErr),
    });
    await expect(
      resolveMember(client, "proj", "1234567890123456789"),
    ).rejects.toBe(networkErr);
  });

  it("이메일 형식 → searchMembers 1건 시 id 반환", async () => {
    const client = mockClient({
      searchMembers: vi.fn().mockResolvedValue({
        result: [{ id: "9876543210987654321", name: "X" }],
        totalCount: 1,
      }),
    });
    expect(await resolveMember(client, "proj", "user@example.com")).toBe(
      "9876543210987654321",
    );
  });

  it("이메일 형식 + 0건 → '이메일로 멤버를 찾을 수 없습니다'", async () => {
    const client = mockClient({
      searchMembers: vi
        .fn()
        .mockResolvedValue({ result: [], totalCount: 0 }),
    });
    await expect(
      resolveMember(client, "proj", "missing@example.com"),
    ).rejects.toThrow(/이메일로 멤버를 찾을 수 없습니다/);
  });

  it("이메일 형식 + 2건 이상 → '이메일 매칭이 모호합니다' + 후보", async () => {
    const client = mockClient({
      searchMembers: vi.fn().mockResolvedValue({
        result: [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
        ],
        totalCount: 2,
      }),
    });
    await expect(
      resolveMember(client, "proj", "dup@example.com"),
    ).rejects.toThrow(/복수의 멤버가 매칭됩니다\(이메일\).*A.*B/s);
  });

  it("이름 입력 (기존 matchByName 분기) → ensureMembers 경로 사용", async () => {
    const client = mockClient({
      getProjectMembers: vi.fn().mockResolvedValue({
        result: [{ organizationMemberId: "1234567890123456789" }],
        totalCount: 1,
      }),
      getMemberDetail: vi
        .fn()
        .mockResolvedValue({ result: { name: "홍길동" } }),
    });
    await expect(
      resolveMember(client, "proj", "홍길동"),
    ).resolves.toBeDefined();
  });
});

describe("resolveMemberByIdOrEmail (messenger --to 공유 헬퍼)", () => {
  it("15자리 이상 숫자 → getMemberDetail 호출 후 input 반환", async () => {
    const id = "1234567890123456789";
    const client = mockClient({
      getMemberDetail: vi.fn().mockResolvedValue({ result: { id, name: "X" } }),
    });
    expect(await resolveMemberByIdOrEmail(client, id)).toBe(id);
  });

  it("이메일 형식 → searchMembers 1건 시 id 반환", async () => {
    const client = mockClient({
      searchMembers: vi.fn().mockResolvedValue({
        result: [{ id: "9876543210987654321", name: "X" }],
        totalCount: 1,
      }),
    });
    expect(
      await resolveMemberByIdOrEmail(client, "user@example.com"),
    ).toBe("9876543210987654321");
  });

  it("id/email 어느 쪽에도 매칭 안 되는 입력(이름) → null 반환 (matchByName 호출 없음)", async () => {
    const client = mockClient({});
    expect(await resolveMemberByIdOrEmail(client, "홍길동")).toBeNull();
  });
});

describe("buildOrganizationMemberNameMap", () => {
  const A = "1111222233334444555";
  const B = "2222333344445555666";

  it("중복 id 는 한 번만 조회한다", async () => {
    const getMemberDetail = vi.fn(async (id: string) => ({ result: { id, name: `이름-${id}` } }));
    const client = mockClient({ getMemberDetail });

    const map = await buildOrganizationMemberNameMap(client, [A, B, A, B, A]);

    expect(getMemberDetail).toHaveBeenCalledTimes(2);
    expect(map.get(A)).toBe(`이름-${A}`);
    expect(map.get(B)).toBe(`이름-${B}`);
  });

  it("조회를 병렬로 낸다", async () => {
    let inFlight = 0;
    let peak = 0;
    const getMemberDetail = vi.fn(async (id: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { result: { id, name: `이름-${id}` } };
    });
    const client = mockClient({ getMemberDetail });

    await buildOrganizationMemberNameMap(client, [A, B]);

    expect(peak).toBe(2);
  });

  it("일부 조회가 실패해도 나머지를 채우고 실패한 id 는 map 에 넣지 않는다", async () => {
    const getMemberDetail = vi.fn(async (id: string) => {
      if (id === A) throw new Error("404");
      return { result: { id, name: `이름-${id}` } };
    });
    const client = mockClient({ getMemberDetail });

    const map = await buildOrganizationMemberNameMap(client, [A, B]);

    expect(map.has(A)).toBe(false);
    expect(map.get(B)).toBe(`이름-${B}`);
  });

  it("이름이 빈 값이면 map 에 넣지 않는다", async () => {
    const client = mockClient({
      getMemberDetail: vi.fn(async (id: string) => ({ result: { id, name: "" } })),
    });
    expect((await buildOrganizationMemberNameMap(client, [A])).has(A)).toBe(false);
  });

  it("빈 목록이면 조회하지 않는다", async () => {
    const getMemberDetail = vi.fn();
    const client = mockClient({ getMemberDetail });
    expect((await buildOrganizationMemberNameMap(client, [])).size).toBe(0);
    expect(getMemberDetail).not.toHaveBeenCalled();
  });
});
