/**
 * 서버에서 받은 문자열에 ANSI escape 나 control char 가 들어 있을 수 있어
 * 터미널 변조 방지 목적으로 출력 직전 제거한다.
 * 새 출력 지점은 이 helper 를 재사용한다 (pitfalls: unsanitized-external-string-output).
 */
export function sanitizeForTerminal(text: string): string {
  return text.replace(/[\x00-\x1F\x7F]/g, "?");
}

/**
 * 여러 줄 본문용. 줄바꿈(`\n`)만 살리고 나머지 control char 는 `sanitizeForTerminal` 과 같이 `?` 로 바꾼다.
 *
 * `\r\n` 은 `\n` 으로 접는다. 홀로 선 `\r` 은 커서를 줄 머리로 돌려 앞 글자를 덮어쓸 수 있어 `?` 로 바꾼다.
 * 한 줄 값에는 `sanitizeForTerminal` 을 쓴다 — 거기서 줄바꿈을 살리면 표의 한 칸이 여러 줄로 갈라진다.
 */
export function sanitizeMultilineForTerminal(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "?");
}
