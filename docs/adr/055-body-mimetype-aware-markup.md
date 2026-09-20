## ADR-055: 본문에 마크업을 넣고 빼는 경로는 그 본문의 mimeType 에 맞는 문법을 쓴다

- **status**: `accepted`

- **결정**: CLI 가 본문에 링크를 넣거나 빼는 경로는 그 본문의 `mimeType` 을 읽어 문법을 고른다.
  `text/x-markdown` 이면 지금의 마크다운 문법을 그대로 쓰고, `text/html` 이면 HTML 앵커를 쓴다.
  해당하는 경로는 다섯이다.

  | 경로 | 넣거나 빼는 것 |
  | --- | --- |
  | `post edit --mention` / `--mention-group` | 멤버와 그룹 멘션 |
  | `post edit --link-task` | 다른 업무로 가는 링크 |
  | `post comment edit --mention` / `--link-task` | 댓글의 멘션과 업무 링크 |
  | `post comment file upload` | 첨부 파일 reference |
  | `post comment file delete` | 첨부 파일 reference 제거 |

  `post create` 와 `post comment add` 는 이 다섯에 들어가지 않는다.
  두 명령은 본문 형식을 `text/x-markdown` 으로 고정해 보내므로 고를 것이 없다.
  이 결정은 기존 형식을 보존하는 경로만 다룬다.

  `text/html` 본문의 멘션을 어떤 태그로 표현하는지는 공식 API 문서로 확인한 표기를 쓴다.
  **공식 문서가 그 표기를 정의하지 않으면 그 경로는 거절한다.**
  종료 코드 3 으로 멈추고 `--mime-type` 으로 형식을 바꾸는 방법을 안내한다.
  확인되지 않은 표기를 추측해 넣으면 링크로 렌더링되지 않는 문자열이 남고, 그 사실이 출력에 드러나지 않는다.

- **맥락**: `post edit` 은 `resolveBodyMimeType` 으로 본문 형식을 이미 구해 두고도(ADR-053)
  그 값을 마크업을 만드는 함수에 넘기지 않는다.
  `prependMentions` 와 `appendTaskLinks` 는 형식과 무관하게 `[이름](dooray://...)` 를 만든다.
  그래서 `text/html` 본문에는 마크다운 원문이 그대로 붙고, 링크로 렌더링되지 않아 멘션 알림도 가지 않는다.

  `post comment file upload` 의 `appendFileReference` 도 같은 구조다.
  HTML 댓글에 파일을 올리면 `[name](/files/<id>)` 이 평문으로 남아 첨부에 닿을 수 없다.

  빼는 쪽은 더 나쁘다. `removeFileReference` 의 정규식은 마크다운 전용이라 HTML 본문에서 앵커를 찾지 못한다.
  찾지 못해도 본문 갱신이 성공으로 처리되고 그 다음 단계가 파일을 삭제하므로,
  본문에는 대상이 사라진 링크가 남는다.

  ADR-053 은 **기존 형식을 보존하는 것**까지 정했다. 보존한 형식에 맞는 내용을 만드는 것은 그 결정의 범위 밖이었다.

- **대안 기각**:
  - **지금 동작을 두고 경고만 낸다** — 경고를 낸 뒤에도 링크로 렌더링되지 않는 문자열이 본문에 남는다.
    빼는 쪽의 대상이 사라진 링크도 그대로 남아, 고치려던 것이 남는다.
  - **HTML 본문이면 무조건 거절한다** — 공식 문서가 표기를 정의하는 경우까지 막는다.
    `text/html` 업무에 파일을 올리는 것은 흔한 작업이고, 거절만 하면 CLI 로는 방법이 없다.
  - **본문을 마크다운으로 변환해 저장한다** — 표의 셀 배경이나 rowspan 으로 정보를 표현한 문서가 깨진다.
    ADR-053 이 보존을 결정한 이유와 정면으로 어긋난다.
  - **`mimeType` 을 보지 않고 본문 내용으로 형식을 추측한다** — 두 형식 모두 평문을 담을 수 있어 구별되지 않는다.
    응답이 형식을 이미 알려주므로 추측할 이유가 없다.

- **결과**:
  - 얻는 것: `text/html` 업무와 댓글에서도 멘션 알림이 가고 첨부 링크가 닿는다.
    파일을 지울 때 본문의 링크도 함께 사라진다.
    표기를 확인하지 못한 경로는 종료 코드로 멈추므로, 호출하는 쪽이 실패한 사실을 알 수 있다.
  - 감당할 것: 마크업을 만드는 함수의 시그니처에 형식 인자가 붙고, 호출부가 그 값을 넘겨야 한다.
    넘기지 않으면 기본값으로 떨어지므로, 기본값을 `text/x-markdown` 으로 두어 종전 동작을 유지한다.
    HTML 표기가 공식 문서에 없을 때 거절하는 경로가 늘어, `text/html` 본문을 쓰던 자동화가 멈출 수 있다.

- **적용 범위**: `src/utils/mention.ts`, `src/utils/task-link.ts`, `src/utils/comment-files.ts` 와
  그 셋을 부르는 `src/commands/post/edit.ts`, `src/commands/post/comment/edit.ts`,
  `src/commands/post/comment/file/upload.ts`, `src/commands/post/comment/file/delete.ts`.

**실측으로 확인한 것 (Issue #173, 2026-09):**

| 무엇 | `text/html` 표기 | 근거 |
| --- | --- | --- |
| 멤버 멘션 | 확인하지 못했다 | 확인 못함 |
| 그룹 멘션 | 확인하지 못했다 | 확인 못함 |
| 업무 링크 | 확인하지 못했다 | 확인 못함 |
| 첨부 reference | 확인하지 못했다 | 확인 못함 |

공식 API 문서를 `browser-driver` 로 열어 본문 179215자를 검색했다.
문서가 정의하는 것은 본문 `mimeType` 이 받는 값 둘(`text/html` 과 `text/x-markdown`)뿐이다.
`dooray://` 와 `멘션` 과 `mention` 은 문서 전문에서 한 건도 나오지 않았다.
`text/x-markdown` 쪽 표기도 문서에는 없다. 지금 CLI 가 쓰는 마크다운 표기는 실동작으로 굳은 것이다.

웹 화면 실측은 하지 않았다. 실측하려면 실제 업무나 댓글에 멘션과 첨부를 넣어야 하는데,
이 변경을 구현한 실행 환경이 실제 Dooray 업무를 수정하지 않는 조건이었다.
표기를 다시 찾을 때는 `text/html` 본문을 가진 업무의 댓글을 웹 화면에서 만들고
`dooray post comment list <project> <number> --json` 으로 `body.content` 를 읽는다.

**넷이 모두 `확인 못함` 이므로 `text/html` 본문의 네 경로는 모두 거절한다.**
`src/utils/body-markup.ts` 의 `HTML_SUPPORTED_KINDS` 가 그 목록을 코드에서 소유한다.
표기를 확인하면 이 표를 고치고 그 목록에 종류를 더한다.

**빼는 쪽은 거절하지 않는다.** `post comment file delete` 는 `text/html` 본문에서도
마크다운 정규식으로 참조를 찾아 지운다. 이 결정 전의 CLI 가 `text/html` 댓글에
마크다운 참조를 평문으로 남겼고, 거절하면 그것을 지울 방법이 CLI 에 없어진다.
