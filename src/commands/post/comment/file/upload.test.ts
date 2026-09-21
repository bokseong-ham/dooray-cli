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

const args = [
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
];

describe("post comment file upload 본문 형식 판정", () => {
  it("text/html 댓글은 파일을 올리기 전에 EXIT_PARAM_ERROR 로 거절한다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { id: "comment-1", body: { mimeType: "text/html", content: "<p>기존</p>" } },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(program.parseAsync(args)).rejects.toMatchObject({ exitCode: 3 });

    expect(mocks.client.uploadPostFile).not.toHaveBeenCalled();
    expect(mocks.client.updatePostComment).not.toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("댓글 조회는 업로드보다 앞서고 한 번만 부른다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { id: "comment-1", body: { mimeType: "text/x-markdown", content: "기존" } },
    });
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(args);

    expect(mocks.client.getPostComment).toHaveBeenCalledOnce();
    expect(
      mocks.client.getPostComment.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.client.uploadPostFile.mock.invocationCallOrder[0]);
    stdout.mockRestore();
  });
});

describe("post comment file upload mimeType 보존", () => {
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

  it("댓글 조회가 실패하면 스피너를 멈추고 파일을 올리지 않는다", async () => {
    const error = new Error("ECONNRESET");
    mocks.client.getPostComment.mockRejectedValueOnce(error);
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(
      program.parseAsync([
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
      ]),
    ).rejects.toBe(error);

    expect(mocks.stopSpinner).toHaveBeenCalledWith(false, "");
    expect(mocks.client.uploadPostFile).not.toHaveBeenCalled();
    stdout.mockRestore();
  });
});

describe("post comment file upload mimeType 폴백", () => {
  it("body.mimeType 이 없으면 text/x-markdown 으로 나간다", async () => {
    mocks.client.getPostComment.mockResolvedValue({
      result: { id: "comment-1", body: { content: "기존" } },
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

  it("댓글 조회가 실패하면 스피너를 멈추고 파일을 올리지 않는다", async () => {
    const error = new Error("ECONNRESET");
    mocks.client.getPostComment.mockRejectedValueOnce(error);
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(
      program.parseAsync([
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
      ]),
    ).rejects.toBe(error);

    expect(mocks.stopSpinner).toHaveBeenCalledWith(false, "");
    expect(mocks.client.uploadPostFile).not.toHaveBeenCalled();
    stdout.mockRestore();
  });
});
