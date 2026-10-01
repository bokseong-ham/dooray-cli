import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { applyReplace, findOccurrences, readReplaceInputs } from "./body-replace.js";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

/** stdin 을 파이프 입력처럼 바꾼다. 돌려받은 spy 로 stdin 접근 여부를 확인한다. */
function stubStdin(data: string) {
  const stream = Readable.from([Buffer.from(data)]) as Readable & { isTTY?: boolean };
  stream.isTTY = false;
  return vi.spyOn(process, "stdin", "get").mockReturnValue(stream as unknown as typeof process.stdin);
}

async function expectParamError(promise: Promise<unknown>, message: RegExp): Promise<void> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DoorayCliError);
  expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  expect((err as Error).message).toMatch(message);
}

function expectThrowParam(fn: () => unknown, message: RegExp): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(DoorayCliError);
  expect((caught as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
  expect((caught as Error).message).toMatch(message);
}

describe("readReplaceInputs", () => {
  let dir: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    dir = await mkdtemp(join(tmpdir(), "body-replace-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("인자로 받은 old·new 를 그대로 돌려준다", async () => {
    await expect(readReplaceInputs({ old: "가", new: "나" })).resolves.toEqual({
      oldText: "가",
      newText: "나",
    });
  });

  it("파일에서 여러 줄 old·new 를 읽는다", async () => {
    const oldPath = join(dir, "old.txt");
    const newPath = join(dir, "new.txt");
    await writeFile(oldPath, "첫 줄\n둘째 줄");
    await writeFile(newPath, "바뀐 첫 줄\n바뀐 둘째 줄");

    await expect(readReplaceInputs({ oldFile: oldPath, newFile: newPath })).resolves.toEqual({
      oldText: "첫 줄\n둘째 줄",
      newText: "바뀐 첫 줄\n바뀐 둘째 줄",
    });
  });

  it("파일 입력은 UTF-8 BOM 과 끝 줄바꿈 하나를 뗀다", async () => {
    const oldPath = join(dir, "old.txt");
    const newPath = join(dir, "new.txt");
    await writeFile(oldPath, "\uFEFF첫 줄\n둘째 줄\n");
    await writeFile(newPath, "바뀐 줄\r\n");

    await expect(readReplaceInputs({ oldFile: oldPath, newFile: newPath })).resolves.toEqual({
      oldText: "첫 줄\n둘째 줄",
      newText: "바뀐 줄",
    });
  });

  it("끝 줄바꿈은 하나만 뗀다", async () => {
    const oldPath = join(dir, "old.txt");
    await writeFile(oldPath, "문단\n\n");

    await expect(readReplaceInputs({ oldFile: oldPath, new: "x" })).resolves.toEqual({
      oldText: "문단\n",
      newText: "x",
    });
  });

  it("stdin 입력도 BOM 과 끝 줄바꿈을 뗀다", async () => {
    stubStdin("\uFEFF파이프 값\n");
    await expect(readReplaceInputs({ old: "가", new: "-" })).resolves.toEqual({
      oldText: "가",
      newText: "파이프 값",
    });
  });

  it("인자로 준 값은 BOM·끝 줄바꿈을 그대로 둔다", async () => {
    await expect(readReplaceInputs({ old: "\uFEFF줄\n", new: "바뀐 줄\n" })).resolves.toEqual({
      oldText: "\uFEFF줄\n",
      newText: "바뀐 줄\n",
    });
  });

  it("없는 파일은 종료 코드 3", async () => {
    await expectParamError(
      readReplaceInputs({ oldFile: join(dir, "missing.txt"), new: "x" }),
      /파일을 찾을 수 없습니다/,
    );
  });

  it("new 가 빠졌으면 stdin 을 읽기 전에 거부한다", async () => {
    const stdin = stubStdin("버려지면 안 되는 입력");
    await expectParamError(readReplaceInputs({ old: "-" }), /--new 또는 --new-file/);
    expect(stdin).not.toHaveBeenCalled();
  });

  it("new 가 상호배타를 어기면 stdin 을 읽기 전에 거부한다", async () => {
    const stdin = stubStdin("버려지면 안 되는 입력");
    await expectParamError(
      readReplaceInputs({ oldFile: "-", new: "a", newFile: join(dir, "x") }),
      /--new와 --new-file/,
    );
    expect(stdin).not.toHaveBeenCalled();
  });

  it.each([
    ["--old -", { old: "-", new: "나" }, { oldText: "stdin 값", newText: "나" }],
    ["--old-file -", { oldFile: "-", new: "나" }, { oldText: "stdin 값", newText: "나" }],
    ["--new -", { old: "가", new: "-" }, { oldText: "가", newText: "stdin 값" }],
    ["--new-file -", { old: "가", newFile: "-" }, { oldText: "가", newText: "stdin 값" }],
  ])("%s 는 stdin 에서 읽는다", async (_name, opts, expected) => {
    stubStdin("stdin 값");
    await expect(readReplaceInputs(opts)).resolves.toEqual(expected);
  });

  it.each([
    [{ old: "-", new: "-" }],
    [{ oldFile: "-", newFile: "-" }],
    [{ old: "-", newFile: "-" }],
    [{ oldFile: "-", new: "-" }],
  ])("old 와 new 가 함께 stdin 을 쓰면 읽기 전에 거부한다 (%o)", async (opts) => {
    const stdin = stubStdin("x");
    await expectParamError(readReplaceInputs(opts), /stdin/);
    expect(stdin).not.toHaveBeenCalled();
  });

  it("--old 와 --old-file 을 함께 주면 거부한다", async () => {
    await expectParamError(
      readReplaceInputs({ old: "가", oldFile: join(dir, "x"), new: "나" }),
      /--old와 --old-file/,
    );
  });

  it("--new 와 --new-file 을 함께 주면 거부한다", async () => {
    await expectParamError(
      readReplaceInputs({ old: "가", new: "나", newFile: join(dir, "x") }),
      /--new와 --new-file/,
    );
  });

  it("old 가 없으면 거부한다", async () => {
    await expectParamError(readReplaceInputs({ new: "나" }), /--old 또는 --old-file/);
  });

  it("new 가 없으면 거부한다", async () => {
    await expectParamError(readReplaceInputs({ old: "가" }), /--new 또는 --new-file/);
  });

  it("old 가 빈 문자열이면 거부한다", async () => {
    await expectParamError(readReplaceInputs({ old: "", new: "나" }), /비어 있습니다/);
  });

  it("new 는 빈 문자열을 허용한다 (구간 삭제)", async () => {
    await expect(readReplaceInputs({ old: "가", new: "" })).resolves.toEqual({
      oldText: "가",
      newText: "",
    });
  });

  it("old 와 new 가 같으면 거부한다", async () => {
    await expectParamError(readReplaceInputs({ old: "같음", new: "같음" }), /같아/);
  });
});

describe("findOccurrences", () => {
  it("겹치는 위치까지 센다", () => {
    expect(findOccurrences("aaa", "aa")).toEqual([0, 1]);
  });

  it("없으면 빈 배열", () => {
    expect(findOccurrences("abc", "x")).toEqual([]);
  });
});

describe("applyReplace", () => {
  it("정확히 한 군데면 그곳만 바꾼다", () => {
    const result = applyReplace("앞\n대상 줄\n뒤", "대상", "바뀐", false);
    expect(result.content).toBe("앞\n바뀐 줄\n뒤");
    expect(result.replaced).toBe(1);
    expect(result.hunks).toEqual([{ line: 2, before: "대상 줄", after: "바뀐 줄" }]);
  });

  it("0건이면 공백·줄바꿈 안내와 함께 거부한다", () => {
    expectThrowParam(() => applyReplace("본문", "없음", "x", false), /공백과 줄바꿈까지/);
  });

  it("공백이 다르면 일치로 보지 않는다", () => {
    expectThrowParam(() => applyReplace("a  b", "a b", "x", false), /찾지 못했습니다/);
  });

  it("2건 이상인데 --all 이 없으면 개수와 함께 거부한다", () => {
    expectThrowParam(() => applyReplace("x y x z x", "x", "w", false), /3군데.*--all/);
  });

  it("겹쳐서 두 군데인 것도 모호하다고 거부한다", () => {
    expectThrowParam(() => applyReplace("aaa", "aa", "b", false), /2군데/);
  });

  it("--all 이면 전부 바꾼다", () => {
    const result = applyReplace("x\ny\nx\nz\nx", "x", "w", true);
    expect(result.content).toBe("w\ny\nw\nz\nw");
    expect(result.replaced).toBe(3);
    expect(result.hunks.map((h) => h.line)).toEqual([1, 3, 5]);
  });

  it("--all 은 겹치는 위치를 건너뛰고 앞에서부터 바꾼다", () => {
    const result = applyReplace("aaaa", "aa", "b", true);
    expect(result.content).toBe("bb");
    expect(result.replaced).toBe(2);
  });

  it("여러 줄 old·new 를 바꾼다", () => {
    const content = "# 제목\n\n- 첫째\n- 둘째\n- 셋째\n\n끝";
    const result = applyReplace(content, "- 첫째\n- 둘째\n", "- 하나\n- 둘\n- 추가\n", false);
    expect(result.content).toBe("# 제목\n\n- 하나\n- 둘\n- 추가\n- 셋째\n\n끝");
    expect(result.hunks[0]?.line).toBe(3);
  });

  it("new 의 $ 문자를 치환 패턴으로 해석하지 않는다", () => {
    const result = applyReplace("가격: X", "X", "$& $1 $$", false);
    expect(result.content).toBe("가격: $& $1 $$");
  });

  it("같은 줄의 여러 위치는 한 구간으로 합친다", () => {
    const result = applyReplace("a x b x c\n다음", "x", "yy", true);
    expect(result.replaced).toBe(2);
    expect(result.hunks).toEqual([{ line: 1, before: "a x b x c", after: "a yy b yy c" }]);
  });

  it("앞 치환으로 길이가 달라져도 뒤 구간의 결과 줄이 맞다", () => {
    const result = applyReplace("x\n중간\nx 끝", "x", "길어진 값", true);
    expect(result.hunks).toEqual([
      { line: 1, before: "x", after: "길어진 값" },
      { line: 3, before: "x 끝", after: "길어진 값 끝" },
    ]);
  });
});

describe("applyReplace 경계", () => {
  it("본문이 \\n 으로 시작하고 위치 0 에서 일치해도 구간이 실제 결과와 같다", () => {
    const result = applyReplace("\nfoo\nbar", "\nfoo", "foo", false);
    expect(result.content).toBe("foo\nbar");
    expect(result.hunks).toEqual([{ line: 1, before: "\nfoo", after: "foo" }]);
  });

  it("위치 0 의 일반 문자 일치", () => {
    const result = applyReplace("foo\nbar", "foo", "baz", false);
    expect(result.hunks).toEqual([{ line: 1, before: "foo", after: "baz" }]);
  });

  it("줄 번호를 구간마다 이어서 센다", () => {
    const content = Array.from({ length: 10 }, (_, i) => `줄${i + 1} x`).join("\n");
    const result = applyReplace(content, "x", "y", true);
    expect(result.hunks.map((h) => h.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("CRLF 본문에서 0건이고 old 에 CR 이 없으면 안내를 덧붙인다", () => {
    expectThrowParam(() => applyReplace("첫째\r\n둘째", "첫째\n둘째", "x", false), /CRLF/);
  });

  it("CRLF 본문이어도 old 에 CR 이 있으면 정확 일치로 바꾼다", () => {
    const result = applyReplace("첫째\r\n둘째", "첫째\r\n둘째", "x", false);
    expect(result.content).toBe("x");
  });

  it("LF 본문의 0건에는 CRLF 안내가 없다", () => {
    let message = "";
    try {
      applyReplace("첫째\n둘째", "없음", "x", false);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain("CRLF");
  });
});
