/**
 * 서버에서 받은 문자열에 ANSI escape 나 control char 가 들어 있을 수 있어
 * 터미널 변조 방지 목적으로 출력 직전 제거한다.
 * 새 출력 지점은 이 helper 를 재사용한다 (pitfalls: unsanitized-external-string-output).
 */
export function sanitizeForTerminal(text: string): string {
  return text.replace(/[\x00-\x1F\x7F]/g, "?");
}
