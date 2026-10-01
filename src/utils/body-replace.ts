/**
 * `post replace` 와 `wiki page replace` 가 공유하는 본문 부분 치환 로직.
 *
 * - `--old`/`--old-file`, `--new`/`--new-file` 입력을 읽는다. `-` 는 stdin 이다
 * - 현재 본문에서 old 를 공백·줄바꿈까지 정확히 찾아 바꾼다
 * - `--dry-run` 미리보기용으로 바뀌는 줄만 담은 구간(hunk)을 만든다. 출력은 `formatters/body-replace.ts`
 *
 * 왜 별도 명령인지, 유일성 규칙과 왕복의 한계는 ADR-065 가 소유한다.
 */
import { readTextInput, type TextInputBehavior } from "./body-input.js";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export interface ReplaceInputOptions {
  old?: string;
  oldFile?: string;
  new?: string;
  newFile?: string;
}

export interface ReplaceInputs {
  oldText: string;
  newText: string;
}

const REPLACE_INPUT_BEHAVIOR: TextInputBehavior = {
  stripFileArtifacts: true,
  missingFileAsParamError: true,
};

function usesStdin(text: string | undefined, file: string | undefined): boolean {
  return text === "-" || file === "-";
}

function requireOne(text: string | undefined, file: string | undefined, name: "old" | "new"): void {
  if (text != null && file != null) {
    throw new DoorayCliError(
      `--${name}와 --${name}-file은 함께 사용할 수 없습니다.`,
      EXIT_PARAM_ERROR,
    );
  }
  if (text == null && file == null) {
    throw new DoorayCliError(
      `--${name} 또는 --${name}-file 중 하나를 지정해주세요.`,
      EXIT_PARAM_ERROR,
    );
  }
}

/**
 * old 와 new 를 읽는다. 설정 조회·API 호출 전에 부른다.
 *
 * - 각각 인자와 파일 중 하나만 받는다
 * - stdin 은 한 번만 읽을 수 있어 old 와 new 가 함께 `-` 를 쓰면 거부한다
 * - 옵션 조합 검사를 old·new 모두 끝낸 뒤에 읽는다. stdin 을 다 읽고 나서 조합 오류를 내면
 *   파이프로 보낸 입력이 버려진다
 * - 파일과 stdin 으로 받은 값은 BOM 과 끝 줄바꿈 하나를 뗀다. 인자로 받은 값은 그대로다
 * - old 가 비었거나 old 와 new 가 같으면 바뀔 것이 없어 거부한다
 * - new 는 빈 문자열을 허용한다. old 구간을 지우는 용도다
 */
export async function readReplaceInputs(opts: ReplaceInputOptions): Promise<ReplaceInputs> {
  requireOne(opts.old, opts.oldFile, "old");
  requireOne(opts.new, opts.newFile, "new");
  if (usesStdin(opts.old, opts.oldFile) && usesStdin(opts.new, opts.newFile)) {
    throw new DoorayCliError(
      "old 와 new 가 모두 stdin(-)을 읽을 수 없습니다. 하나는 --old-file/--new-file 에 파일 경로로 주세요.",
      EXIT_PARAM_ERROR,
    );
  }
  const oldText = await readTextInput(
    { text: opts.old, file: opts.oldFile, textFlag: "--old", fileFlag: "--old-file" },
    REPLACE_INPUT_BEHAVIOR,
  );
  const newText = await readTextInput(
    { text: opts.new, file: opts.newFile, textFlag: "--new", fileFlag: "--new-file" },
    REPLACE_INPUT_BEHAVIOR,
  );
  if (oldText.length === 0) {
    throw new DoorayCliError("찾을 문자열(old)이 비어 있습니다.", EXIT_PARAM_ERROR);
  }
  if (oldText === newText) {
    throw new DoorayCliError("old 와 new 가 같아 바뀌는 것이 없습니다.", EXIT_PARAM_ERROR);
  }
  return { oldText, newText };
}

/**
 * needle 이 시작하는 위치를 겹침까지 포함해 모두 찾는다.
 *
 * 유일성 판정에 쓴다. `aaa` 에서 `aa` 는 겹쳐서 두 군데라, 겹침을 빼고 세면
 * 한 군데로 보여 사용자가 의도하지 않은 쪽을 바꿀 수 있다.
 */
export function findOccurrences(haystack: string, needle: string): number[] {
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return positions;
    positions.push(idx);
    from = idx + 1;
  }
}

export interface ReplaceHunk {
  /** 바뀐 구간이 시작하는 줄 번호 (원본 기준, 1부터). */
  line: number;
  /** 원본에서 일치 구간을 포함한 줄 전체. */
  before: string;
  /** 치환 후 같은 자리의 줄 전체. */
  after: string;
}

export interface ReplaceResult {
  content: string;
  /** 실제로 바꾼 위치 수. 같은 줄의 위치는 한 구간으로 합치므로 `hunks.length` 와 다를 수 있다. */
  replaced: number;
  hunks: ReplaceHunk[];
}

function lineStart(text: string, index: number): number {
  // lastIndexOf 는 음수 fromIndex 를 0 으로 바꿔 index 0 의 `\n` 을 찾는다. 위치 0 은 그 자체가 줄 머리다.
  if (index === 0) return 0;
  return text.lastIndexOf("\n", index - 1) + 1;
}

function lineEnd(text: string, index: number): number {
  const nl = text.indexOf("\n", index);
  return nl === -1 ? text.length : nl;
}

/**
 * content 에서 oldText 를 newText 로 바꾼다.
 *
 * - 0건이면 거부한다
 * - 겹침 포함 2건 이상인데 `all` 이 아니면 거부한다
 * - `all` 이면 앞에서부터 겹치지 않는 구간을 모두 바꾼다
 *
 * `String.prototype.replace` 는 쓰지 않는다. 치환 문자열의 `$&`·`$1` 을
 * 패턴으로 해석해 new 에 `$` 가 들어 있으면 결과가 달라진다.
 */
export function applyReplace(
  content: string,
  oldText: string,
  newText: string,
  all: boolean,
): ReplaceResult {
  const occurrences = findOccurrences(content, oldText);
  if (occurrences.length === 0) {
    // 일치 규칙은 정확 일치 그대로 두고, 줄바꿈 형식이 다를 가능성만 알린다.
    const crlfHint = content.includes("\r\n") && !oldText.includes("\r")
      ? "\n  본문의 줄바꿈이 CRLF(\\r\\n)입니다. old 의 줄바꿈이 LF(\\n)면 여러 줄 old 는 일치하지 않습니다."
      : "";
    throw new DoorayCliError(
      "본문에서 old 를 찾지 못했습니다. 공백과 줄바꿈까지 정확히 일치해야 합니다.\n" +
        "  현재 본문은 `post get --json` / `wiki page get --json` 의 body.content 로 확인할 수 있습니다." +
        crlfHint,
      EXIT_PARAM_ERROR,
    );
  }
  if (occurrences.length > 1 && !all) {
    throw new DoorayCliError(
      `본문에서 old 가 ${occurrences.length}군데 일치합니다. 모두 바꾸려면 --all 을, 한 군데만 바꾸려면 앞뒤 문맥을 더 넣어 old 를 유일하게 만들어주세요.`,
      EXIT_PARAM_ERROR,
    );
  }

  // 겹치는 위치를 건너뛰고 실제로 바꿀 위치만 남긴다.
  const targets: number[] = [];
  for (const idx of occurrences) {
    const prev = targets[targets.length - 1];
    if (prev == null || idx >= prev + oldText.length) targets.push(idx);
  }

  const pieces: string[] = [];
  let cursor = 0;
  for (const idx of targets) {
    pieces.push(content.slice(cursor, idx), newText);
    cursor = idx + oldText.length;
  }
  pieces.push(content.slice(cursor));
  const replaced = pieces.join("");

  return { content: replaced, replaced: targets.length, hunks: buildHunks(content, replaced, targets, oldText, newText) };
}

/**
 * 바뀐 위치마다 그 위치를 품은 줄 전체를 원본과 결과에서 잘라 낸다.
 * 같은 줄에 걸치는 위치는 한 구간으로 합친다. 따로 두면 한 구간의 결과 줄에
 * 다른 위치의 치환이 빠져 미리보기와 실제 결과가 달라 보인다.
 */
function buildHunks(
  original: string,
  replaced: string,
  targets: number[],
  oldText: string,
  newText: string,
): ReplaceHunk[] {
  const delta = newText.length - oldText.length;
  const hunks: ReplaceHunk[] = [];
  // 줄 번호는 직전 구간 머리부터 이어서 센다. 구간마다 본문 앞부분을 다시 세면 본문 길이 × 구간 수가 된다.
  let countedTo = 0;
  let line = 1;
  let i = 0;
  while (i < targets.length) {
    const first = i;
    const start = lineStart(original, targets[i]);
    let end = lineEnd(original, targets[i] + oldText.length);
    while (i + 1 < targets.length && targets[i + 1] <= end) {
      i++;
      end = Math.max(end, lineEnd(original, targets[i] + oldText.length));
    }
    const outStart = start + first * delta;
    const outEnd = end + (i + 1) * delta;
    line += countNewlines(original, countedTo, start);
    countedTo = start;
    hunks.push({
      line,
      before: original.slice(start, end),
      after: replaced.slice(outStart, outEnd),
    });
    i++;
  }
  return hunks;
}

function countNewlines(text: string, from: number, to: number): number {
  let n = 0;
  for (let i = from; i < to; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
