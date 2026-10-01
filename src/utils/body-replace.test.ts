import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({ readStdin: vi.fn() }));

vi.mock("./body-input.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./body-input.js")>();
  return { ...actual, readStdin: mocks.readStdin };
});

import { applyReplace, findOccurrences, formatHunks, readReplaceInputs } from "./body-replace.js";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

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
    vi.clearAllMocks();
    dir = await mkdtemp(join(tmpdir(), "body-replace-"));
  });

  afterEach(async () => {
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
    await writeFile(oldPath, "첫 줄\n둘째 줄\n");
    await writeFile(newPath, "바뀐 첫 줄\n바뀐 둘째 줄\n");

    await expect(readReplaceInputs({ oldFile: oldPath, newFile: newPath })).resolves.toEqual({
      oldText: "첫 줄\n둘째 줄\n",
      newText: "바뀐 첫 줄\n바뀐 둘째 줄\n",
    });
  });

  it.each([
    ["--old -", { old: "-", new: "나" }, { oldText: "stdin 값", newText: "나" }],
    ["--old-file -", { oldFile: "-", new: "나" }, { oldText: "stdin 값", newText: "나" }],
    ["--new -", { old: "가", new: "-" }, { oldText: "가", newText: "stdin 값" }],
    ["--new-file -", { old: "가", newFile: "-" }, { oldText: "가", newText: "stdin 값" }],
  ])("%s 는 stdin 에서 읽는다", async (_name, opts, expected) => {
    mocks.readStdin.mockResolvedValue("stdin 값");
    await expect(readReplaceInputs(opts)).resolves.toEqual(expected);
    expect(mocks.readStdin).toHaveBeenCalledOnce();
  });

  it.each([
    [{ old: "-", new: "-" }],
    [{ oldFile: "-", newFile: "-" }],
    [{ old: "-", newFile: "-" }],
    [{ oldFile: "-", new: "-" }],
  ])("old 와 new 가 함께 stdin 을 쓰면 읽기 전에 거부한다 (%o)", async (opts) => {
    await expectParamError(readReplaceInputs(opts), /stdin/);
    expect(mocks.readStdin).not.toHaveBeenCalled();
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
    const out = formatHunks([{ line: 1, before: "\x1b[31m빨강", after: "평문" }]);
    expect(out).not.toContain("\x1b");
    expect(out).toContain("-?[31m빨강");
  });
});
