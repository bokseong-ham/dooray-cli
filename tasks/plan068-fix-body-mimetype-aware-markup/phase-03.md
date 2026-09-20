# Phase 03. 첨부 reference 의 삽입과 제거가 본문 형식을 보게 한다

**Execution profile**: standard

## 목표

`post comment file upload` 이 넣는 첨부 reference 와 `post comment file delete` 가 빼는 reference 가
그 댓글 본문의 `mimeType` 에 맞는 문법을 쓰게 한다.
빼야 할 reference 를 찾지 못했으면 파일을 지우기 전에 멈춘다.

**범위 외**: 멘션과 업무 링크는 phase 02 다. 문서 갱신은 phase 04 다.
`post file upload` 와 `post file delete` 는 본문을 건드리지 않으므로 대상이 아니다.

## 컨텍스트

**근거 문서**: `docs/adr/055-body-mimetype-aware-markup.md` 의 「실측으로 확인한 것」 절과
`docs/adr/024-...` 계열이 정한 댓글 첨부 처리 방식.
`docs/adr/INDEX.md` 에서 댓글 첨부 관련 ADR 번호를 찾아 그것을 읽는다.

Dooray 가 댓글 전용 첨부 endpoint 를 제공하지 않아, 댓글 첨부는 업무 파일을 올린 뒤
그 참조를 댓글 본문에 문자열로 넣어 표현한다. 지우는 것도 그 문자열을 본문에서 빼는 것이다.

지금 코드는 아래와 같다.

`src/utils/comment-files.ts` 가 둘을 가진다.

- `appendFileReference(body, fileName, fileId)` — 확장자로 이미지 여부를 판정해
  `![name](/files/<id>)` 나 `[name](/files/<id>)` 를 본문 끝에 붙인다
- `removeFileReference(body, fileId)` — 마크다운 전용 정규식으로 그 참조를 지운다.
  줄 전체가 참조면 줄을 지우고, 다른 글이 같은 줄에 있으면 참조만 지운다

`src/commands/post/comment/file/delete.ts` 는 두 단계로 동작한다.

1. 댓글을 받아 `removeFileReference` 로 본문을 고치고 `updatePostComment` 를 부른다
2. `deletePostFile` 로 파일을 지운다

**1단계가 참조를 찾지 못해도 성공으로 처리된다.** 본문이 그대로여도 갱신 호출이 성공하기 때문이다.
그래서 HTML 본문에서는 2단계가 파일을 지우고, 본문에는 대상이 사라진 링크가 남는다.

`src/commands/post/comment/file/upload.ts` 는 `appendFileReference` 결과를
`resolveBodyMimeType(commentRes.result.body.mimeType)` 과 함께 보낸다.
형식은 보존하면서 내용은 마크다운으로 만든다.

## 의도 메모

- 제거 쪽은 **찾았는지 여부를 돌려받아야 한다.** 지금은 바뀐 본문만 돌려주므로 호출부가 구별할 수 없다.
  반환 모양을 바꾸는 것이 이 phase 의 핵심이다.
- 찾지 못했을 때 파일을 지우지 않고 멈춘다. 지운 뒤에는 되돌릴 수 없고, 본문에 남은 링크가 그 사실을 알리지 않는다.
- HTML 제거 정규식은 마크다운 정규식과 따로 둔다. 하나로 합치려고 넓히면 본문의 다른 링크까지 지운다.

## 작업 항목

### 1. `src/utils/comment-files.ts` 의 두 함수에 형식 인자를 더한다

```ts
export function appendFileReference(
  body: string,
  fileName: string,
  fileId: string,
  mimeType?: string,
): string

export interface RemoveFileReferenceResult {
  body: string;
  removed: boolean;
}

export function removeFileReference(
  body: string,
  fileId: string,
  mimeType?: string,
): RemoveFileReferenceResult
```

기본값은 `text/x-markdown` 이다. 넘기지 않은 호출이 종전과 같이 동작해야 한다.

`appendFileReference` 는 phase 02 가 만든 `src/utils/body-markup.ts` 의 `buildLink` 를 쓴다.
이미지 여부 판정(`IMAGE_FILE_EXTENSION_RE`)과 대괄호 제거는 지금 그대로 두고,
그 결과를 `buildLink` 의 `image` 와 `text` 에 넘긴다.

`removeFileReference` 는 형식별로 정규식을 고른다.

- `text/x-markdown` — 지금 정규식을 그대로 쓴다
- `text/html` — ADR-055 의 표가 적은 HTML 표기에 맞는 정규식을 쓴다.
  `fileId` 를 담은 앵커를 줄 단위와 줄 안에서 각각 찾는다

`removed` 는 바뀐 본문이 원래 본문과 다른지로 정한다.
정규식이 몇 번 맞았는지를 세지 않는다. 호출부가 알아야 하는 것은 지워졌는지 여부뿐이다.

**반환 모양이 바뀌므로 이 함수를 쓰는 곳을 모두 고쳐야 한다.**

```bash
# cwd: <repo root>
grep -rn "removeFileReference" src/
```

그 출력이 고칠 자리 목록이다.

### 2. `src/commands/post/comment/file/delete.ts` 를 고친다

1단계에서 형식을 함께 넘기고, 찾지 못하면 2단계로 가지 않는다.

```ts
const bodyMimeType = resolveBodyMimeType(commentRes.result.body.mimeType);
const { body: newBody, removed } = removeFileReference(currentBody, fileId, bodyMimeType);
if (!removed) {
  throw new DoorayCliError(
    `댓글 본문에서 파일 reference 를 찾지 못했습니다. 파일을 삭제하지 않습니다. fileId=${fileId}\n` +
      `  본문 형식: ${bodyMimeType}\n` +
      `  파일만 지우려면: dooray post file delete ...`,
    EXIT_API_ERROR,
  );
}
```

마지막 줄의 안내는 실제 명령 형태로 적는다. `post file delete` 의 인자 형태를 그 명령 파일에서 확인해 옮긴다.

이 `throw` 를 지금의 `try` 블록 **밖**에 둔다.
안에 두면 그 블록의 `catch` 가 잡아 `reference 제거 실패` 라는 다른 문구로 바뀐다.
찾지 못한 것과 호출이 실패한 것은 원인이 달라 문구도 달라야 한다.

확인 문구도 고친다. 지금은 본문을 고치고 파일을 지운다고만 적는다.
찾지 못하면 아무것도 지우지 않는다는 것을 함께 적는다.

### 3. `src/commands/post/comment/file/upload.ts` 를 고친다

`appendFileReference` 호출에 형식을 넘긴다.
그 파일이 이미 `resolveBodyMimeType(commentRes.result.body.mimeType)` 을 부르고 있으므로
그 값을 변수에 담아 두 곳에 쓴다.

넣기 **전에** `checkMarkupSupport(bodyMimeType, "file-reference")` 로 판정한다.
거절이면 파일을 올리기 전에 멈춘다. 올린 뒤에 멈추면 어디에도 참조되지 않는 파일이 업무에 남는다.

### 4. `src/utils/comment-files.test.ts` 를 고치고 확인을 더한다

기존 확인은 `removeFileReference` 가 문자열을 돌려준다고 가정한다.
반환 모양이 바뀌었으므로 그 확인들을 `.body` 를 보도록 고친다.

더할 확인은 아래다.

| 확인할 것 | 입력 | 기대 |
| --- | --- | --- |
| 마크다운에서 찾았을 때 | 마크다운 본문에 그 참조가 있음 | `removed` 가 참이고 `body` 가 종전 결과와 같다 |
| 마크다운에서 못 찾았을 때 | 마크다운 본문에 그 참조가 없음 | `removed` 가 거짓이고 `body` 가 원래와 같다 |
| HTML 본문 | ADR-055 의 HTML 표기를 담은 본문 | `removed` 가 참이고 그 앵커만 사라진다 |
| HTML 본문의 다른 링크 | 같은 본문에 다른 fileId 의 앵커도 있음 | 그 앵커는 남는다 |
| 형식을 주지 않았을 때 | 마크다운 본문 | 마크다운 정규식으로 동작한다 |
| 넣기: HTML 본문 | `text/html` | ADR-055 의 표기로 붙는다. 표기가 없으면 이 확인 대신 거절 확인을 넣는다 |

### 5. `src/commands/post/comment/file/delete.test.ts` 에 확인 둘을 더한다

이 파일이 없으면 만든다. `src/commands/post/comment/file/` 아래의 다른 테스트 파일의 mock 방식을 따른다.

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| 못 찾았을 때 | `removeFileReference` 가 `removed: false` 를 돌려줌 | `deletePostFile` 이 불리지 않고 `EXIT_API_ERROR` 로 던진다 |
| 찾았을 때 | `removed: true` | 본문 갱신 뒤 `deletePostFile` 이 한 번 불린다 |

첫 번째는 `deletePostFile` 의 호출 횟수를 확인한다.
던지는 것만 확인하면 파일이 지워졌는지 알 수 없다. 이 phase 가 막으려는 것이 그 삭제다.

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
pnpm vitest run src/utils/comment-files.test.ts src/commands/post/comment/file/
```

종료 코드 0 이어야 한다.

변경이 들어갔는지 본다.

```bash
# cwd: <repo root>
grep -c "removed" src/utils/comment-files.ts                              # >= 2
grep -c "removed" src/commands/post/comment/file/delete.ts                # >= 1
grep -c "checkMarkupSupport" src/commands/post/comment/file/upload.ts     # >= 1
```

`removeFileReference` 를 쓰는 모든 자리가 새 반환 모양을 쓰는지 본다.

```bash
# cwd: <repo root>
grep -rn "removeFileReference" src/ | grep -v "\.test\."
```

출력의 각 줄이 `.body` 나 구조 분해로 결과를 받는지 읽어 확인한다.
`pnpm tsc --noEmit` 이 통과했다면 타입 수준에서는 이미 맞다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

**실제 파일을 지우지 않는다.** 이 phase 는 서버의 파일을 삭제하지 않는다.
삭제는 되돌릴 수 없고, 본문에서 참조를 빼는 것까지 함께 일어나 원래 상태로 되돌리기 어렵다.
동작은 위 단위 테스트가 판정한다.
실제 삭제로 확인하려면 사용자가 버려도 되는 업무와 파일을 직접 정해서 실행한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/utils/comment-files.ts` | 수정 — 형식 인자와 `removed` 반환 |
| `src/utils/comment-files.test.ts` | 수정 — 기존 확인 조정과 확인 6건 추가 |
| `src/commands/post/comment/file/delete.ts` | 수정 — 못 찾으면 삭제하지 않는다 |
| `src/commands/post/comment/file/delete.test.ts` | 신규 또는 수정 — 확인 2건 |
| `src/commands/post/comment/file/upload.ts` | 수정 — 형식 전달과 사전 거절 |
