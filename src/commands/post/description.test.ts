import { describe, expect, it } from "vitest";
import { postWorkflowCommand } from "./workflow.js";
import { postDoneCommand } from "./done.js";

describe("post 명령 설명 문구", () => {
  it("post workflow 의 설명이 업무 상태라는 말을 담는다", () => {
    expect(postWorkflowCommand.description()).toContain("업무 상태");
  });

  it("post workflow 의 설명이 워크플로우라는 종전 낱말을 유지한다", () => {
    expect(postWorkflowCommand.description()).toContain("워크플로우");
  });

  it("post done 의 설명이 업무 완료 처리라는 말을 담는다", () => {
    expect(postDoneCommand.description()).toContain("업무 완료 처리");
  });
});
