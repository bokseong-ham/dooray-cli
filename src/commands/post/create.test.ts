import { describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const mocks = vi.hoisted(() => ({
  getConfigOrThrow: vi.fn(),
}));

vi.mock("../../config/store.js", () => ({
  getConfigOrThrow: mocks.getConfigOrThrow,
}));

async function createCommandTree(): Promise<Command> {
  vi.resetModules();
  const { postCreateCommand } = await import("./create.js");
  const program = new Command().name("dooray");
  const postCommand = new Command("post");
  postCommand.addCommand(postCreateCommand);
  program.addCommand(postCommand);
  for (const cmd of [program, postCommand, postCreateCommand]) {
    cmd.exitOverride();
    cmd.configureOutput({ writeErr: () => {} });
  }
  return program;
}

describe("post create 제목 옵션", () => {
  it("제거된 --subject 는 알 수 없는 옵션으로 거절한다", async () => {
    const program = await createCommandTree();

    await expect(
      program.parseAsync(["node", "dooray", "post", "create", "my-project", "--subject", "새 업무"]),
    ).rejects.toThrow(/unknown option '--subject'/);
    expect(mocks.getConfigOrThrow).not.toHaveBeenCalled();
  });
});
