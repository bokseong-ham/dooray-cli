import { describe, expect, it, vi } from "vitest";
import type { DoorayApiClient } from "../api/client.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { resolveOrganizationMember } from "./member.js";

vi.mock("../cache/store.js", () => ({
  getMembers: vi.fn().mockResolvedValue(null),
  setMembers: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockReturnValue(true),
}));

const ID_A = "1111222233334444555";
const ID_B = "2222333344445555666";

function mockClient(searchMembers: (p: any) => Promise<any>): DoorayApiClient {
  return {
    getMemberDetail: vi.fn().mockResolvedValue({ result: { id: ID_A, name: "홍길동" } }),
    searchMembers: vi.fn(searchMembers),
  } as unknown as DoorayApiClient;
}

const noMe = (): Promise<string> => Promise.reject(new Error("me 를 부르면 안 된다"));

describe("resolveOrganizationMember", () => {
  it("me 는 내 id 로 바꾼다", async () => {
    const client = mockClient(vi.fn());
    expect(await resolveOrganizationMember(client, "me", () => Promise.resolve(ID_B))).toBe(ID_B);
    expect(client.searchMembers).not.toHaveBeenCalled();
  });

  it("id 는 상세 조회로 확인하고 그대로 쓴다", async () => {
    const client = mockClient(vi.fn());
    expect(await resolveOrganizationMember(client, ID_A, noMe)).toBe(ID_A);
  });

  it("조직에 없는 이메일은 외부 사용자로 보내지 않고 거부한다", async () => {
    const client = mockClient(() => Promise.resolve({ result: [], totalCount: 0 }));
    await expect(
      resolveOrganizationMember(client, "user@example.com", noMe),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
  });

  it("이름은 정확일치만 인정한다", async () => {
    const client = mockClient(() =>
      Promise.resolve({
        result: [
          { id: ID_A, name: "홍길동" },
          { id: ID_B, name: "홍길동2" },
        ],
        totalCount: 2,
      }),
    );
    expect(await resolveOrganizationMember(client, "홍길동", noMe)).toBe(ID_A);
    expect(client.searchMembers).toHaveBeenCalledWith(
      expect.objectContaining({ name: "홍길동", page: 0 }),
    );
  });

  it("부분일치만 있으면 거부한다", async () => {
    const client = mockClient(() =>
      Promise.resolve({ result: [{ id: ID_B, name: "홍길동2" }], totalCount: 1 }),
    );
    await expect(resolveOrganizationMember(client, "홍길동", noMe)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("찾을 수 없습니다"),
    });
  });

  it("동명이인이면 이름과 id 를 나열하고 거부한다", async () => {
    const client = mockClient(() =>
      Promise.resolve({
        result: [
          { id: ID_A, name: "홍길동" },
          { id: ID_B, name: "홍길동" },
        ],
        totalCount: 2,
      }),
    );
    await expect(resolveOrganizationMember(client, "홍길동", noMe)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringMatching(new RegExp(`여럿.*${ID_A}.*${ID_B}`, "s")),
    });
  });

  it("검색 결과가 여러 쪽이면 다음 쪽도 본다", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({
        result: Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `홍길동${i}` })),
        totalCount: 101,
      })
      .mockResolvedValueOnce({ result: [{ id: ID_B, name: "홍길동" }], totalCount: 101 });
    const client = mockClient(search);
    expect(await resolveOrganizationMember(client, "홍길동", noMe)).toBe(ID_B);
    expect(search).toHaveBeenCalledTimes(2);
  });

  describe("쪽 상한(5쪽)에 닿았을 때", () => {
    const filler = (page: number) =>
      Array.from({ length: 100 }, (_, i) => ({ id: `${page}-${i}`, name: `홍길동${i}` }));

    function pagedSearch(exactOnPages: Record<number, string[]>) {
      return vi.fn(({ page }: { page: number }) =>
        Promise.resolve({
          result: [
            ...filler(page).slice((exactOnPages[page] ?? []).length),
            ...(exactOnPages[page] ?? []).map((id) => ({ id, name: "홍길동" })),
          ],
          totalCount: 10000,
        }),
      );
    }

    it("정확일치가 한 명이면 그 id 를 쓴다", async () => {
      const search = pagedSearch({ 2: [ID_A] });
      expect(await resolveOrganizationMember(mockClient(search), "홍길동", noMe)).toBe(ID_A);
      expect(search).toHaveBeenCalledTimes(5);
    });

    it("정확일치가 둘 이상이면 동명이인 오류다", async () => {
      const search = pagedSearch({ 0: [ID_A], 4: [ID_B] });
      await expect(resolveOrganizationMember(mockClient(search), "홍길동", noMe)).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringMatching(new RegExp(`여럿.*${ID_A}.*${ID_B}`, "s")),
      });
    });

    it("정확일치가 없을 때만 결과가 너무 많다고 알린다", async () => {
      const search = pagedSearch({});
      await expect(resolveOrganizationMember(mockClient(search), "홍길동", noMe)).rejects.toMatchObject({
        exitCode: EXIT_PARAM_ERROR,
        message: expect.stringContaining("너무 많습니다"),
      });
      expect(search).toHaveBeenCalledTimes(5);
    });
  });
});
