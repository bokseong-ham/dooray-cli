import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { MessengerLog } from "../../api/types.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveMessengerChannel: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getChannelLogs: vi.fn(),
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

vi.mock("../../resolvers/messenger-channel.js", () => ({
  resolveMessengerChannel: mocks.resolveMessengerChannel,
}));

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

const CHANNEL_ID = "1234567890123456789";
const ALICE_ID = "1111222233334444555";
const BOB_ID = "2222333344445555666";

// API 는 seq 내림차순(최신이 앞)으로 준다.
const logs: MessengerLog[] = [
  {
    id: "log-3",
    seq: 3,
    sender: { type: "member", member: { organizationMemberId: ALICE_ID } },
    sentAt: "2026-09-18T11:40:11+09:00",
    text: "세 번째",
  },
  {
    id: "log-2",
    seq: 2,
    sender: { type: "member", member: { organizationMemberId: BOB_ID } },
    sentAt: "2026-09-18T11:39:11+09:00",
    text: "두 번째",
  },
  {
    id: "log-1",
    seq: 1,
    sender: { type: "member", member: { organizationMemberId: ALICE_ID } },
    sentAt: "2026-09-18T11:38:11+09:00",
    text: "첫 번째",
  },
];

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { messengerLogsCommand } = await import("./logs.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  const messengerCommand = new Command("messenger").description("메신저 관련 명령");
  messengerCommand.addCommand(messengerLogsCommand);
  program.addCommand(messengerCommand);
  return program;
}

async function run(argv: string[]): Promise<string> {
  const program = await createCommandTree();
  exitOverrideAll(program);
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    await program.parseAsync(["node", "dooray", ...argv]);
  } finally {
    spy.mockRestore();
  }
  return chunks.join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolveMessengerChannel.mockResolvedValue(CHANNEL_ID);
  mocks.client.getChannelLogs.mockResolvedValue({
    header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
    result: logs,
    hasMore: true,
  });
  mocks.client.getMemberDetail.mockImplementation(async (id: string) => ({
    header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
    result: { id, name: id === ALICE_ID ? "앨리스" : "밥" },
  }));
});

describe("messenger logs", () => {
  it("기본 개수 20을 size 로 전달한다", async () => {
    await run(["messenger", "logs", CHANNEL_ID]);
    expect(mocks.client.getChannelLogs).toHaveBeenCalledWith(CHANNEL_ID, 20);
  });

  it("-n 으로 준 개수를 size 로 전달한다", async () => {
    await run(["messenger", "logs", "대화방이름", "-n", "50"]);
    expect(mocks.resolveMessengerChannel).toHaveBeenCalledWith(mocks.client, "대화방이름");
    expect(mocks.client.getChannelLogs).toHaveBeenCalledWith(CHANNEL_ID, 50);
  });

  it("1000 초과는 거부하고 API 를 부르지 않는다", async () => {
    await expect(run(["messenger", "logs", CHANNEL_ID, "-n", "1001"])).rejects.toThrow(
      /최대 1000/,
    );
    expect(mocks.client.getChannelLogs).not.toHaveBeenCalled();
  });

  it("1000 은 허용한다", async () => {
    await run(["messenger", "logs", CHANNEL_ID, "-n", "1000"]);
    expect(mocks.client.getChannelLogs).toHaveBeenCalledWith(CHANNEL_ID, 1000);
  });

  it("숫자가 아닌 개수는 거부한다", async () => {
    await expect(run(["messenger", "logs", CHANNEL_ID, "-n", "abc"])).rejects.toThrow(
      /양의 정수/,
    );
    expect(mocks.client.getChannelLogs).not.toHaveBeenCalled();
  });

  it("표는 시간 오름차순(최신이 아래)으로 출력한다", async () => {
    const out = await run(["messenger", "logs", CHANNEL_ID]);
    expect(out.indexOf("첫 번째")).toBeLessThan(out.indexOf("두 번째"));
    expect(out.indexOf("두 번째")).toBeLessThan(out.indexOf("세 번째"));
    expect(out).toContain("2026-09-18 11:38");
  });

  it("같은 발신자를 반복 조회하지 않는다", async () => {
    await run(["messenger", "logs", CHANNEL_ID]);
    expect(mocks.client.getMemberDetail).toHaveBeenCalledTimes(2);
    expect(mocks.client.getMemberDetail.mock.calls.map((c) => c[0]).sort()).toEqual(
      [ALICE_ID, BOB_ID].sort(),
    );
  });

  it("이름 조회에 실패하면 id 로 대체하고 명령은 계속한다", async () => {
    mocks.client.getMemberDetail.mockRejectedValue(new Error("404"));
    const out = await run(["messenger", "logs", CHANNEL_ID]);
    expect(out).toContain(ALICE_ID);
    expect(out).toContain("첫 번째");
  });

  it("sender.type 이 member 가 아니면 type 을 보낸이로 쓴다", async () => {
    mocks.client.getChannelLogs.mockResolvedValue({
      header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
      result: [{ id: "log-9", sender: { type: "bot" }, sentAt: "2026-09-18T11:38:11+09:00", text: "봇 메시지" }],
    });
    const out = await run(["messenger", "logs", CHANNEL_ID]);
    expect(out).toContain("bot");
    expect(mocks.client.getMemberDetail).not.toHaveBeenCalled();
  });

  it("--json 은 서버 응답 result 원형을 낸다", async () => {
    const out = await run(["--json", "messenger", "logs", CHANNEL_ID]);
    expect(JSON.parse(out)).toEqual(logs);
    expect(mocks.client.getMemberDetail).not.toHaveBeenCalled();
  });

  it("--quiet 은 로그 id 만 시간 오름차순으로 낸다", async () => {
    const out = await run(["--quiet", "messenger", "logs", CHANNEL_ID]);
    expect(out.trim().split("\n")).toEqual(["log-1", "log-2", "log-3"]);
  });
});

describe("formatSentAt", () => {
  it("ISO8601 을 offset 변환 없이 분 단위로 자른다", async () => {
    const { formatSentAt } = await import("./logs.js");
    expect(formatSentAt("2026-09-18T11:38:11+09:00")).toBe("2026-09-18 11:38");
    expect(formatSentAt(undefined)).toBe("");
    expect(formatSentAt("이상한값")).toBe("이상한값");
  });
});
