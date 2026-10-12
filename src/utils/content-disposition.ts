// Content-Disposition 헤더에서 저장 파일명을 뽑는 순수 함수 모음 (ADR-067).
// Node fetch 는 헤더 바이트를 Latin-1 로 읽으므로, 서버가 UTF-8 바이트를 그대로 실으면 mojibake 가 된다.
import { basename } from "node:path";

// 파일 시스템 한 이름의 바이트 상한 (APFS·ext4 공통)
export const MAX_FILE_NAME_BYTES = 255;

const ENCODED_WORD = /=\?([^?\s]+)\?([QqBb])\?([^?\s]*)\?=/g;

function decodeBytes(bytes: Buffer, charset: string): string | null {
  try {
    return new TextDecoder(charset.replace(/\*.*$/, ""), { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function decodeQ(text: string): Buffer {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "_") out.push(0x20);
    else if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      out.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(c.charCodeAt(0) & 0xff);
  }
  return Buffer.from(out);
}

// RFC 2047 encoded-word. 인접한 단어 사이의 공백은 버린다. 하나라도 디코딩에 실패하면 null.
function decodeEncodedWords(value: string): string | null {
  if (!new RegExp(ENCODED_WORD.source).test(value)) return value;
  let failed = false;
  const joined = value.replace(
    /(=\?[^?\s]+\?[QqBb]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[QqBb]\?)/g,
    "$1",
  );
  const decoded = joined.replace(ENCODED_WORD, (_m, charset: string, enc: string, text: string) => {
    const bytes = enc.toUpperCase() === "B" ? Buffer.from(text, "base64") : decodeQ(text);
    const s = decodeBytes(bytes, charset);
    if (s === null) {
      failed = true;
      return "";
    }
    return s;
  });
  return failed ? null : decoded;
}

// UTF-8 바이트를 Latin-1 로 읽은 문자열을 되돌린다. 되돌린 결과가 유효한 UTF-8 일 때만 쓴다.
function restoreLatin1Mojibake(value: string): string {
  if (!/[\u0080-ÿ]/.test(value) || /[^\u0000-ÿ]/.test(value)) return value;
  return decodeBytes(Buffer.from(value, "latin1"), "utf-8") ?? value;
}

function decodePercent(value: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractRaw(disposition: string): { value: string; extended: boolean } | null {
  const ext = disposition.match(/filename\*\s*=\s*([^;]*)/i);
  if (ext) {
    const m = ext[1].trim().match(/^([^']*)'[^']*'(.*)$/);
    if (m) {
      const bytes = Buffer.from(
        m[2].replace(/%([0-9A-Fa-f]{2})/g, (_s, h: string) => String.fromCharCode(parseInt(h, 16))),
        "latin1",
      );
      const decoded = decodeBytes(bytes, m[1] || "utf-8");
      if (decoded !== null) return { value: decoded, extended: true };
    }
  }
  const plain = disposition.match(/(?:^|[;\s])filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]*))/i);
  if (!plain) return null;
  const quoted = plain[1] !== undefined;
  const v = quoted ? plain[1].replace(/\\(.)/g, "$1") : plain[2].trim();
  return { value: v, extended: false };
}

// 유효한 저장 이름이면 돌려주고, 쓸 수 없으면 null.
export function sanitizeFileName(name: string): string | null {
  const base = basename(name.replace(/\\/g, "/").normalize("NFC")).replace(/[\u0000-\u001f]/g, "").trim();
  if (!base || base === "." || base === "..") return null;
  if (Buffer.byteLength(base, "utf-8") > MAX_FILE_NAME_BYTES) return null;
  return base;
}

// 헤더에서 파일명을 풀어 NFC 로 정규화한다. 못 풀거나 255 바이트를 넘으면 null.
export function parseContentDispositionFileName(disposition: string | null | undefined): string | null {
  if (!disposition) return null;
  const raw = extractRaw(disposition);
  if (!raw) return null;
  let value: string | null = raw.value;
  if (!raw.extended) {
    value = decodeEncodedWords(value);
    if (value === null) return null;
    value = restoreLatin1Mojibake(decodePercent(value));
  }
  return sanitizeFileName(value);
}

// 대체 이름: 목록의 name(NFC) → <fileId>.<ext>. ext 는 헤더의 원본 이름에서 얻는다.
export function fallbackFileName(
  fileId: string,
  listName: string | undefined,
  disposition: string | null | undefined,
): string {
  const fromList = listName ? sanitizeFileName(listName) : null;
  if (fromList) return fromList;
  const ext = disposition?.match(/\.([A-Za-z0-9]{1,8})(?=["';\s?]|$)/)?.[1];
  return ext ? `${fileId}.${ext}` : fileId;
}
