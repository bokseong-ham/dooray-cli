import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { Post } from "../../api/types.js";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveProject: vi.fn(),
  lookupTagIds: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getPosts: vi.fn(),
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

vi.mock("../../resolvers/project.js", () => ({
  resolveProject: mocks.resolveProject,
}));

vi.mock("../../resolvers/tag.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resolvers/tag.js")>();
  return { ...actual, lookupTagIds: mocks.lookupTagIds };
});

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

function makePost(number: number): Post {
  return {
    id: `post-${number}`,
    subject: `업무 ${number}`,
    number,
    priority: "normal",
    workflowClass: "working",
    workflow: { id: "workflow-1", name: "진행 중" },
    users: {
      from: { type: "member", member: { organizationMemberId: "member-from" } },
      to: [],
      cc: [],
    },
  } as unknown as Post;
}

async function run(args: string[]): Promise<void> {
  vi.resetModules();
  const { postListCommand } = await import("./list.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력")
    .option("--no-color", "색상 비활성화");
  const postCommand = new Command("post").description("업무 관련 명령");
  postCommand.addCommand(postListCommand);
  program.addCommand(postCommand);
  program.exitOverride();
  program.configureOutput({ writeErr: () => {} });

  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "dooray", "post", "list", ...args]);
  } finally {
    stdout.mockRestore();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolveProject.mockResolvedValue("project-1");
  mocks.lookupTagIds.mockImplementation(async (_client, _projectId, names: string[]) =>
    names.map((n) => `tagid-${n}`),
  );
  mocks.client.getPosts.mockResolvedValue({ result: [makePost(1)], totalCount: 1 });
});

describe("post list --tag", () => {
  it("--tag 를 주지 않으면 tagIds 키 자체가 없고 태그 조회도 하지 않는다", async () => {
    await run(["my-project"]);

    expect(mocks.client.getPosts).toHaveBeenCalledOnce();
    const args = mocks.client.getPosts.mock.calls[0][1];
    expect(args).not.toHaveProperty("tagIds");
    expect(mocks.lookupTagIds).not.toHaveBeenCalled();
  });

  it("--tag 하나면 그 이름의 id 하나가 들어간다", async () => {
    await run(["my-project", "--tag", "긴급"]);

    expect(mocks.lookupTagIds).toHaveBeenCalledWith(expect.anything(), "project-1", ["긴급"]);
    expect(mocks.client.getPosts.mock.calls[0][1].tagIds).toEqual(["tagid-긴급"]);
  });

  it("--tag 를 두 번 주면 두 id 가 모두 들어간다", async () => {
    await run(["my-project", "--tag", "긴급", "--tag", "버그"]);

    expect(mocks.client.getPosts.mock.calls[0][1].tagIds).toEqual(["tagid-긴급", "tagid-버그"]);
  });

  it("--all 과 함께 주면 모든 페이지 호출에 같은 tagIds 가 들어간다", async () => {
    mocks.client.getPosts
      .mockResolvedValueOnce({ result: [makePost(1)], totalCount: 2 })
      .mockResolvedValueOnce({ result: [makePost(2)], totalCount: 2 });

    await run(["my-project", "--tag", "긴급", "--all"]);

    expect(mocks.client.getPosts).toHaveBeenCalledTimes(2);
    for (const call of mocks.client.getPosts.mock.calls) {
      expect(call[1].tagIds).toEqual(["tagid-긴급"]);
    }
    // 이름 조회는 페이지마다가 아니라 한 번만 한다.
    expect(mocks.lookupTagIds).toHaveBeenCalledOnce();
  });
});
