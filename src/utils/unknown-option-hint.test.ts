import { describe, it, expect } from "vitest";
import { Command } from "commander";
import {
  parseUnknownOptionName,
  buildUsageHint,
  attachUsageHint,
} from "./unknown-option-hint.js";

describe("parseUnknownOptionName", () => {
  it("긴 옵션에서 이름을 뽑는다", () => {
    expect(parseUnknownOptionName("error: unknown option '--project'")).toBe("project");
  });

  it("짧은 옵션에서 이름을 뽑는다", () => {
    expect(parseUnknownOptionName("error: unknown option '-p'")).toBe("p");
  });

  it("다른 오류에서는 undefined 다", () => {
    expect(
      parseUnknownOptionName("error: required option '--x' not specified"),
    ).toBeUndefined();
  });
});

describe("buildUsageHint", () => {
  const args = ["project", "post-number"];

  it("인자 이름과 정확히 같으면 안내를 만든다", () => {
    const hint = buildUsageHint("project", "dooray post get", args);
    expect(hint).toContain("<project> <post-number>");
    expect(hint).toContain("dooray post get");
  });

  it("인자 이름의 앞부분과 같으면 안내를 만든다", () => {
    const hint = buildUsageHint("post", "dooray post get", args);
    expect(hint).toContain("<project> <post-number>");
  });

  it("앞부분이 같은 인자가 둘이면 빈 문자열이다", () => {
    expect(buildUsageHint("post", "dooray post get", ["post-number", "post-id"])).toBe("");
  });

  it("정확일치가 있으면 앞부분 판정과 무관하게 안내를 만든다", () => {
    const hint = buildUsageHint("post", "dooray post get", ["post", "post-number"]);
    expect(hint).toContain("<post> <post-number>");
  });

  it("인자에 없는 이름이면 빈 문자열이다", () => {
    expect(buildUsageHint("zzz", "dooray post get", args)).toBe("");
  });

  it("이름이 없으면 빈 문자열이다", () => {
    expect(buildUsageHint(undefined, "dooray post get", args)).toBe("");
  });

  it("인자가 없는 명령이면 빈 문자열이다", () => {
    expect(buildUsageHint("project", "dooray post get", [])).toBe("");
  });
});

describe("attachUsageHint", () => {
  function createTree(): { program: Command; written: string[] } {
    const written: string[] = [];
    const program = new Command().name("dooray").exitOverride();
    const postCommand = new Command("post").exitOverride();
    const getCommand = new Command("get")
      .exitOverride()
      .argument("[project]", "프로젝트 코드")
      .argument("[post-number]", "업무 번호")
      .action(() => {});
    postCommand.addCommand(getCommand);
    program.addCommand(postCommand);
    attachUsageHint(program, "");
    for (const cmd of [program, postCommand, getCommand]) {
      const previous = cmd.configureOutput().outputError!;
      cmd.configureOutput({
        outputError: (str) => previous(str, (s) => written.push(s)),
      });
    }
    return { program, written };
  }

  it("두 단계 아래 명령에도 안내가 붙는다", () => {
    const { program, written } = createTree();
    expect(() =>
      program.parse(["node", "dooray", "post", "get", "--project", "x"]),
    ).toThrow();
    expect(written.join("")).toContain("'project' 는 인자로 전달합니다");
  });

  it("안내의 명령 경로가 최상위부터 이어진다", () => {
    const { program, written } = createTree();
    expect(() =>
      program.parse(["node", "dooray", "post", "get", "--project", "x"]),
    ).toThrow();
    expect(written.join("")).toContain("dooray post get <project> <post-number>");
  });
});
