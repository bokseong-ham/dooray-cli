import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { MessengerChannel } from "../../api/types.js";
import { buildUntitledLabel, resolveSince } from "./channels.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  ensureMe: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getMessengerChannels: vi.fn(),
    getMemberDetail: vi.fn(),
  },
}));

vi.mock("../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../api/client.js", () => ({
  DoorayApiClient: vi.fn(function MockDoorayApiClient() {
    return mocks.client;
  }),
}));

vi.mock("../../resolvers/me.js", () => ({
  ensureMe: mocks.ensureMe,
}));

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

// ANSI escape 시작 바이트. 리터럴로 두면 편집기에서 보이지 않아 escape 표기로 쓴다.
const ESC = "\u001b";

const ME_ID = "1111222233334444555";
const HONG_ID = "2222333344445555666";
const KIM_ID = "3333444455556666777";
const LEE_ID = "4444555566667777888";
const PARK_ID = "9999888877776666555";
const UNKNOWN_ID = "9999999999999999999";

const NAMES: Record<string, string> = {
  [ME_ID]: "나본인",
  [HONG_ID]: "홍길동",
  [KIM_ID]: "김철수",
  [LEE_ID]: "이영희",
  [PARK_ID]: "박민수",
};

function participant(id: string) {
  return { type: "member", member: { organizationMemberId: id } };
}

function channel(over: Partial<MessengerChannel> & { id: string }): MessengerChannel {
  return {
    title: "",
    type: "private",
    status: "normal",
    displayed: true,
    archivedAt: null,
    updatedAt: "2026-09-10T10:00:00.000+09:00",
    me: { ...participant(ME_ID), role: "member" },
    users: { participants: [participant(ME_ID)] },
    ...over,
  };
}

// 서버 순서를 일부러 섞어 둔다 — 정렬은 클라이언트 몫이다.
const DM_HONG = channel({
  id: "ch-dm-hong",
  type: "direct",
  updatedAt: "2026-09-18T11:38:11.842+09:00",
  users: { participants: [participant(ME_ID), participant(HONG_ID)] },
});
const TEAM = channel({
  id: "ch-team",
  title: "Dev Team 공지",
  updatedAt: "2026-09-20T09:00:00.000+09:00",
  users: { participants: [participant(ME_ID), participant(HONG_ID), participant(KIM_ID)] },
});
const GROUP_SMALL = channel({
  id: "ch-group-small",
  updatedAt: "2026-09-15T08:00:00.000+09:00",
  users: { participants: [participant(ME_ID), participant(KIM_ID), participant(LEE_ID)] },
});
const ARCHIVED = channel({
  id: "ch-archived",
  title: "보관된 방",
  archivedAt: "2026-08-01T00:00:00.000+09:00",
  updatedAt: "2026-09-21T00:00:00.000+09:00",
});
const SYSTEM = channel({
  id: "ch-system",
  title: "시스템 알림",
  status: "system",
  updatedAt: "2026-09-22T00:00:00.000+09:00",
});
const OLD_DM = channel({
  id: "ch-old-dm",
  type: "direct",
  updatedAt: "2026-08-01T12:00:00.000+09:00",
  users: { participants: [participant(ME_ID), participant(PARK_ID)] },
});

// 나를 뺀 참여자가 다섯 명인 제목 없는 그룹방. 표시명에는 앞 셋만 나온다.
const BIG_GROUP_IDS = [ME_ID, HONG_ID, KIM_ID, LEE_ID, PARK_ID, UNKNOWN_ID];
const BIG_GROUP = channel({
  id: "ch-big-group",
  updatedAt: "2026-09-19T10:00:00.000+09:00",
  users: { participants: BIG_GROUP_IDS.map(participant) },
});

const serverChannels = [DM_HONG, ARCHIVED, OLD_DM, TEAM, SYSTEM, GROUP_SMALL];

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { messengerChannelsCommand } = await import("./channels.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  const messengerCommand = new Command("messenger").description("메신저 관련 명령");
  messengerCommand.addCommand(messengerChannelsCommand);
  program.addCommand(messengerCommand);
  return program;
}

let lastStderr = "";

async function run(argv: string[]): Promise<string> {
  const program = await createCommandTree();
  exitOverrideAll(program);
  const chunks: string[] = [];
  const errChunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errChunks.push(String(chunk));
    return true;
  });
  try {
    await program.parseAsync(["node", "dooray", ...argv]);
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    lastStderr = errChunks.join("");
  }
  return chunks.join("");
}

async function runJson(argv: string[]): Promise<MessengerChannel[]> {
  return JSON.parse(await run(["--json", ...argv])) as MessengerChannel[];
}

function setServerChannels(list: MessengerChannel[]): void {
  mocks.client.getMessengerChannels.mockResolvedValue({
    header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
    result: list,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.ensureMe.mockResolvedValue({ id: ME_ID, name: "나본인", orgId: "<orgId>" });
  setServerChannels(serverChannels);
  mocks.client.getMemberDetail.mockImplementation(async (id: string) => {
    if (!NAMES[id]) throw new Error("not found");
    return {
      header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
      result: { id, name: NAMES[id] },
    };
  });
});

describe("messenger channels — 정렬과 필터", () => {
  it("updatedAt 내림차순으로 정렬하고 보관·비정상 방은 기본으로 뺀다", async () => {
    const result = await runJson(["messenger", "channels"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id, DM_HONG.id, GROUP_SMALL.id, OLD_DM.id]);
  });

  it("--all 이면 보관·비정상 방도 포함한다", async () => {
    const result = await runJson(["messenger", "channels", "--all"]);
    expect(result.map((c) => c.id)).toEqual([
      SYSTEM.id,
      ARCHIVED.id,
      TEAM.id,
      DM_HONG.id,
      GROUP_SMALL.id,
      OLD_DM.id,
    ]);
  });

  it("--type direct 는 1:1 방만 남긴다", async () => {
    const result = await runJson(["messenger", "channels", "--type", "direct"]);
    expect(result.map((c) => c.id)).toEqual([DM_HONG.id, OLD_DM.id]);
  });

  it("--type private 는 그룹방만 남긴다", async () => {
    const result = await runJson(["messenger", "channels", "--type", "private"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id, GROUP_SMALL.id]);
  });

  it("--type 에 정해진 값 밖을 주면 commander 가 거부한다", async () => {
    await expect(run(["messenger", "channels", "--type", "public"])).rejects.toThrow(
      /Allowed choices/,
    );
    expect(mocks.client.getMessengerChannels).not.toHaveBeenCalled();
  });
});

describe("messenger channels — --since", () => {
  it("YYYY-MM-DD 는 그 날 00:00 이후 활동한 방만 남긴다", async () => {
    const result = await runJson(["messenger", "channels", "--since", "2026-09-16"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id, DM_HONG.id]);
  });

  it("offset 붙은 ISO 는 그 시각 이후(같은 시각 포함)만 남긴다", async () => {
    const result = await runJson([
      "messenger",
      "channels",
      "--since",
      "2026-09-18T11:38:11.842+09:00",
    ]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id, DM_HONG.id]);
  });

  it("offset 이 달라도 시각으로 비교한다", async () => {
    // 2026-09-18T02:39:00Z = 2026-09-18T11:39:00+09:00 → DM_HONG(11:38:11) 은 빠진다
    const result = await runJson(["messenger", "channels", "--since", "2026-09-18T02:39:00Z"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id]);
  });

  it.each(["2026-09", "2026-02-31", "2026-09-18T25:00:00+09:00", "2026-09-18T10:00:00", "yesterday"])(
    "잘못된 값 %s 은 API 호출 전에 EXIT_PARAM_ERROR 로 거부한다",
    async (value) => {
      await expect(run(["messenger", "channels", "--since", value])).rejects.toSatisfy(
        (err: unknown) => {
          const e = err as { exitCode?: number; message?: string };
          return e.exitCode === 3 && /--since/.test(e.message ?? "");
        },
      );
      expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
      expect(mocks.client.getMessengerChannels).not.toHaveBeenCalled();
    },
  );

  it("resolveSince 는 날짜를 로컬 00:00:00 으로 늘린다", () => {
    expect(resolveSince("2026-09-16")).toMatch(/^2026-09-16T00:00:00[+-]\d{2}:\d{2}$/);
  });
});

describe("messenger channels — --search", () => {
  it("제목을 대소문자 무시 부분일치로 찾는다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "dev team"]);
    expect(result.map((c) => c.id)).toEqual([TEAM.id]);
  });

  it("제목이 빈 1:1 방을 상대 이름으로 찾는다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "홍길"]);
    expect(result.map((c) => c.id)).toEqual([DM_HONG.id]);
  });

  it("제목이 빈 그룹방을 참여자 이름으로 찾는다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "이영희"]);
    expect(result.map((c) => c.id)).toEqual([GROUP_SMALL.id]);
  });

  it("내 이름으로는 제목 없는 방이 걸리지 않는다 (표시명에서 나를 뺀다)", async () => {
    const result = await runJson(["messenger", "channels", "--search", "나본인"]);
    expect(result).toEqual([]);
  });

  it("--search 가 있으면 --json 에서도 제목 없는 방의 참여자만 조회한다", async () => {
    await runJson(["messenger", "channels", "--search", "홍길"]);
    const looked = mocks.client.getMemberDetail.mock.calls.map((c) => c[0]).sort();
    // TEAM 은 제목이 있어 조회 대상이 아니다. 나는 조회하지 않고, 같은 id 는 한 번만 부른다.
    expect(looked).toEqual([HONG_ID, KIM_ID, LEE_ID, PARK_ID].sort());
  });

  it("--json 출력에는 표시명을 끼워넣지 않는다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "홍길"]);
    expect(result[0]).toEqual(DM_HONG);
  });
});

describe("messenger channels — --search 대상과 경고", () => {
  it("표시명에 나오지 않는 4번째 이후 참여자로도 찾는다", async () => {
    setServerChannels([BIG_GROUP]);
    const result = await runJson(["messenger", "channels", "--search", "박민"]);
    expect(result.map((c) => c.id)).toEqual([BIG_GROUP.id]);
  });

  it.each(["확인", "외", "DM", "그룹", "(나)"])(
    "CLI 가 만든 문구 %s 로는 걸리지 않는다",
    async (word) => {
      const selfOnly = channel({ id: "ch-self", type: "direct" });
      const unknownDm = channel({
        id: "ch-unknown-dm",
        type: "direct",
        users: { participants: [ME_ID, UNKNOWN_ID].map(participant) },
      });
      setServerChannels([BIG_GROUP, DM_HONG, selfOnly, unknownDm]);
      const result = await runJson(["messenger", "channels", "--search", word]);
      expect(result).toEqual([]);
    },
  );

  it("이름 조회에 실패한 참여자 수를 stderr 로 알린다", async () => {
    setServerChannels([BIG_GROUP]);
    await run(["--json", "messenger", "channels", "--search", "홍길"]);
    expect(lastStderr).toMatch(/참여자 1명의 이름을 확인하지 못해/);
  });

  it("모두 조회되면 경고하지 않는다", async () => {
    await run(["--json", "messenger", "channels", "--search", "홍길"]);
    expect(lastStderr).not.toMatch(/확인하지 못해/);
  });

  it.each(["", "   "])("빈 검색어 %j 는 API 호출 전에 EXIT_PARAM_ERROR 로 거부한다", async (word) => {
    await expect(run(["messenger", "channels", "--search", word])).rejects.toSatisfy(
      (err: unknown) => (err as { exitCode?: number }).exitCode === 3,
    );
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.client.getMessengerChannels).not.toHaveBeenCalled();
  });

  it("검색어 앞뒤 공백은 뗀다", async () => {
    const result = await runJson(["messenger", "channels", "--search", "  홍길동  "]);
    expect(result.map((c) => c.id)).toEqual([DM_HONG.id]);
  });
});

describe("messenger channels — 이름 조회 시점", () => {
  it("--json 에 --search 가 없으면 멤버를 조회하지 않는다", async () => {
    await runJson(["messenger", "channels"]);
    expect(mocks.client.getMemberDetail).not.toHaveBeenCalled();
    expect(mocks.ensureMe).not.toHaveBeenCalled();
  });

  it("--quiet 에 --search 가 없으면 멤버를 조회하지 않고 id 만 낸다", async () => {
    const out = await run(["--quiet", "messenger", "channels"]);
    expect(out).toBe([TEAM.id, DM_HONG.id, GROUP_SMALL.id, OLD_DM.id].join("\n") + "\n");
    expect(mocks.client.getMemberDetail).not.toHaveBeenCalled();
  });

  it("목록의 me 가 있으면 내 정보를 따로 조회하지 않는다", async () => {
    await run(["messenger", "channels"]);
    expect(mocks.ensureMe).not.toHaveBeenCalled();
  });

  it("나는 조회하지 않는다", async () => {
    await run(["messenger", "channels"]);
    await run(["--json", "messenger", "channels", "--search", "홍"]);
    const looked = mocks.client.getMemberDetail.mock.calls.map((c) => c[0]);
    expect(looked).not.toContain(ME_ID);
  });

  it("표 모드에서 --search 가 없으면 방마다 앞 3명만 조회한다", async () => {
    setServerChannels([BIG_GROUP]);
    const out = await run(["messenger", "channels"]);
    const looked = mocks.client.getMemberDetail.mock.calls.map((c) => c[0]).sort();
    expect(looked).toEqual([HONG_ID, KIM_ID, LEE_ID].sort());
    expect(out).toContain("그룹: 홍길동, 김철수, 이영희 외 2명");
  });

  it("표 모드에 --search 가 있으면 나를 뺀 모든 참여자를 조회한다", async () => {
    setServerChannels([BIG_GROUP]);
    await run(["messenger", "channels", "--search", "박민"]);
    const looked = mocks.client.getMemberDetail.mock.calls.map((c) => c[0]).sort();
    expect(looked).toEqual([HONG_ID, KIM_ID, LEE_ID, PARK_ID, UNKNOWN_ID].sort());
  });

  it("ensureMe 가 실패해도 목록을 내고 그 방은 나를 빼지 않은 채 보인다", async () => {
    mocks.ensureMe.mockRejectedValue(new Error("boom"));
    setServerChannels([{ ...DM_HONG, me: undefined }, TEAM]);
    const out = await run(["messenger", "channels"]);
    expect(out).toContain("Dev Team 공지");
    expect(out).toContain("DM: 나본인, 홍길동");
    expect(lastStderr).toMatch(/내 정보를 확인하지 못해/);
  });

  it("me 가 빠진 제목 없는 방이 있으면 ensureMe 로 나를 가린다", async () => {
    setServerChannels([{ ...DM_HONG, me: undefined }]);
    const out = await run(["messenger", "channels"]);
    expect(mocks.ensureMe).toHaveBeenCalledTimes(1);
    expect(out).toContain("DM: 홍길동");
  });
});

describe("messenger channels — 표 출력", () => {
  it("이름·종류·최근 활동·id 열을 낸다", async () => {
    const out = await run(["messenger", "channels"]);
    expect(out).toContain("이름");
    expect(out).toContain("최근 활동");
    expect(out).toContain("Dev Team 공지");
    expect(out).toContain("DM: 홍길동");
    expect(out).toContain("그룹: 김철수, 이영희");
    // 밀리초가 붙은 +09:00 시각도 offset 과 초를 떼서 보인다
    expect(out).toContain("2026-09-18 11:38");
    expect(out).not.toContain("11:38:11.842");
    expect(out).toContain(DM_HONG.id);
  });

  it("서버 문자열의 control char 를 지운다", async () => {
    setServerChannels([channel({ id: "ch-evil", title: `악성${ESC}[31m방` })]);
    const out = await run(["messenger", "channels"]);
    expect(out).not.toContain(`악성${ESC}`);
    expect(out).toContain("악성?[31m방");
  });
});

describe("messenger channels — 0건", () => {
  beforeEach(() => setServerChannels([]));

  it("표 모드는 안내 문구를 낸다", async () => {
    expect(await run(["messenger", "channels"])).toBe("조건에 맞는 대화방이 없습니다.\n");
  });

  it("--quiet 은 아무것도 내지 않는다", async () => {
    expect(await run(["--quiet", "messenger", "channels"])).toBe("");
  });

  it("--json 은 빈 배열을 낸다", async () => {
    expect(JSON.parse(await run(["--json", "messenger", "channels"]))).toEqual([]);
  });
});

describe("buildUntitledLabel", () => {
  const names = new Map(Object.entries(NAMES));

  it("DM 은 상대 이름 하나", () => {
    expect(buildUntitledLabel(DM_HONG, ME_ID, names)).toBe("DM: 홍길동");
  });

  it("그룹은 3명 이하면 모두 나열한다", () => {
    const ch = channel({
      id: "x",
      users: { participants: [ME_ID, HONG_ID, KIM_ID, LEE_ID].map(participant) },
    });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("그룹: 홍길동, 김철수, 이영희");
  });

  it("그룹은 3명을 넘으면 '외 N명' 으로 줄인다", () => {
    const ch = channel({
      id: "x",
      users: { participants: [ME_ID, HONG_ID, KIM_ID, LEE_ID, PARK_ID, UNKNOWN_ID].map(participant) },
    });
    // 이름을 못 얻은 참여자도 '외 N명' 에 센다
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("그룹: 홍길동, 김철수, 이영희 외 2명");
  });

  it("DM 상대 이름 조회에 실패하면 (상대 미확인)", () => {
    const ch = channel({ id: "x", type: "direct", users: { participants: [ME_ID, UNKNOWN_ID].map(participant) } });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("DM: (상대 미확인)");
  });

  it("그룹 참여자 이름을 하나도 얻지 못하면 (참여자 미확인)", () => {
    const ch = channel({ id: "x", users: { participants: [ME_ID, UNKNOWN_ID].map(participant) } });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("그룹: (참여자 미확인)");
  });

  it("참여자 목록이 없으면 미확인으로 표시한다", () => {
    const ch = channel({ id: "x", type: "direct", users: undefined });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("DM: (상대 미확인)");
  });

  it("나만 있는 방은 (나)", () => {
    const ch = channel({ id: "x", type: "direct" });
    expect(buildUntitledLabel(ch, ME_ID, names)).toBe("DM: (나)");
  });

  it("실제 조회 실패도 표에서 미확인으로 보인다", async () => {
    mocks.client.getMemberDetail.mockRejectedValue(new Error("boom"));
    setServerChannels([DM_HONG]);
    const out = await run(["messenger", "channels"]);
    expect(out).toContain("DM: (상대 미확인)");
  });
});
