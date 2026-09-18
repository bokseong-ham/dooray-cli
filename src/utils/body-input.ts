import { readFile } from "node:fs/promises";
import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export interface BodyInputOptions {
  body?: string;
  bodyFile?: string;
}

/** 두레이 본문 mimeType — API 값 그대로 사용한다 (별칭 매핑 없음). */
export const MARKDOWN_MIME = "text/x-markdown";
export const HTML_MIME = "text/html";

/** `--mime-type` 옵션이 받는 값 목록. */
export const BODY_MIME_TYPES = [MARKDOWN_MIME, HTML_MIME];

/**
 * 수정 요청에 실을 본문 mimeType 을 고른다.
 *
 * - `override`(`--mime-type`)가 있으면 그 값
 * - 없으면 기존 글의 mimeType 보존
 * - 기존 값이 없거나 빈 문자열이면 markdown 폴백
 *
 * 빈 문자열을 폴백으로 넘기는 이유는, 그대로 채택하면 `mimeType: ""` 이
 * 요청에 실려 나가기 때문이다. 타입상 `mimeType` 은 필수 `string` 이라
 * 이 폴백이 발동하는 것은 응답이 타입 선언과 어긋났다는 뜻이다.
 */
export function resolveBodyMimeType(
  existing: string | undefined,
  override?: string,
): string {
  return override ?? (existing || undefined) ?? MARKDOWN_MIME;
}

/**
 * `--body` / `--body-file` 옵션을 받아 본문 문자열을 돌려준다.
 *
 * - 둘 중 하나만 지정 가능. 동시 지정 시 에러.
 * - 값이 `"-"`이면 stdin에서 읽음.
 * - 둘 다 비어있으면 빈 문자열 반환 (호출자 책임으로 의미 해석).
 */
export async function readBodyInput(opts: BodyInputOptions): Promise<string> {
  if (opts.body != null && opts.bodyFile != null) {
    throw new DoorayCliError(
      "--body와 --body-file은 함께 사용할 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }
  if (opts.bodyFile) {
    if (opts.bodyFile === "-") return readStdin();
    return readFile(opts.bodyFile, "utf-8");
  }
  if (opts.body === "-") return readStdin();
  return opts.body ?? "";
}

/**
 * `readBodyInput`의 null-friendly variant.
 *
 * - body/bodyFile 둘 다 미지정 시 `null` 반환 (호출자가 "본문 유지" / "$EDITOR 폴백" 등으로 해석)
 * - 동시 지정 시 에러 (`readBodyInput`과 동일)
 * - 하나만 지정 시 해당 값 반환 (`readBodyInput`과 동일)
 */
export async function readBodyInputOrNull(
  opts: BodyInputOptions,
): Promise<string | null> {
  if (opts.body == null && opts.bodyFile == null) return null;
  return readBodyInput(opts);
}

export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new DoorayCliError(
      "stdin에서 읽으려면 파이프로 데이터를 전달해주세요.",
      EXIT_PARAM_ERROR,
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
