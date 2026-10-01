import { afterEach, describe, expect, it, vi } from "vitest";
import { CR_MARKER, formatHunks, printReplacePreview } from "./body-replace.js";

// ANSI escape 시작 바이트. 리터럴로 두면 편집기에서 보이지 않아 escape 표기로 쓴다.
const ESC = "\u001b";

describe("formatHunks", () => {
  it("바뀌는 줄만 diff 형식으로 낸다", () => {
    const out = formatHunks([{ line: 2, before: "대상 줄", after: "바뀐 줄" }]);
    expect(out).toBe("@@ 1/1 — 2번째 줄 @@\n-대상 줄\n+바뀐 줄\n");
  });

  it("여러 줄 구간은 줄마다 표시를 붙인다", () => {
    const out = formatHunks([{ line: 1, before: "a\nb", after: "c" }]);
    expect(out).toBe("@@ 1/1 — 1번째 줄 @@\n-a\n-b\n+c\n");
  });

  it("서버 본문의 제어문자를 치환한다", () => {
    const out = formatHunks([{ line: 1, before: `${ESC}[31m빨강`, after: "평문" }]);
    expect(out).not.toContain(ESC);
    expect(out).toContain("-?[31m빨강");
  });

  it("탭은 그대로 둔다 (복사해 다음 --old 로 쓸 수 있게)", () => {
    const out = formatHunks([{ line: 1, before: "\t들여쓴 줄", after: "\t\t더 들여쓴 줄" }]);
    expect(out).toContain("-\t들여쓴 줄\n");
    expect(out).toContain("+\t\t더 들여쓴 줄\n");
  });

  it("CR 은 ? 가 아니라 원문 ? 와 구분되는 표기로 보인다", () => {
    const out = formatHunks([{ line: 1, before: "물음?\r\n다음", after: "단독\r끝" }]);
    expect(out).toContain(`-물음?${CR_MARKER}\n-다음\n`);
    expect(out).toContain(`+단독${CR_MARKER}끝\n`);
    expect(out).not.toContain("\r");
    expect(CR_MARKER).not.toBe("?");
  });
});

describe("printReplacePreview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function capture(): () => string {
    let out = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out += String(chunk);
      return true;
    });
    return () => out;
  }

  const result = {
    content: "전체 본문",
    replaced: 2,
    hunks: [{ line: 3, before: "a x x", after: "a y y" }],
  };

  it("--quiet 이면 바뀔 군데 수만 한 줄로 낸다", () => {
    const read = capture();
    printReplacePreview({ quiet: true }, { postId: "post-1" }, result, "text/x-markdown");
    expect(read()).toBe("2\n");
  });

  it("--json 이면 대상 id 와 구간을 구조로 내고 본문 전체는 넣지 않는다", () => {
    const read = capture();
    printReplacePreview({ json: true }, { pageId: "page-1" }, result, "text/html");
    expect(JSON.parse(read())).toEqual({
      dryRun: true,
      pageId: "page-1",
      replaced: 2,
      mimeType: "text/html",
      hunks: result.hunks,
    });
  });

  it("기본 출력은 diff 와 요약 한 줄이다", () => {
    const read = capture();
    printReplacePreview({}, { postId: "post-1" }, result, "text/x-markdown");
    expect(read()).toBe("@@ 1/1 — 3번째 줄 @@\n-a x x\n+a y y\n2군데가 바뀝니다 (dry-run, 수정하지 않음).\n");
  });
});
