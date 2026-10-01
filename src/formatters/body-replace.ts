/**
 * `post replace` 와 `wiki page replace` 의 `--dry-run` 출력.
 *
 * 바뀌는 줄만 diff 형식으로 보인다. 본문 전체는 내지 않는다 (ADR-065).
 */
import type { ReplaceHunk, ReplaceResult } from "../utils/body-replace.js";
import { sanitizeMultilineForTerminal } from "../utils/sanitize.js";
import { printJson, type OutputOptions } from "./table.js";

/**
 * 미리보기에서 CR 을 보일 표기. 원문의 `?` 나 본문에 글자 그대로 적힌 `\r` 과
 * 헷갈리지 않게 하고, 터미널 폰트에 따라 깨지는 유니코드 기호는 피해 ASCII 로 둔다.
 */
export const CR_MARKER = "<CR>";

function sanitizePreview(text: string): string {
  // 정확 일치 명령이라 사용자가 미리보기를 복사해 다음 --old 를 만든다. 탭을 `?` 로 바꾸면 그 복사본이
  // 일치하지 않으므로 탭은 그대로 두고, CR 은 보이는 표기로 남긴다.
  return sanitizeMultilineForTerminal(text, { keepTab: true, crMarker: CR_MARKER });
}

/** 사람용 diff. 서버 본문 조각이라 제어문자를 치환한다. */
export function formatHunks(hunks: ReplaceHunk[]): string {
  const out: string[] = [];
  hunks.forEach((h, i) => {
    out.push(`@@ ${i + 1}/${hunks.length} — ${h.line}번째 줄 @@`);
    for (const l of sanitizePreview(h.before).split("\n")) out.push(`-${l}`);
    for (const l of sanitizePreview(h.after).split("\n")) out.push(`+${l}`);
  });
  return out.join("\n") + "\n";
}

/**
 * `--dry-run` 결과를 출력 모드에 맞게 낸다.
 *
 * - `--json`: `{ dryRun, <대상 id>, replaced, mimeType, hunks }`
 * - `--quiet`: 바뀔 군데 수 한 줄
 * - 기본: diff 와 요약 한 줄
 */
export function printReplacePreview(
  globalOpts: OutputOptions,
  target: Record<string, string>,
  result: ReplaceResult,
  mimeType: string,
): void {
  if (globalOpts.json) {
    printJson({ dryRun: true, ...target, replaced: result.replaced, mimeType, hunks: result.hunks });
  } else if (globalOpts.quiet) {
    process.stdout.write(`${result.replaced}\n`);
  } else {
    process.stdout.write(formatHunks(result.hunks));
    process.stdout.write(`${result.replaced}군데가 바뀝니다 (dry-run, 수정하지 않음).\n`);
  }
}
