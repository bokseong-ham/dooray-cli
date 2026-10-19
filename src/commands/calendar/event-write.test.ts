import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  ensureMe: vi.fn(),
  client: {
    getCalendars: vi.fn(),
    getCalendarEvent: vi.fn(),
    getMemberDetail: vi.fn(),
    searchMembers: vi.fn(),
    createCalendarEvent: vi.fn(),
    updateCalendarEvent: vi.fn(),
    deleteCalendarEvent: vi.fn(),
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

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

vi.mock("../../resolvers/me.js", () => ({
  ensureMe: mocks.ensureMe,
}));

const CALENDAR_ID = "1111222233334444555";
const MEMBER_ID = "2222333344445555666";
const ME_ID = "3333444455556666777";
const EVENT_ID = "event-1";

function exitOverrideAll(cmd: Command): void {
  cmd.exitOverride();
  cmd.configureOutput({ writeErr: () => {} });
  cmd.commands.forEach(exitOverrideAll);
}

async function run(argv: string[]): Promise<string> {
  vi.resetModules();
  const { calendarCommand } = await import("./index.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  program.addCommand(calendarCommand);
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

const originalTz = process.env.TZ;
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TZ = "Asia/Seoul";
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.ensureMe.mockResolvedValue({ id: ME_ID, name: "나", orgId: "org" });
  mocks.client.getCalendars.mockResolvedValue({
    result: [
      { id: CALENDAR_ID, name: "팀 캘린더", type: "project" },
      { id: "9999888877776666555", name: "공휴일", type: "subscription" },
    ],
  });
  mocks.client.getMemberDetail.mockResolvedValue({ result: { id: MEMBER_ID, name: "김철수" } });
  mocks.client.searchMembers.mockResolvedValue({
    result: [{ id: MEMBER_ID, name: "홍길동" }],
    totalCount: 1,
  });
  mocks.client.createCalendarEvent.mockResolvedValue({ result: { id: EVENT_ID } });
  mocks.client.updateCalendarEvent.mockResolvedValue({ result: null });
  mocks.client.deleteCalendarEvent.mockResolvedValue({ result: null });
  mocks.client.getCalendarEvent.mockResolvedValue({
    result: { id: EVENT_ID, subject: "주간 회의" },
  });
});

afterEach(() => {
  stderr.mockRestore();
  if (originalTz == null) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function expectParamErrorBeforeConfig(promise: Promise<unknown>): Promise<void> {
  return expect(promise)
    .rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR })
    .then(() => {
      expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    });
}

describe("calendar event create", () => {
  it("--title 이 없으면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "create", CALENDAR_ID, "--start", "2026-09-18"]),
    );
  });

  it("--start 가 없으면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "create", CALENDAR_ID, "--title", "휴가"]),
    );
  });

  it("날짜와 일시를 섞으면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run([
        "calendar", "event", "create", CALENDAR_ID,
        "--title", "회의",
        "--start", "2026-09-18",
        "--end", "2026-09-18T10:00:00+09:00",
      ]),
    );
  });

  it("종일 일정을 만들고 한 줄로 알린다", async () => {
    const out = await run([
      "calendar", "event", "create", "팀 캘린더",
      "--title", "휴가",
      "--start", "2026-09-18",
      "--end", "2026-09-19",
    ]);

    expect(mocks.client.createCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, {
      subject: "휴가",
      body: { mimeType: "text/x-markdown", content: "" },
      users: {},
      startedAt: "2026-09-18+09:00",
      endedAt: "2026-09-20+09:00",
      wholeDayFlag: true,
    });
    expect(out).toBe(`일정을 만들었습니다: ${EVENT_ID} (캘린더: 팀 캘린더 (${CALENDAR_ID}))\n`);
  });

  it("--json 은 result 원형, --quiet 은 id", async () => {
    const args = [
      "calendar", "event", "create", CALENDAR_ID,
      "--title", "휴가", "--start", "2026-09-18",
    ];
    expect(JSON.parse(await run(["--json", ...args]))).toEqual({ id: EVENT_ID });
    expect(await run(["--quiet", ...args])).toBe(`${EVENT_ID}\n`);
  });

  it("--dry-run 은 이름을 해석하고 쓰기 API 없이 요청 본문을 낸다", async () => {
    const out = await run([
      "calendar", "event", "create", "팀 캘린더",
      "--title", "회의",
      "--start", "2026-09-20T14:00:00+09:00",
      "--end", "2026-09-20T15:00:00+09:00",
      "--body", "안건",
      "--location", "회의실 A",
      "--alarm", "10m",
      "--alarm", "mail:1d",
      "--private",
      "--repeat", "weekly",
      "--repeat-byday", "TH",
      "--dry-run",
      "--to", "홍길동", "me",
      "--cc", MEMBER_ID,
    ]);

    expect(mocks.client.createCalendarEvent).not.toHaveBeenCalled();
    expect(JSON.parse(out)).toEqual({
      subject: "회의",
      body: { mimeType: "text/x-markdown", content: "안건" },
      location: "회의실 A",
      users: {
        to: [
          { type: "member", member: { organizationMemberId: MEMBER_ID } },
          { type: "member", member: { organizationMemberId: ME_ID } },
        ],
        cc: [{ type: "member", member: { organizationMemberId: MEMBER_ID } }],
      },
      startedAt: "2026-09-20T14:00:00+09:00",
      endedAt: "2026-09-20T15:00:00+09:00",
      wholeDayFlag: false,
      recurrenceRule: {
        frequency: "weekly",
        interval: 1,
        byday: "TH",
        timezoneName: expect.any(String),
      },
      personalSettings: {
        alarms: [
          { action: "app", trigger: "TRIGGER:-PT10M" },
          { action: "mail", trigger: "TRIGGER:-P1D" },
        ],
        class: "private",
      },
    });
  });

  it("--dry-run 도 참석자·본문이 없을 때 실제로 보낼 빈 users·body 를 낸다", async () => {
    const out = await run([
      "calendar", "event", "create", CALENDAR_ID,
      "--title", "휴가", "--start", "2026-09-18", "--dry-run",
    ]);
    expect(mocks.client.createCalendarEvent).not.toHaveBeenCalled();
    expect(JSON.parse(out)).toMatchObject({
      users: {},
      body: { mimeType: "text/x-markdown", content: "" },
    });
  });

  it.each([[["--to", ""]], [["--to", " ", "  "]], [["--cc", " "]]])(
    "참석자 %j 처럼 빈 값만 주면 설정을 읽기 전에 끝낸다",
    async (memberArgs) => {
      await expectParamErrorBeforeConfig(
        run([
          "calendar", "event", "create", CALENDAR_ID,
          "--title", "휴가", "--start", "2026-09-18", ...memberArgs,
        ]),
      );
    },
  );

  it.each([["--json"], ["--quiet"]])(
    "--dry-run 에 전역 %s 를 주면 무시한다고 stderr 로 알린다",
    async (flag) => {
      const out = await run([
        flag, "calendar", "event", "create", CALENDAR_ID,
        "--title", "휴가", "--start", "2026-09-18", "--dry-run",
      ]);
      expect(stderr).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^⚠ .*--dry-run.*${flag} 을 무시`)),
      );
      expect(JSON.parse(out)).toMatchObject({ subject: "휴가" });
    },
  );

  it("--dry-run 만 주면 출력 옵션 경고를 내지 않는다", async () => {
    await run([
      "calendar", "event", "create", CALENDAR_ID,
      "--title", "휴가", "--start", "2026-09-18", "--dry-run",
    ]);
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("--dry-run 은"));
  });

  it("동명이인이 있으면 쓰기 API 를 부르지 않고 끝낸다", async () => {
    mocks.client.searchMembers.mockResolvedValue({
      result: [
        { id: MEMBER_ID, name: "홍길동" },
        { id: ME_ID, name: "홍길동" },
      ],
      totalCount: 2,
    });
    await expect(
      run([
        "calendar", "event", "create", CALENDAR_ID,
        "--title", "회의", "--start", "2026-09-18", "--to", "홍길동",
      ]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(mocks.client.createCalendarEvent).not.toHaveBeenCalled();
  });

  it("본문 없이 --mime-type 만 주면 stderr 로 알리고 무시한다", async () => {
    await run([
      "calendar", "event", "create", CALENDAR_ID,
      "--title", "휴가", "--start", "2026-09-18", "--mime-type", "text/html",
    ]);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("--mime-type 을 무시"));
    expect(mocks.client.createCalendarEvent.mock.calls[0]![1].body).toEqual({
      mimeType: "text/x-markdown",
      content: "",
    });
  });
});

describe("calendar event edit", () => {
  it("수정할 옵션이 없으면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID]));
  });

  it("공백뿐인 --title 은 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--title", "   "]),
    );
  });

  it("--cc 에 빈 값만 주면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--cc", ""]),
    );
  });

  it("--dry-run 에 전역 --json 을 주면 무시한다고 stderr 로 알린다", async () => {
    await run([
      "--json", "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--title", "새 제목", "--dry-run",
    ]);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/^⚠ .*--json 을 무시/));
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
  });

  it("--mime-type 이나 --dry-run 만으로는 수정할 항목이 아니다", async () => {
    await expectParamErrorBeforeConfig(
      run([
        "calendar", "event", "edit", CALENDAR_ID, EVENT_ID,
        "--mime-type", "text/html", "--dry-run",
      ]),
    );
  });

  it("일반 일정에서 --start 만 주면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run([
        "calendar", "event", "edit", CALENDAR_ID, EVENT_ID,
        "--start", "2026-09-20T14:00:00+09:00",
      ]),
    );
  });

  it("빈 본문만 주면 API 를 부르지 않고 끝낸다", async () => {
    await expect(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--body", ""]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
  });

  it("준 옵션의 필드만 보낸다", async () => {
    const out = await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID,
      "--title", "새 제목", "--start", "2026-10-01",
    ]);
    expect(mocks.client.updateCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID, {
      subject: "새 제목",
      startedAt: "2026-10-01+09:00",
      endedAt: "2026-10-02+09:00",
      wholeDayFlag: true,
    });
    expect(out).toBe(`일정을 수정했습니다: ${EVENT_ID} (캘린더: ${CALENDAR_ID})\n`);
  });

  it("--json 은 result 원형(null), --quiet 은 event-id", async () => {
    const args = ["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--location", "회의실 B"];
    expect(JSON.parse(await run(["--json", ...args]))).toBeNull();
    expect(await run(["--quiet", ...args])).toBe(`${EVENT_ID}\n`);
  });

  it("반복 회차 id 는 설정을 읽기 전에 원본 id 를 알려주고 거부한다", async () => {
    const original = "1234567890123456789";
    const promise = run([
      "calendar", "event", "edit", CALENDAR_ID, `${original}-20261109T000000Z`, "--title", "x",
    ]);
    await expect(promise).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringMatching(new RegExp(`반복 전체.*원본 id\\(${original}\\)`, "s")),
    });
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
  });

  it("--cc 만 주면 상세를 조회해 기존 참석자(emailUser 포함)를 함께 보낸다", async () => {
    mocks.client.getCalendarEvent.mockResolvedValue({
      result: {
        id: EVENT_ID,
        users: {
          to: [
            { type: "member", member: { organizationMemberId: ME_ID, name: "나" } },
            { type: "emailUser", emailUser: { emailAddress: "user@example.com", name: "김철수" } },
          ],
          cc: [],
        },
      },
    });
    await run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--cc", MEMBER_ID]);
    expect(mocks.client.getCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID);
    expect(mocks.client.updateCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID, {
      users: {
        to: [
          { type: "member", member: { organizationMemberId: ME_ID } },
          { type: "emailUser", emailUser: { emailAddress: "user@example.com", name: "김철수" } },
        ],
        cc: [{ type: "member", member: { organizationMemberId: MEMBER_ID } }],
      },
    });
  });

  it("--dry-run 에서도 같은 조회로 실제 보낼 users 를 낸다", async () => {
    mocks.client.getCalendarEvent.mockResolvedValue({
      result: { id: EVENT_ID, users: { cc: [{ type: "member", member: { organizationMemberId: ME_ID } }] } },
    });
    const out = await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--to", MEMBER_ID, "--dry-run",
    ]);
    expect(mocks.client.updateCalendarEvent).not.toHaveBeenCalled();
    expect(JSON.parse(out).users).toEqual({
      to: [{ type: "member", member: { organizationMemberId: MEMBER_ID } }],
      cc: [{ type: "member", member: { organizationMemberId: ME_ID } }],
    });
  });

  it("--to 와 --cc 를 둘 다 주면 기존 값을 조회하지 않는다", async () => {
    await run([
      "calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--cc", ME_ID, "--to", MEMBER_ID,
    ]);
    expect(mocks.client.getCalendarEvent).not.toHaveBeenCalled();
    expect(mocks.client.updateCalendarEvent.mock.calls[0]![2].users).toEqual({
      to: [{ type: "member", member: { organizationMemberId: MEMBER_ID } }],
      cc: [{ type: "member", member: { organizationMemberId: ME_ID } }],
    });
  });

  it("--repeat 없이 부속 옵션만 주면 설정을 읽기 전에 끝낸다", async () => {
    await expectParamErrorBeforeConfig(
      run(["calendar", "event", "edit", CALENDAR_ID, EVENT_ID, "--repeat-interval", "2"]),
    );
  });
});

describe("calendar event delete", () => {
  it.each([
    [[], "this"],
    [["--scope", "from-this"], "wholeFromThis"],
    [["--scope", "all"], "whole"],
  ])("%j 는 deleteType %s 로 보낸다", async (scopeArgs, deleteType) => {
    const instanceId = `${EVENT_ID}-20240228T013000Z`;
    const out = await run([
      "calendar", "event", "delete", CALENDAR_ID, instanceId, "-y", ...scopeArgs,
    ]);
    expect(mocks.client.deleteCalendarEvent).toHaveBeenCalledWith(
      CALENDAR_ID,
      instanceId,
      deleteType,
    );
    expect(out).toBe(`일정(${instanceId})을 삭제했습니다.\n`);
  });

  it("이름으로 준 캘린더를 해석한다", async () => {
    await run(["calendar", "event", "delete", "팀 캘린더", EVENT_ID, "--yes"]);
    expect(mocks.client.deleteCalendarEvent).toHaveBeenCalledWith(CALENDAR_ID, EVENT_ID, "this");
  });

  it("모르는 --scope 는 거부한다", async () => {
    await expect(
      run(["calendar", "event", "delete", CALENDAR_ID, EVENT_ID, "-y", "--scope", "future"]),
    ).rejects.toThrow();
    expect(mocks.client.deleteCalendarEvent).not.toHaveBeenCalled();
  });
});
