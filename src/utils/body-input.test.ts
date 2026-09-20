import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveBodyMimeType,
  warnUnconvertedBody,
  MARKDOWN_MIME,
  HTML_MIME,
  BODY_MIME_TYPES,
} from "./body-input.js";

describe("resolveBodyMimeType", () => {
  it("override 가 있으면 기존 값보다 우선한다", () => {
    expect(resolveBodyMimeType(HTML_MIME, MARKDOWN_MIME)).toBe(MARKDOWN_MIME);
    expect(resolveBodyMimeType(MARKDOWN_MIME, HTML_MIME)).toBe(HTML_MIME);
  });

  it("override 가 없으면 기존 값을 보존한다", () => {
    expect(resolveBodyMimeType(HTML_MIME)).toBe(HTML_MIME);
    expect(resolveBodyMimeType(MARKDOWN_MIME)).toBe(MARKDOWN_MIME);
  });

  it("기존 값이 undefined 면 markdown 으로 폴백한다", () => {
    expect(resolveBodyMimeType(undefined)).toBe(MARKDOWN_MIME);
  });

  it("기존 값이 빈 문자열이어도 markdown 으로 폴백한다", () => {
    expect(resolveBodyMimeType("")).toBe(MARKDOWN_MIME);
  });

  it("기존 값이 빈 문자열이어도 override 는 그대로 채택한다", () => {
    expect(resolveBodyMimeType("", HTML_MIME)).toBe(HTML_MIME);
  });
});

describe("warnUnconvertedBody", () => {
  function captureStderr() {
    let output = "";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    return { spy, read: () => output };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("본문을 바꾸지 않고 형식만 바꾸면 경고한다", () => {
    const stderr = captureStderr();
    warnUnconvertedBody(MARKDOWN_MIME, HTML_MIME, false);
    expect(stderr.read()).toContain(HTML_MIME);
    expect(stderr.read()).toContain("본문을 변환하지 않으므로");
  });

  it("본문을 함께 바꾸면 경고하지 않는다", () => {
    const stderr = captureStderr();
    warnUnconvertedBody(MARKDOWN_MIME, HTML_MIME, true);
    expect(stderr.read()).toBe("");
  });

  it("--mime-type 이 없으면 경고하지 않는다", () => {
    const stderr = captureStderr();
    warnUnconvertedBody(MARKDOWN_MIME, undefined, false);
    expect(stderr.read()).toBe("");
  });

  it("지정한 값이 기존 형식과 같으면 경고하지 않는다", () => {
    const stderr = captureStderr();
    warnUnconvertedBody(HTML_MIME, HTML_MIME, false);
    expect(stderr.read()).toBe("");
  });

  it("기존 값이 없을 때 markdown 을 지정하면 경고하지 않는다", () => {
    const stderr = captureStderr();
    warnUnconvertedBody(undefined, MARKDOWN_MIME, false);
    expect(stderr.read()).toBe("");
  });
});

describe("BODY_MIME_TYPES", () => {
  it("markdown 과 html 두 값을 받는다", () => {
    expect(BODY_MIME_TYPES).toEqual([MARKDOWN_MIME, HTML_MIME]);
  });
});
