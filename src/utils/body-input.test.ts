import { describe, it, expect } from "vitest";
import {
  resolveBodyMimeType,
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

describe("BODY_MIME_TYPES", () => {
  it("markdown 과 html 두 값을 받는다", () => {
    expect(BODY_MIME_TYPES).toEqual([MARKDOWN_MIME, HTML_MIME]);
  });
});
