import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveCommentFileInput: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    uploadPostFile: vi.fn(),
    getPostComment: vi.fn(),
    updatePostComment: vi.fn(),
  },
}));

vi.mock("../../../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

vi.mock("../../../../api/client.js", () => ({
  DoorayApiClient: vi.fn(function MockDoorayApiClient() {
    return mocks.client;
  }),
}));

vi.mock("../../../../resolvers/comment-file-input.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../../resolvers/comment-file-input.js")
  >();
  return { ...actual, resolveCommentFileInput: mocks.resolveCommentFileInput };
});

vi.mock("../../../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { uploadCommentFileCommand } = await import("./upload.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const postCommand = new Command("post");
  const commentCommand = new Command("comment");
  const fileCommand = new Command("file");
  fileCommand.addCommand(uploadCommentFileCommand);
  commentCommand.addCommand(fileCommand);
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
  mocks.resolveCommentFileInput.mockResolvedValue({
    projectId: "project-1",
    postId: "post-1",
    commentId: "comment-1",
    secondary: "/tmp/report.txt",
  });
  mocks.client.uploadPostFile.mockResolvedValue({ result: { id: "file-1" } });
  mocks.client.updatePostComment.mockResolvedValue({});
});

describe("post comment file upload mimeType 보존", () => {
  it("text/html 댓글에 업로드해도 본문 갱신이 text/html 로 나간다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { id: "comment-1", body: { mimeType: "text/html", content: "<p>기존</p>" } },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "comment",
      "file",
      "upload",
      "--id",
      "post-1",
      "--comment-id",
      "comment-1",
      "--file",
      "/tmp/report.txt",
    ]);

    const request = mocks.client.updatePostComment.mock.calls[0]?.[3];
    expect(request.body.mimeType).toBe("text/html");
    stdout.mockRestore();
  });

  it("markdown 댓글은 그대로 text/x-markdown 으로 나간다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { id: "comment-1", body: { mimeType: "text/x-markdown", content: "기존" } },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "post",
      "comment",
      "file",
      "upload",
      "--id",
      "post-1",
      "--comment-id",
      "comment-1",
      "--file",
      "/tmp/report.txt",
    ]);

    const request = mocks.client.updatePostComment.mock.calls[0]?.[3];
    expect(request.body.mimeType).toBe("text/x-markdown");
    stdout.mockRestore();
  });
});
