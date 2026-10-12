import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveCommentFileInput: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  client: {
    downloadPostFile: vi.fn(),
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

vi.mock("node:fs/promises", () => ({
  writeFile: mocks.writeFile,
  mkdir: mocks.mkdir,
  stat: mocks.stat,
}));

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { downloadCommentFileCommand } = await import("./download.js");
  const program = new Command()
    .name("dooray")
    .option("--json", "JSON 형식으로 출력")
    .option("--quiet", "ID만 출력");
  const postCommand = new Command("post");
  const commentCommand = new Command("comment");
  const fileCommand = new Command("file");
  fileCommand.addCommand(downloadCommentFileCommand);
  commentCommand.addCommand(fileCommand);
  postCommand.addCommand(commentCommand);
  program.addCommand(postCommand);
  return program;
}

const baseArgs = [
  "node", "dooray", "post", "comment", "file", "download",
  "--id", "post-1", "--comment-id", "comment-1", "--file-id", "file-1",
  "--out", "/tmp/out",
];

let written: string;

beforeEach(() => {
  vi.clearAllMocks();
  written = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written += String(chunk);
    return true;
  });
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolveCommentFileInput.mockResolvedValue({
    projectId: "project-1",
    postId: "post-1",
    commentId: "comment-1",
    secondary: "file-1",
  });
  mocks.client.downloadPostFile.mockResolvedValue({
    buffer: new ArrayBuffer(5),
    fileName: "report.txt",
  });
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.stat.mockRejectedValue(new Error("ENOENT"));
});

describe("post comment file download 출력 형식", () => {
  it("plain 모드는 저장 경로 한 줄만 찍는다", async () => {
    const program = await createCommandTree();
    await program.parseAsync(baseArgs);
    expect(written).toBe("/tmp/out/report.txt\n");
  });

  it.each([
    ["명령 앞", ["node", "dooray", "--json", ...baseArgs.slice(2)]],
    ["명령 뒤", [...baseArgs, "--json"]],
  ])("--json 을 %s 에 둬도 stdout 전체가 JSON 이다", async (_label, argv) => {
    const program = await createCommandTree();
    await program.parseAsync(argv);
    expect(JSON.parse(written)).toEqual({
      outputPath: "/tmp/out/report.txt",
      fileName: "report.txt",
      size: 5,
    });
  });

  it("--output-file 은 그 경로로 저장하고 JSON 의 fileName 은 그 이름이다", async () => {
    const program = await createCommandTree();
    await program.parseAsync([...baseArgs.slice(0, -2), "--output-file", "/tmp/x/내 이름.txt", "--json"]);
    expect(mocks.writeFile).toHaveBeenCalledWith("/tmp/x/내 이름.txt", expect.any(Uint8Array));
    expect(JSON.parse(written)).toMatchObject({ outputPath: "/tmp/x/내 이름.txt", fileName: "내 이름.txt" });
  });

  it("--output-file 과 --out 을 함께 주면 --out 을 무시하고 stderr 로 경고한다", async () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const program = await createCommandTree();
    await program.parseAsync([...baseArgs, "--output-file", "/tmp/x/a.txt"]);
    expect(mocks.writeFile).toHaveBeenCalledWith("/tmp/x/a.txt", expect.any(Uint8Array));
    expect(err).toHaveBeenCalledWith(expect.stringContaining("--out"));
  });

  it("--output-file 이 기존 디렉터리면 종료 코드 3 으로 거절한다", async () => {
    mocks.stat.mockResolvedValue({ isDirectory: () => true });
    const program = await createCommandTree();
    await expect(program.parseAsync([...baseArgs.slice(0, -2), "--output-file", "/tmp/x"])).rejects.toMatchObject({ exitCode: 3 });
    expect(mocks.client.downloadPostFile).not.toHaveBeenCalled();
    expect(mocks.startSpinner).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("저장 중 오류가 나면 spinner 를 실패로 닫고 다시 던진다", async () => {
    mocks.writeFile.mockRejectedValue(new Error("EACCES"));
    const program = await createCommandTree();
    await expect(program.parseAsync(baseArgs)).rejects.toThrow("EACCES");
    expect(mocks.stopSpinner).toHaveBeenCalledWith(false);
  });
});
