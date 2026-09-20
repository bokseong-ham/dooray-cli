import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolvePostInput: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  client: {
    getPostFiles: vi.fn(),
    getPost: vi.fn(),
    downloadPostFile: vi.fn(),
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

vi.mock("node:fs/promises", () => ({
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}));

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { fileDownloadAllCommand } = await import("./download-all.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const postCommand = new Command("post");
  const fileCommand = new Command("file");
  fileCommand.addCommand(fileDownloadAllCommand);
  postCommand.addCommand(fileCommand);
  program.addCommand(postCommand);
  return program;
}

function postBody(content: string) {
  return {
    result: { body: { mimeType: "text/x-markdown", content } },
  };
}

const baseArgs = ["node", "dooray", "post", "file", "download-all", "<project>", "42"];

let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolvePostInput.mockResolvedValue({
    projectId: "project-1",
    postId: "post-1",
  });
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.client.getPost.mockResolvedValue(postBody(""));
  mocks.client.downloadPostFile.mockImplementation(
    async (_projectId: string, _postId: string, fileId: string) => ({
      buffer: new ArrayBuffer(1),
      fileName: `${fileId}.png`,
    }),
  );
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  stdout.mockRestore();
  stderr.mockRestore();
  process.exitCode = undefined;
});

describe("post file download-all 의 본문 참조 합치기", () => {
  it("첨부가 없어도 본문 참조 둘을 받는다", async () => {
    mocks.client.getPostFiles.mockResolvedValue({ result: [] });
    mocks.client.getPost.mockResolvedValue(
      postBody("![a.png](/files/111)\n![b.png](/files/222)"),
    );
    const program = await createCommandTree();

    await program.parseAsync([...baseArgs, "--json"]);

    expect(mocks.client.downloadPostFile).toHaveBeenCalledTimes(2);
    const printed = JSON.parse(stdout.mock.calls.at(-1)?.[0] as string);
    expect(printed.count).toBe(2);
  });

  it("첨부와 본문에 같은 id 가 있으면 한 번만 받는다", async () => {
    mocks.client.getPostFiles.mockResolvedValue({
      result: [{ id: "111", name: "a.png", size: 1 }],
    });
    mocks.client.getPost.mockResolvedValue(postBody("![a.png](/files/111)"));
    const program = await createCommandTree();

    await program.parseAsync([...baseArgs, "--json"]);

    expect(mocks.client.downloadPostFile).toHaveBeenCalledTimes(1);
  });

  it("--no-inline 은 상세를 조회하지 않고 종전 문구를 낸다", async () => {
    mocks.client.getPostFiles.mockResolvedValue({ result: [] });
    mocks.client.getPost.mockResolvedValue(
      postBody("![a.png](/files/111)\n![b.png](/files/222)"),
    );
    const program = await createCommandTree();

    await program.parseAsync([...baseArgs, "--no-inline"]);

    expect(mocks.client.getPost).not.toHaveBeenCalled();
    expect(mocks.client.downloadPostFile).not.toHaveBeenCalled();
    expect(stdout.mock.calls.map((c: unknown[]) => c[0]).join("")).toContain(
      "첨부파일이 없습니다.",
    );
  });

  it("기본 호출은 본문 참조가 없어도 상세를 한 번 조회한다", async () => {
    mocks.client.getPostFiles.mockResolvedValue({
      result: [{ id: "111", name: "a.png", size: 1 }],
    });
    mocks.client.getPost.mockResolvedValue(postBody("참조 없는 본문"));
    const program = await createCommandTree();

    await program.parseAsync([...baseArgs, "--json"]);

    expect(mocks.client.getPost).toHaveBeenCalledTimes(1);
    const printed = JSON.parse(stdout.mock.calls.at(-1)?.[0] as string);
    expect(printed.count).toBe(1);
  });

  it("본문 항목의 다운로드가 실패하면 failed 에 담기고 종료 코드가 1 이다", async () => {
    mocks.client.getPostFiles.mockResolvedValue({ result: [] });
    mocks.client.getPost.mockResolvedValue(postBody("![a.png](/files/111)"));
    mocks.client.downloadPostFile.mockRejectedValue(new Error("권한 없음"));
    const program = await createCommandTree();

    await program.parseAsync([...baseArgs, "--json"]);

    const printed = JSON.parse(stdout.mock.calls.at(-1)?.[0] as string);
    expect(printed.failed).toEqual([{ fileId: "111", error: "권한 없음" }]);
    expect(process.exitCode).toBe(1);
  });

  it("진행 출력의 개수가 합친 목록의 길이다", async () => {
    mocks.client.getPostFiles.mockResolvedValue({
      result: [{ id: "111", name: "a.png", size: 1 }],
    });
    mocks.client.getPost.mockResolvedValue(postBody("![b.png](/files/222)"));
    const program = await createCommandTree();

    await program.parseAsync(baseArgs);

    expect(mocks.stopSpinner).toHaveBeenCalledWith(true, "2개 파일 다운로드 시작");
  });
});
