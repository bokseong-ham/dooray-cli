import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolvePostInput: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  promptDeletion: vi.fn(),
  client: {
    deletePostComment: vi.fn(),
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

vi.mock("../../../resolvers/post-input.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../resolvers/post-input.js")>();
  return { ...actual, resolvePostInput: mocks.resolvePostInput };
});

vi.mock("../../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
  setQuiet: vi.fn(),
}));

vi.mock("../../../utils/delete-confirmation.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../utils/delete-confirmation.js")
  >();
  return { ...actual, promptDeletion: mocks.promptDeletion };
});

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { commentDeleteCommand } = await import("./delete.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const postCommand = new Command("post");
  const commentCommand = new Command("comment");
  commentCommand.addCommand(commentDeleteCommand);
  postCommand.addCommand(commentCommand);
  program.addCommand(postCommand);
  return program;
}

const baseArgs = [
  "node",
  "dooray",
  "post",
  "comment",
  "delete",
  "<project>",
  "42",
  "comment-1",
];

let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolvePostInput.mockResolvedValue({
    projectId: "project-1",
    postId: "post-1",
  });
  mocks.client.deletePostComment.mockResolvedValue({});
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  stdout.mockRestore();
  stderr.mockRestore();
});

function written(): string {
  return stdout.mock.calls.map((c: unknown[]) => c[0]).join("");
}

describe("post comment delete 의 출력 모드", () => {
  it("--json 은 commentId 와 status 를 낸다", async () => {
    const program = await createCommandTree();

    await program.parseAsync([...baseArgs, "-y", "--json"]);

    expect(JSON.parse(written())).toEqual({
      commentId: "comment-1",
      status: "deleted",
    });
  });

  it("--quiet 은 댓글 id 한 줄이다", async () => {
    const program = await createCommandTree();

    await program.parseAsync([...baseArgs, "-y", "--quiet"]);

    expect(written()).toBe("comment-1\n");
  });

  it("기본 모드는 종전 문구를 그대로 낸다", async () => {
    const program = await createCommandTree();

    await program.parseAsync([...baseArgs, "-y"]);

    expect(written()).toBe("댓글이 삭제되었습니다: comment-1\n");
  });

  it("확인에서 거절하면 삭제 API 를 부르지 않고 stdout 이 비어 있다", async () => {
    mocks.promptDeletion.mockResolvedValue(false);
    const isTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });
    const program = await createCommandTree();

    await program.parseAsync(baseArgs);

    Object.defineProperty(process.stdin, "isTTY", {
      value: isTTY,
      configurable: true,
    });
    expect(mocks.client.deletePostComment).not.toHaveBeenCalled();
    expect(written()).toBe("");
  });
});
