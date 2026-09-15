import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
  resolveWiki: vi.fn(),
  readBodyInput: vi.fn(),
  openInEditor: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  client: {
    getWikiPage: vi.fn(),
    updateWikiPage: vi.fn(),
    updateWikiPageTitle: vi.fn(),
    updateWikiPageContent: vi.fn(),
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

vi.mock("../../resolvers/wiki.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resolvers/wiki.js")>();
  return { ...actual, resolveWiki: mocks.resolveWiki };
});

vi.mock("../../editor/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../editor/index.js")>();
  return { ...actual, openInEditor: mocks.openInEditor };
});

vi.mock("../../utils/body-input.js", () => ({
  readBodyInput: mocks.readBodyInput,
}));

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: mocks.stopSpinner,
}));

function page(mimeType?: string) {
  return {
    result: {
      id: "page-1",
      wikiId: "wiki-1",
      version: 1,
      root: false,
      creator: { type: "member", member: { organizationMemberId: "member-1" } },
      subject: "기존 제목",
      ...(mimeType != null && { body: { mimeType, content: "기존 본문" } }),
    },
  };
}

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { wikiPageEditCommand } = await import("./page-edit.js");
  const program = new Command().name("dooray");
  const wikiCommand = new Command("wiki");
  wikiCommand.addCommand(wikiPageEditCommand);
  program.addCommand(wikiCommand);
  return program;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfigOrThrow.mockResolvedValue({
    apiKey: "test-api-key",
    baseUrl: "https://example.dooray.com",
  });
  mocks.resolveWiki.mockResolvedValue("wiki-1");
  mocks.readBodyInput.mockResolvedValue("<p>새 본문</p>");
  mocks.client.updateWikiPage.mockResolvedValue({});
  mocks.client.updateWikiPageTitle.mockResolvedValue({});
  mocks.client.updateWikiPageContent.mockResolvedValue({});
});

describe("wiki page edit mimeType 보존", () => {
  it("--body 만 주면 원본을 조회해 text/html 을 유지한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page("text/html"));
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--body",
      "<p>새 본문</p>",
    ]);

    expect(mocks.client.getWikiPage).toHaveBeenCalledWith("wiki-1", "page-1");
    expect(mocks.client.updateWikiPageContent).toHaveBeenCalledWith("wiki-1", "page-1", {
      body: { mimeType: "text/html", content: "<p>새 본문</p>" },
    });
    stdout.mockRestore();
  });

  it("--title 과 --body 를 함께 주면 text/html 을 유지한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page("text/html"));
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--title",
      "새 제목",
      "--body",
      "<p>새 본문</p>",
    ]);

    expect(mocks.client.updateWikiPage).toHaveBeenCalledWith("wiki-1", "page-1", {
      subject: "새 제목",
      body: { mimeType: "text/html", content: "<p>새 본문</p>" },
    });
    stdout.mockRestore();
  });

  it("--title 만 주면 원본을 조회하지 않는다", async () => {
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--title",
      "새 제목",
    ]);

    expect(mocks.client.getWikiPage).not.toHaveBeenCalled();
    expect(mocks.client.updateWikiPageTitle).toHaveBeenCalledWith("wiki-1", "page-1", {
      subject: "새 제목",
    });
    stdout.mockRestore();
  });

  it("body 가 없는 페이지는 text/x-markdown 으로 폴백한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page(undefined));
    mocks.readBodyInput.mockResolvedValue("새 본문");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "dooray",
      "wiki",
      "edit",
      "my-wiki",
      "page-1",
      "--body",
      "새 본문",
    ]);

    expect(mocks.client.updateWikiPageContent).toHaveBeenCalledWith("wiki-1", "page-1", {
      body: { mimeType: "text/x-markdown", content: "새 본문" },
    });
    stdout.mockRestore();
  });

  it("$EDITOR 수정에서 조회한 페이지의 text/html 을 유지한다", async () => {
    mocks.client.getWikiPage.mockResolvedValue(page("text/html"));
    mocks.openInEditor.mockImplementation(async (original: string) => original + "\n추가");
    const program = await createCommandTree();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(["node", "dooray", "wiki", "edit", "my-wiki", "page-1"]);

    const request = mocks.client.updateWikiPage.mock.calls[0]?.[2];
    expect(request.body.mimeType).toBe("text/html");
    stdout.mockRestore();
  });
});
