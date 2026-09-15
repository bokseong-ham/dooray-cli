import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolvePostInput: vi.fn(),
  readBodyInputOrNull: vi.fn(),
  openInEditor: vi.fn(),
  checkAndGuardDropped: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getPostComments: vi.fn(),
    updatePostComment: vi.fn(),
  },
}));

vi.mock("../../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../../api/client.js", () => ({
  DoorayApiClient: vi.fn(function MockDoorayApiClient() {
    return mocks.client;
  }),
}));

vi.mock("../../../resolvers/post-input.js", () => ({
  resolvePostInput: mocks.resolvePostInput,
}));

vi.mock("../../../utils/body-input.js", () => ({
  readBodyInputOrNull: mocks.readBodyInputOrNull,
}));

vi.mock("../../../editor/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../editor/index.js")>();
  return { ...actual, openInEditor: mocks.openInEditor };
});

vi.mock("../../../utils/attachment-check.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../utils/attachment-check.js")>();
  return { ...actual, checkAndGuardDropped: mocks.checkAndGuardDropped };
});

vi.mock("../../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

function comment(mimeType: string) {
  return {
    id: "comment-1",
    body: { mimeType, content: "기존 댓글" },
    files: [],
  };
}

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { commentEditCommand } = await import("./edit.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const postCommand = new Command("post");
  const commentCommand = new Command("comment");
  commentCommand.addCommand(commentEditCommand);
  postCommand.addCommand(commentCommand);
  program.addCommand(postCommand);
  return program;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolvePostInput.mockResolvedValue({
    projectId: "project-1",
    postId: "post-1",
    postNumber: 42,
    projectCode: "my-project",
  });
  mocks.client.updatePostComment.mockResolvedValue({});
  mocks.checkAndGuardDropped.mockResolvedValue(undefined);
  mocks.readBodyInputOrNull.mockResolvedValue("수정된 댓글");
});

describe("post comment edit mimeType 보존", () => {
  it("text/html 댓글을 수정해도 text/html 로 나간다", async () => {
    mocks.client.getPostComments.mockResolvedValue({ result: [comment("text/html")] });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "comment",
      "edit",
      "--id",
      "post-1",
      "--comment-id",
      "comment-1",
      "--body",
      "수정된 댓글",
    ]);

    expect(mocks.client.updatePostComment).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      "comment-1",
      { body: { mimeType: "text/html", content: "수정된 댓글" } },
    );
    stdout.mockRestore();
  });

  it("markdown 댓글은 그대로 text/x-markdown 으로 나간다", async () => {
    mocks.client.getPostComments.mockResolvedValue({ result: [comment("text/x-markdown")] });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "comment",
      "edit",
      "--id",
      "post-1",
      "--comment-id",
      "comment-1",
      "--body",
      "수정된 댓글",
    ]);

    expect(mocks.client.updatePostComment).toHaveBeenCalledWith(
      "project-1",
      "post-1",
      "comment-1",
      { body: { mimeType: "text/x-markdown", content: "수정된 댓글" } },
    );
    stdout.mockRestore();
  });
});
