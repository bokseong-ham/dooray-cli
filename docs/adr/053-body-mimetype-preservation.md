## ADR-053: 본문을 수정할 때 기존 mimeType 을 보존하고 `--mime-type` 으로 덮어쓴다

**결정**: 기존 글의 본문을 수정하는 경로는 그 글의 `mimeType` 을 그대로 유지한다.
새 content 의 형식이 기존과 다르면 `--mime-type` 으로 명시한다.
새로 만드는 경로는 종전대로 `text/x-markdown` 이 기본이다.

| 경로 | mimeType |
| --- | --- |
| `post edit` / `post comment edit` / `wiki page edit` | 기존 값 보존, `--mime-type` 으로 덮어쓰기 |
| `post comment file upload` / `delete` (reference 갱신) | 기존 값 보존 |
| `post create` / `post comment add` / `wiki page create` | `text/x-markdown` 고정 (변경 없음) |

**맥락**: 기존 글의 본문을 수정하는 경로가 update 요청에 `text/x-markdown` 을 하드코딩하고 있었다.
그래서 `text/html` 로 작성된 업무·댓글·위키 페이지를 CLI 로 수정하면 `mimeType` 이 `text/x-markdown` 으로 바뀌었다.
본문의 HTML 태그는 그대로 남으므로, 표의 셀 배경이나 rowspan 으로 정보를 표현한 문서는 서식이 통째로 깨진다.

`priority` 와 `dueDate` 와 `content` 는 같은 호출에서 기존 값을 보존하고 있었다. `mimeType` 만 빠져 있었다.

저장소에 markdown 고정을 정한 ADR 은 없었다. 의도한 설계가 아니라 누락으로 판단한다.

**실측으로 확인한 것**:

`mimeType` 이 `text/html` 인 업무를 `post edit --body-file` 로 수정하면 `text/x-markdown` 으로 바뀐다.
본문 내용은 보낸 그대로 저장되고 `mimeType` 만 달라진다.

update API 는 write 에서 `text/html` 을 그대로 받는다.
`text/html` 로 지정해 업무를 저장하고 웹에서 표가 서식대로 렌더링되는 것을 확인했다.
따라서 읽은 값을 그대로 돌려보내는 것이 안전하다.

**보존만으로는 부족한 이유 (설계 결정)**:

CLI 는 **새 content 가 무슨 형식인지 알 수 없다.**
`--body` 와 `--body-file` 은 본문을 통째로 교체하는데, 사용자가 무엇을 주는지는 인자 안에만 있다.

`text/html` 페이지에 `wiki page edit <project> <page-id> --body-file notes.md` 로 마크다운을 주면,
기존 값을 보존한 결과 마크다운 원문이 `text/html` 로 저장된다.
보존이 항상 옳다고 두면 이 경로는 종전보다 나빠진다.

그래서 보존을 기본으로 두되 사용자가 형식을 말할 수단을 함께 둔다.

- 옵션은 `--mime-type <type>` 이고 값은 `text/x-markdown` 과 `text/html` 이다.
- 값은 API 값을 그대로 쓴다. `--json` 의 `body.mimeType` 과 같은 문자열이라 조회 결과를 그대로 옮겨 쓸 수 있다.
- `wiki page edit` 의 비대화형 분기는 보존할 값을 얻으려고 `GET` 을 한 번 더 부른다.
  `--mime-type` 을 받으면 그 조회를 건너뛴다. 제목만 수정하는 경로는 본문을 건드리지 않으므로 조회가 없다.
- 값을 고르는 우선순위(지정값 → 기존값 → markdown 폴백)는 `resolveBodyMimeType` 한 곳에 둔다.
  호출부마다 폴백을 기억하면 빠뜨린다. 실제로 `post comment edit` 은 상세가 아니라 목록 응답에서 값을 꺼내므로 누락에 대비해야 한다.
- `post edit` 과 `post comment edit` 의 `--dry-run --json` 미리보기에 `mimeType` 필드를 더한다.
  무엇이 나갈지 보여주는 것이 `--dry-run` 의 목적이고, 이 변경에서 달라지는 값이 그것이다.
  기존 키는 그대로 두고 더하기만 하므로 응답을 읽던 쪽은 영향을 받지 않는다.

**대안 기각**:

- **종전대로 markdown 고정** — 원래 문제가 그대로다. `text/html` 문서를 CLI 로 한 번 수정하면 서식이 깨지고, CLI 안에서는 되돌릴 수단이 없다.
- **`--body` / `--body-file` 은 markdown 고정하고 `$EDITOR` 왕복만 보존** — `text/html` 문서를 파일로 수정하는 것이 이 문제가 드러나는 주된 경로다. 그 경로를 종전대로 두면 고치려던 것이 남는다.
- **`markdown` / `html` 같은 짧은 별칭** — 조회 결과의 문자열과 달라져 그대로 옮겨 쓸 수 없다. 매핑 계층도 늘어난다.
- **요청에서 `mimeType` 을 빼고 서버 기본값에 맡김** — 요청 타입에서 필수 필드이고, 생략했을 때 서버가 기존 값을 보존하는지 확인되지 않았다.
- **신규 작성 경로에도 `--mime-type` 추가** — 이 ADR 의 범위는 기존 글의 보존이다. 신규 작성의 형식 지정은 성격이 다른 결정이라 분리한다.
