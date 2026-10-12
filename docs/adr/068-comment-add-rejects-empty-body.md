## ADR-068: `post comment add` 는 빈 본문을 등록하지 않는다

**결정**: `post comment add` 는 `--body`, `--body-file`(stdin `-` 포함), `$EDITOR` 어느 경로로 받았든
본문이 비었거나 공백뿐이면 resolver 와 API 를 호출하기 전에 `EXIT_PARAM_ERROR`(3)로 끝낸다.
빈 댓글을 일부러 만드는 `--allow-empty` 옵션은 두지 않는다.
검사 대상은 사용자가 준 본문이고, `--mention`, `--link-task` 로 합성하기 전의 값이다.

**맥락**: 이 명령은 빈 본문도 그대로 등록했다. 진단용으로 실행한 `--body-file /dev/null` 이 업무에 빈 댓글을 남겼고,
`comment delete --yes` 로 지워야 했다. `$EDITOR` 경로에는 빈 본문이면 안내만 쓰고 종료 코드 0 으로 끝나는 처리가 이미 있었으나,
자동화는 이 경로를 거치지 않는다. 같은 검사를 세 경로에 하나로 합쳤고, `$EDITOR` 경로의 종료 코드도 0 에서 3 으로 바뀐다.

`--json` 은 `post create` 와 같이 API 응답의 `result` 를 그대로 내고 `--quiet` 은 댓글 id 만 낸다.
전역 옵션이라 명령 앞뒤 어디에 둬도 같다. 이슈 제기 시점(0.24.0)에도 이미 동작해, 코드는 바꾸지 않고 테스트로 고정했다.

**범위 밖**: `post comment edit` 와 `wiki page comment add/edit` 에도 같은 문제가 있는지는 따로 본다.
