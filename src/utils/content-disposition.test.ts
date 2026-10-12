import { describe, expect, it } from "vitest";
import {
  fallbackFileName,
  parseContentDispositionFileName as parse,
} from "./content-disposition.js";

// 서버가 UTF-8 바이트를 그대로 싣고 fetch 가 Latin-1 로 읽은 상태를 흉내 낸다
const asLatin1 = (s: string) => Buffer.from(s, "utf-8").toString("latin1");

describe("parseContentDispositionFileName", () => {
  it("ASCII 따옴표 이름", () => {
    expect(parse('attachment; filename="report.txt"')).toBe("report.txt");
  });

  it("따옴표 없는 ASCII 이름", () => {
    expect(parse("attachment; filename=report.txt")).toBe("report.txt");
  });

  it("따옴표 안의 세미콜론을 보존한다", () => {
    expect(parse('attachment; filename="a;b.txt"')).toBe("a;b.txt");
  });

  it("퍼센트 인코딩 UTF-8", () => {
    expect(parse(`attachment; filename="${encodeURIComponent("한글 파일.txt")}"`)).toBe("한글 파일.txt");
  });

  it("filename* (RFC 5987) 이 filename 보다 우선한다", () => {
    const h = `attachment; filename="fallback.txt"; filename*=UTF-8''${encodeURIComponent("한글.txt")}`;
    expect(parse(h)).toBe("한글.txt");
  });

  it("filename* 가 앞에 와도 읽는다", () => {
    const h = `attachment; filename*=UTF-8''${encodeURIComponent("한글.txt")}; filename="x.txt"`;
    expect(parse(h)).toBe("한글.txt");
  });

  it("RFC 2047 Q 인코딩", () => {
    const q = [...Buffer.from("한글 문서.pdf")].map((b) => "=" + b.toString(16).toUpperCase().padStart(2, "0")).join("");
    expect(parse(`attachment; filename="=?UTF-8?Q?${q}?="`)).toBe("한글 문서.pdf");
  });

  it("RFC 2047 Q 인코딩의 밑줄은 공백이다", () => {
    expect(parse('attachment; filename="=?UTF-8?Q?a_b.txt?="')).toBe("a b.txt");
  });

  it("RFC 2047 B 인코딩, 인접 단어를 이어 붙인다", () => {
    const b = (s: string) => Buffer.from(s).toString("base64");
    const h = `attachment; filename="=?UTF-8?B?${b("한글")}?= =?UTF-8?B?${b("파일.txt")}?="`;
    expect(parse(h)).toBe("한글파일.txt");
  });

  it("관찰된 Latin-1 mojibake 를 복원한다", () => {
    expect(parse(`attachment; filename="${asLatin1("한글 파일명 - 왕복 검증.txt")}"`)).toBe("한글 파일명 - 왕복 검증.txt");
  });

  it("유효한 UTF-8 이 아닌 Latin-1 이름은 그대로 둔다", () => {
    expect(parse('attachment; filename="café.txt"')).toBe("café.txt");
  });

  it("NFD 자모를 NFC 로 정규화한다", () => {
    const nfd = "개발가이드.pdf".normalize("NFD");
    const h = `attachment; filename*=UTF-8''${encodeURIComponent(nfd)}`;
    const out = parse(h);
    expect(out).toBe("개발가이드.pdf");
    expect(out).toBe(out?.normalize("NFC"));
  });

  it("경로 요소를 제거한다", () => {
    expect(parse('attachment; filename="../../etc/passwd"')).toBe("passwd");
    expect(parse('attachment; filename="..\\\\win.txt"')).toBe("win.txt");
  });

  it("헤더가 없거나 이름이 없으면 null", () => {
    expect(parse(null)).toBeNull();
    expect(parse("attachment")).toBeNull();
    expect(parse('attachment; filename=".."')).toBeNull();
  });

  it("디코딩할 수 없는 encoded-word 는 null", () => {
    expect(parse('attachment; filename="=?NO-SUCH-CHARSET?Q?abc?="')).toBeNull();
  });

  it("255 바이트를 넘으면 null", () => {
    expect(parse(`attachment; filename*=UTF-8''${encodeURIComponent("가".repeat(86) + ".txt")}`)).toBeNull();
    expect(parse(`attachment; filename*=UTF-8''${encodeURIComponent("가".repeat(80) + ".txt")}`)).not.toBeNull();
  });
});

describe("fallbackFileName", () => {
  it("목록의 name 을 NFC 로 쓴다", () => {
    expect(fallbackFileName("1", "개발.pdf".normalize("NFD"), null)).toBe("개발.pdf");
  });

  it("목록 name 도 쓸 수 없으면 <fileId>.<ext>", () => {
    const long = "가".repeat(90) + ".pdf";
    const h = 'attachment; filename="=?UTF-8?Q?=EA=B0=80?= .pdf"';
    expect(fallbackFileName("123", long, h)).toBe("123.pdf");
  });

  it("확장자도 없으면 fileId 만", () => {
    expect(fallbackFileName("123", undefined, null)).toBe("123");
  });
});
