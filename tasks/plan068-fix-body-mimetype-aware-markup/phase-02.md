# Phase 02. 멘션과 업무 링크가 본문 형식을 보게 한다

**Execution profile**: standard

## 목표

`post edit --mention`, `--mention-group`, `--link-task` 가 본문의 `mimeType` 에 맞는 문법으로 링크를 만들게 한다.
표기를 확인하지 못한 형식은 거절한다.

**범위 외**: 첨부 파일 reference 의 삽입과 제거는 phase 03 이다.
문서 갱신은 phase 04 다.
`post create` 와 `post comment add` 는 본문 형식이 `text/x-markdown` 고정이라(ADR-053) 대상이 아니다.

## 컨텍스트

**근거 문서**: `docs/adr/055-body-mimetype-aware-markup.md` 의 「실측으로 확인한 것」 절과
`docs/adr/053-body-mimetype-preservation.md`.

**phase 01 이 ADR-055 에 남긴 표가 이 phase 의 입력이다.** 그 표를 먼저 읽는다.
`근거` 열이 `확인 못함` 인 항목은 거절 대상이고, 나머지는 그 표기로 만든다.

지금 코드는 아래와 같다.

`src/utils/mention.ts` 의 `buildMemberMention` 과 `buildGroupMention` 이
`me.orgId` 로 `dooray://` 링크를 만들고 `prependMentions` 가 본문 앞에 붙인다.
형식 인자가 없다.

`src/utils/task-link.ts` 의 `buildTaskLink` 가 같은 형태로 만들고 `appendTaskLinks` 가 본문 뒤에 붙인다.

`src/commands/post/edit.ts` 는 `resolveBodyMimeType(post.body.mimeType, opts.mimeType)` 으로
본문 형식을 이미 `bodyMimeType` 에 담아 두고도 위 두 함수에 넘기지 않는다.
그 변수는 세 곳에 쓰인다. `--dry-run --json` 출력의 `mimeType`,
비대화형 경로의 `client.updatePost`, `$EDITOR` 경로의 `client.updatePost` 다.

`src/utils/body-input.ts` 의 `BODY_MIME_TYPES` 가 받는 값 목록을 소유한다.

## 의도 메모

- 형식 인자는 **선택**으로 두고 기본값을 `text/x-markdown` 으로 한다.
  넘기지 않은 호출이 종전과 같이 동작해야 이 변경이 다른 경로를 깨지 않는다.
- 거절은 링크를 만들기 **전에** 한다. 만든 뒤에 버리면 그 사이에 API 호출이 나갈 수 있다.
- 판정을 순수 함수로 뺀다. `post edit` 본체는 네트워크와 편집기를 타서 단위 테스트가 어렵다.
- 거절 문구는 `--mime-type` 으로 형식을 바꾸는 방법을 함께 적는다.
  ADR-053 이 그 옵션을 이미 만들어 두었으므로 사용자가 쓸 수 있는 경로가 있다.
- `post edit` 의 `$EDITOR` 분기가 `--dry-run` 을 보지 않고 `client.updatePost` 를 부르는 것을 확인했다.
  이 plan 의 범위가 아니라 고치지 않는다. 대신 이 phase 의 검증 명령이 그 분기로 들어가지 않게 한다.
  마치고 나서 별도 이슈 후보로 보고한다.

## 작업 항목

### 1. `src/utils/body-markup.ts` 를 새로 만든다

형식별 링크 문법을 한곳에 둔다. 두 파일이 같은 판정을 따로 가지면 갈라진다.

```ts
export type BodyMarkupKind = "member-mention" | "group-mention" | "task-link" | "file-reference";

/** 이 형식에서 이 마크업을 만들 수 있는지. 만들 수 없으면 거절 문구를 돌려준다. */
export function checkMarkupSupport(
  mimeType: string,
  kind: BodyMarkupKind,
): { supported: true } | { supported: false; message: string };

/** 링크 하나를 그 형식의 문법으로 만든다. */
export function buildLink(
  mimeType: string,
  opts: { text: string; url: string; title?: string; image?: boolean },
): string;
```

`buildLink` 는 형식별로 이렇게 만든다.

- `text/x-markdown` — 지금 표기를 그대로 유지한다. `title` 이 있으면 `[text](url "title")`, 없으면 `[text](url)`.
  `image` 가 참이면 앞에 `!` 를 붙인다
- `text/html` — phase 01 이 ADR-055 에 적은 표기를 쓴다

#### `text` 와 `title` 의 특수문자 처리

**지금 셋이 서로 다르다.** 하나로 모아 일괄 escape 하면 동작이 바뀐다.

| 지금 | 무엇을 escape 하나 |
| --- | --- |
| `buildMemberMention` / `buildGroupMention` | 아무것도 하지 않는다. 이름과 코드를 그대로 넣는다 |
| `buildTaskLink` 의 `text` | `subject` 에만 `escapeLinkText` 를 적용한다. `<projectCode>/<number> ` 접두는 그대로다 |
| `buildTaskLink` 의 `title` | `workflowClass` 의 `"` 를 `&quot;` 로 바꾼다. `escapeLinkText` 에는 `"` 처리가 없다 |

그래서 `buildLink` 는 아래대로 한다.

| 인자 | `text/x-markdown` | `text/html` |
| --- | --- | --- |
| `text` | **손대지 않는다.** 호출부가 필요한 escape 를 이미 마쳤다 | `&`, `<`, `>` 를 실체 참조로 바꾼다 |
| `title` | `"` 를 `&quot;` 로 바꾼다 | `&`, `<`, `>`, `"` 를 실체 참조로 바꾼다 |

`escapeLinkText` 를 호출하는 자리는 `buildTaskLink` 안에 그대로 둔다.
`subject` 에만 걸리던 것이 접두까지 걸리면 `/` 앞뒤 문자가 달라진다.

**멘션 이름은 마크다운에서 escape 하지 않는다.** 지금 그렇고, 이 phase 는 그것을 바꾸지 않는다.
`text/html` 분기에서만 실체 참조로 바꾼다. 바꾸지 않으면 이름에 든 `<` 가 태그를 깬다.

#### 거절 판정

`checkMarkupSupport` 는 ADR-055 의 표에서 그 형식과 종류의 근거가 `확인 못함` 인 조합에만 거절을 돌려준다.
거절 문구는 이렇다.

```
<형식> 본문에는 <무엇>을 넣을 수 없습니다. 이 형식의 표기가 확인되지 않았습니다.
  본문 형식을 바꾸려면: --mime-type text/x-markdown
```

`BODY_MIME_TYPES` 에 없는 값이 들어오면 마크다운으로 본다.
`resolveBodyMimeType` 이 그 목록 밖의 값을 걸러 주지만, 이 함수만 따로 불릴 수 있어 기본값이 필요하다.

### 2. `src/utils/body-markup.test.ts` 를 만든다

| 확인할 것 | 입력 | 기대 |
| --- | --- | --- |
| 마크다운 링크 | `text/x-markdown`, `title` 있음 | `[text](url "title")` |
| 마크다운 링크, title 없음 | `text/x-markdown`, `title` 없음 | `[text](url)` |
| 마크다운 이미지 | `text/x-markdown`, `image` 참 | 앞에 `!` 가 붙는다 |
| 마크다운은 text 를 건드리지 않는다 | `text` 에 `[`, `]`, `&` 포함 | 그대로 나온다 |
| 마크다운 title 의 따옴표 | `title` 에 `"` 포함 | `&quot;` 로 바뀐다 |
| HTML 특수문자 | `text/html`, `text` 에 `<`, `&` 포함 | 실체 참조로 바뀌어 태그가 깨지지 않는다 |
| 알 수 없는 형식 | `application/json` | 마크다운과 같은 결과 |
| 지원 판정 | ADR-055 가 `확인 못함` 으로 적은 조합 | `supported` 가 거짓이고 문구에 `--mime-type` 이 들어 있다 |

HTML 표기를 확인하지 못한 항목은 `buildLink` 의 HTML 분기를 만들지 않는다.
그 경우 `checkMarkupSupport` 가 먼저 거절하므로 `buildLink` 가 불리지 않는다.
이 사실을 확인하는 테스트를 한 건 넣는다.

### 3. `src/utils/mention.ts` 와 `src/utils/task-link.ts` 를 고친다

세 함수에 형식 인자를 더한다. 기본값은 `text/x-markdown` 이다.

```ts
export function buildMemberMention(m: MentionMember, me: CachedMe, mimeType?: string): string
export function buildGroupMention(g: MentionGroup, me: CachedMe, mimeType?: string): string
export function prependMentions(body, members, groups, me, mimeType?: string): string
export function buildTaskLink(t: TaskLinkInput, me: CachedMe, mimeType?: string): string
export function appendTaskLinks(body, links, me, mimeType?: string): string
```

세 `build*` 함수의 본문을 `buildLink` 호출로 바꾼다. `dooray://` 주소를 만드는 부분은 그대로 둔다.
형식에 따라 달라지는 것은 링크를 감싸는 문법뿐이다.

`escapeLinkText` 는 `body-markup.ts` 로 옮긴다.
**`task-link.ts` 가 그것을 다시 export 한다.**

```ts
export { escapeLinkText } from "./body-markup.js";
```

`src/utils/task-link.test.ts` 가 그 이름을 `./task-link.js` 에서 import 해 그 동작을 확인하므로,
다시 export 하지 않으면 그 테스트가 깨진다. 테스트의 import 를 고치는 대신 재export 를 고른다.
`escapeLinkText` 는 이 저장소 밖에서도 링크 텍스트 escape 의 이름으로 굳어 있어
`task-link.ts` 에서 사라지면 읽는 사람이 다시 찾아야 한다.

이 함수를 쓰는 다른 곳이 있는지 먼저 확인한다.

```bash
# cwd: <repo root>
grep -rn "escapeLinkText" src/
```

`appendTaskLinks` 와 `prependMentions` 의 **줄바꿈 처리는 형식과 무관하게 지금 그대로** 둔다.
HTML 본문에서 줄바꿈이 어떻게 보이는지는 이 plan 이 정하지 않는다.

기존 테스트 `src/utils/mention.test.ts` 와 `src/utils/task-link.test.ts` 는
형식 인자를 주지 않는 확인이라 그대로 통과해야 한다. 통과하지 않으면 기본값이 잘못된 것이다.

### 4. `src/commands/post/edit.ts` 가 형식을 넘기게 한다

`prependMentions` 와 `appendTaskLinks` 호출에 `bodyMimeType` 을 넘긴다.
그 변수는 이미 같은 함수 안에 있다.

호출 **앞에** 거절 판정을 둔다.

```ts
if (mentionInputs.length > 0 || groupInputs.length > 0) {
  const memberCheck = checkMarkupSupport(bodyMimeType, "member-mention");
  if (!memberCheck.supported) throw new DoorayCliError(memberCheck.message, EXIT_PARAM_ERROR);
  // 그룹 입력이 있을 때만 group-mention 도 확인한다
  // ...
}
```

`--link-task` 도 같은 형태로 `task-link` 를 확인한다.

판정은 멤버 이름과 업무를 해석하기 전에 한다. 그 해석이 API 호출이라, 거절할 호출에 왕복을 쓰지 않는다.

`--dry-run` 경로도 같은 문자열을 만들게 된다. 그 경로는 판정을 거쳐 온 뒤이므로 따로 손대지 않는다.

**`$EDITOR` 분기는 손대지 않는다.** 그 분기는 멘션과 링크를 버린다는 경고만 내고 끝난다.
거절 판정을 그 분기에 두면 종전에 경고로 끝나던 호출이 실패로 바뀐다.

### 5. `src/commands/post/comment/edit.ts` 도 같은 형태로 고친다

이 명령도 멘션과 `--link-task` 를 본문에 넣는다. 구조가 `post edit` 과 다른 곳이 둘이다.

- 멘션은 `mentionPrefix` 라는 문자열을 먼저 만든 뒤 본문 앞에 붙인다.
  그 문자열을 만드는 자리에 형식을 넘긴다
- `$EDITOR` 를 여는 경로도 `mentionPrefix` 를 씨앗 본문에 넣는다.
  그 경로도 같은 문자열을 쓰므로 자동으로 따라온다

형식 값은 `resolveBodyMimeType(comment.body.mimeType, opts.mimeType)` 이다.
이 명령은 그 호출을 여러 곳에서 반복하고 있다. 한 번 구해 변수에 담고 그 변수를 쓴다.
반복하면 한 곳을 고칠 때 다른 곳이 어긋난다.

거절 판정은 `post edit` 과 같이 멤버와 업무를 해석하기 전에 둔다.

### 6. `src/commands/post/edit.test.ts` 와 `comment/edit.test.ts` 에 확인 넷씩을 더한다

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| 마크다운 본문의 멘션 | 본문이 `text/x-markdown`, `--mention` 지정 | 종전과 같은 문자열이 본문 앞에 붙는다 |
| HTML 본문의 멘션 | 본문이 `text/html`, `--mention` 지정 | ADR-055 의 표대로 동작한다. 표기가 있으면 그 문법, 없으면 `EXIT_PARAM_ERROR` |
| HTML 본문의 업무 링크 | 본문이 `text/html`, `--link-task` 지정 | 위와 같다 |
| 거절이 해석보다 앞선다 | 거절 대상 조합 | 멤버 해석 API 가 불리지 않는다 |

네 번째는 mock 호출 횟수로 확인한다. 거절만 확인하면 왕복을 아꼈는지 알 수 없다.

두 테스트 파일은 이미 있다. 같은 넷을 각각에 더한다.
`post edit` 쪽 확인은 `--mention` 만 주면 `$EDITOR` 분기로 가므로
`--mime-type` 이나 `--title` 을 함께 주어 비대화형 경로로 들어가게 한다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 종료 코드 0 이어야 한다.

```bash
# cwd: <repo root>
pnpm vitest run src/utils/body-markup.test.ts src/commands/post/edit.test.ts src/commands/post/comment/edit.test.ts
```

종료 코드 0 이어야 한다.

파일과 호출이 들어갔는지 본다.

```bash
# cwd: <repo root>
ls src/utils/body-markup.ts src/utils/body-markup.test.ts
grep -c "checkMarkupSupport" src/commands/post/edit.ts              # >= 2
grep -c "checkMarkupSupport" src/commands/post/comment/edit.ts      # >= 2
grep -n "prependMentions\|appendTaskLinks" src/commands/post/edit.ts
grep -n "prependMentions\|appendTaskLinks" src/commands/post/comment/edit.ts
```

뒤의 두 명령이 내는 각 호출 줄에 형식 변수가 인자로 들어 있어야 한다.
`bodyMimeType` 이 몇 번 나오는지로는 판정하지 않는다. 고치기 전에도 넷이 나와 절반만 들어가도 통과한다.

`text/html` 본문의 미리보기를 실제로 확인한다. 대상 업무는 사용자에게 받는다.

```bash
# cwd: <repo root>
node dist/index.js post edit <프로젝트> <업무번호> --mention <이름> --mime-type text/html --dry-run ; echo "종료코드=$?"
```

**`--mime-type` 을 반드시 함께 준다.** `--mention` 만 주면 `src/commands/post/edit.ts` 의
`nonInteractive` 가 거짓이 되어 `$EDITOR` 분기로 간다.
그 분기는 `opts.dryRun` 을 보지 않고 `client.updatePost` 를 불러 **실제 업무를 수정한다.**
`--mime-type` 은 그 판정에 들어 있어 비대화형 경로로 들어가고, 거기서는 `--dry-run` 이 지켜진다.
명령을 치기 전에 `nonInteractive` 가 무엇을 보는지 그 파일에서 직접 읽어 확인한다.

기존 형식과 같은 값을 `--mime-type` 에 준다. 다른 값을 주면 형식이 바뀐 상태를 미리 보게 된다.

본문이 `text/html` 인 업무에서 ADR-055 의 표대로 동작해야 한다.
표기가 확인된 항목이면 `종료코드=0` 이고 출력의 첫 줄이 그 표기다.
`확인 못함` 인 항목이면 `종료코드=3` 이고 stderr 에 `--mime-type` 안내가 있다.

**대상 업무를 임의로 고르지 않는다.** 사용자에게 물을 수 없는 실행 환경이면 이 확인을 건너뛰고,
건너뛴 사실을 보고한다. 단위 테스트가 같은 동작을 이미 판정한다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/utils/body-markup.ts` | 신규 — 형식별 링크 문법과 지원 판정, `escapeLinkText` 이동 |
| `src/utils/body-markup.test.ts` | 신규 |
| `src/utils/mention.ts` | 수정 — 형식 인자 추가, `buildLink` 사용 |
| `src/utils/task-link.ts` | 수정 — 형식 인자 추가, `escapeLinkText` 재export |
| `src/utils/task-link.test.ts` | 무변경 — 재export 로 그대로 통과해야 한다 |
| `src/utils/mention.test.ts` | 무변경 — 기본값으로 그대로 통과해야 한다 |
| `src/commands/post/edit.ts` | 수정 — 형식 전달과 거절 판정 |
| `src/commands/post/edit.test.ts` | 수정 — 확인 4건 추가 |
| `src/commands/post/comment/edit.ts` | 수정 — 형식 전달과 거절 판정 |
| `src/commands/post/comment/edit.test.ts` | 수정 — 확인 4건 추가 |
