/**
 * API 경로를 만드는 tagged template (ADR-075).
 *
 * 끼워 넣는 값은 모두 `encodeURIComponent` 를 거친다. `/`·`?`·`#` 가 섞인 id 가 다른 경로를 부르거나
 * 쿼리와 fragment 로 읽히지 않게 하고, 인증 헤더가 의도하지 않은 경로로 가는 것을 막는다.
 * 숫자 id 는 인코딩해도 그대로라 정상 호출의 요청은 달라지지 않는다.
 *
 * 주소 앞부분(`baseUrl`)과 쿼리 문자열 전체, 이미 인코딩된 값은 이 helper 에 끼우지 않는다.
 */
export function apiPath(strings: TemplateStringsArray, ...values: Array<string | number>): string {
  let out = strings[0] ?? "";
  values.forEach((value, i) => {
    out += encodeURIComponent(value) + (strings[i + 1] ?? "");
  });
  return out;
}
