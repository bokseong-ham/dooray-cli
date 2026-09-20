# plan068 검토 지적 (판정: REJECT)

이 plan 을 이슈 #173 의 항목 4, 5 와 대조한 결과다.
**구현을 시작하기 전에 아래를 plan 에 반영하고, 반영한 것을 커밋으로 남긴다.**

전수가 아니다. `gh issue view 173` 과 `docs/adr/055-body-mimetype-aware-markup.md` 를
직접 읽고 한 번 더 대조한다.

## Critical

### C1. phase-02 의 검증 명령이 `--dry-run` 을 무시하고 실제 업무를 수정한다

`phase-02.md:217` 이 제시하는 명령이다.

```
node dist/index.js post edit <프로젝트> <업무번호> --mention <이름> --dry-run
```

`src/commands/post/edit.ts` 의 비대화형 판정에 `--mention` 이 없다.

```ts
const nonInteractive = title || opts.body || opts.bodyFile || hasTagChange
  || hasParticipantChange || opts.mimeType != null;
```

`--mention` 만 주면 `nonInteractive` 가 거짓이라 `$EDITOR` 분기로 간다.
그 분기는 멘션을 버린다는 경고만 내고, **`opts.dryRun` 을 보지 않고 `client.updatePost` 를 부른다.**
`phase-02.md:213` 의 「`--dry-run` 이라 본문을 고치지 않는다」는 사실과 다르다.

되돌릴 수 없는 변경이 검증 단계에서 일어난다.

**고칠 것**: 검증 명령에 `--mime-type` 이나 `--title` 을 함께 주어 비대화형 경로로 들어가게 한다.
그 전에 `src/commands/post/edit.ts` 의 `nonInteractive` 조건을 직접 열어 확인한다.

### C2. `post comment file upload` 의 사전 거절이 코드 순서상 성립하지 않는다

`phase-03.md:131-132` 는 「넣기 전에 `checkMarkupSupport` 로 판정한다. 거절이면 파일을 올리기 전에 멈춘다」고 적는다.
그런데 본문 형식을 알 수 있는 `getPostComment` 는 파일 업로드보다 **뒤**에 있다.

```ts
// Step 1: 파일 업로드
const uploadRes = await client.uploadPostFile(projectId, postId, filePath);
...
// Step 2: 댓글 본문에 reference 추가
const commentRes = await client.getPostComment(projectId, postId, commentId);
```

그대로 구현하면 업로드가 끝난 뒤에 거절하게 되어,
phase 가 막으려던 「어디에도 참조되지 않는 파일」이 그대로 남는다.

**고칠 것**: 댓글 조회와 형식 판정을 업로드 앞으로 옮기라고 명시한다.
조회와 판정을 Step 0 으로 분리하고 업로드를 Step 1 로 미루는 순서를 phase 에 적는다.

### C3. phase-04 의 검증이 통과할 수 없다

`phase-04.md:127` 이 `verify_task.py` 종료 코드 0 을 요구하는데 지금 이 plan 은 1 이다.

```
phase-01.md — 마지막 작업 항목이 테스트가 아니다: ### 4. 확인 결과를 사용자에게 보고한다
phase-04.md — 마지막 작업 항목이 테스트가 아니다: ### 5. `index.json` 을 완료로 표시한다
```

**고칠 것**: 두 phase 의 마지막 `###` 항목을 검사 성격의 항목으로 바꾸고,
보고와 `index.json` 표시는 검증 절의 일반 문단으로 내린다.

## Major

### M1. ADR-055 의 경로 수가 실제와 달랐다 (이미 고쳤다)

형식을 보존하는 경로는 넷이 아니라 다섯이다. `post comment edit` 이 빠져 있었다.
`docs/adr/055-body-mimetype-aware-markup.md` 의 표와 적용 범위를 이미 맞춰 두었다.

plan 의 구현 범위는 원래 맞았다. phase-02 의 작업 항목 5 가 `post comment edit` 을 다룬다.
**고칠 것**: phase-01 이 ADR 에 실측을 더할 때 그 표가 다섯 행인 것을 전제로 쓴다.

### M2. `buildLink` 의 escape 규칙이 지금 동작 둘을 바꾼다

`phase-02.md:73-75` 는 「지금 `escapeLinkText` 가 하는 처리를 그대로 쓴다」고만 적는데 셋이 서로 다르다.

- `src/utils/mention.ts` 의 멘션은 이름을 escape 하지 않는다
- `src/utils/task-link.ts` 는 `subject` 에만 `escapeLinkText` 를 적용하고 `projectCode/number` 접두에는 하지 않는다
- 같은 파일이 title 에만 `"` 를 `&quot;` 로 바꾼다. `escapeLinkText` 에는 `"` 처리가 없다

셋을 `buildLink` 하나로 모으고 일괄 escape 하면 멘션 이름의 `&` 와 `[` 가 새로 escape 되고,
`workflowClass` 안의 `"` 가 escape 되지 않아 마크다운 title 이 깨진다.
기존 테스트에 특수문자를 담은 확인이 없어 이 차이가 드러나지 않는다.

**고칠 것**: `buildLink` 가 `text` 와 `title` 에 각각 어떤 escape 를 적용하는지 표로 적는다.
멘션 이름은 escape 하지 않는다는 것도 함께 적는다.

### M3. phase-03 의 `throw` 를 `try` 밖에 두라는 지시가 지금 구조로는 실행되지 않는다

`phase-03.md:118-120` 은 「`throw` 를 지금의 `try` 블록 밖에 둔다」고 적는다.
그런데 `src/commands/post/comment/file/delete.ts` 는 `commentRes` 와 `currentBody` 와 `newBody` 를
모두 `try` 안에서 만든다. `throw` 만 밖으로 빼려면 조회와 제거도 함께 옮겨야 한다.

**고칠 것**: `try` 에 남길 것은 `updatePostComment` 하나라고 명시하고,
조회와 제거와 판정을 그 앞에 둔다고 적는다.

### M4. 표기를 확인하지 못했을 때 `removeFileReference` 가 무엇을 하는지 정의되지 않았다

`phase-02.md:100-101` 은 표기 미확인 항목의 HTML 분기를 만들지 않고
`checkMarkupSupport` 가 먼저 거절한다고 정한다.
phase-03 은 넣는 쪽(`upload`)에만 그 거절을 두고 빼는 쪽(`delete`)에는 두지 않는다.
`확인 못함` 일 때 `text/html` 본문의 제거에 어떤 정규식을 쓸지가 없다.

**고칠 것**: 거절할지, 마크다운 정규식으로 시도할지를 phase 에 적는다.

### M5. 이 버그가 이미 만든 본문을 되돌릴 경로가 없다

이슈 #173 의 5번이 보고하는 상태는 `text/html` 댓글에 마크다운 reference 가 평문으로 들어가 있는 것이다.
phase-03 을 적용하면 `removeFileReference` 가 HTML 정규식을 쓰게 되어 그것을 찾지 못하고,
새로 넣은 `removed === false` 검사가 삭제를 막는다.
**종전보다 나빠진다.** 종전에는 파일이라도 지워졌지만 이제는 아무것도 지울 수 없다.

**고칠 것**: `text/html` 일 때 HTML 정규식으로 찾지 못하면 마크다운 정규식으로 한 번 더 찾는다고 적는다.
그 본문이 이 버그의 산물이라는 것이 근거다.

### M6. phase-04 가 고치라는 README 설명이 README 에 없다

`phase-04.md:54-57` 은 `post edit --mention` 과 `--link-task` 의 설명을 고치라고 하는데,
`README.md` 에서 `--mention`, `--link-task`, `멘션` 을 찾으면 한 건도 나오지 않는다.
`post comment file delete` 도 삭제 확인 명령 표에 이름만 있고 설명 절이 없다.
그런데 `phase-04.md:118` 의 검증은 README 가 바뀌기를 요구한다.

**고칠 것**: 그 절이 없다는 사실을 phase 에 적고, 새로 만들 절의 위치와 제목을 지정한다.

### M7. 마크다운 링크 표기를 실제로 소유한 문서가 빠졌다

`skills/dooray-cli/references/mention-link.md` 가 「Dooray 마크다운 링크 형식」 절을 갖고 있고
`skills/dooray-cli/SKILL.md` 가 그 파일을 가리킨다.
표기를 형식별로 나누는 이 변경은 그 파일을 반드시 고쳐야 하는데
phase-04 의 작업 항목과 Critical Files 어디에도 없다.

**고칠 것**: 그 경로를 phase-04 에 더한다. `references/comment.md` 도 함께 확인한다.

### M8. `escapeLinkText` 를 옮기면 깨지는 테스트가 Critical Files 에 없다

`src/utils/task-link.test.ts` 가 `escapeLinkText` 를 `./task-link.js` 에서 import 해 직접 확인한다.
`phase-02.md:119` 이 그 함수를 `body-markup.ts` 로 옮기라고 적지만
Critical Files 표에 그 테스트 파일이 없고, 같은 절은 「기존 테스트가 그대로 통과해야 한다」고 적는다.

**고칠 것**: `task-link.ts` 가 다시 export 할지 테스트의 import 를 고칠지 정하고 반영한다.

## Minor

- **m1.** `phase-02.md:32` 의 「그 변수는 `client.updatePost` 에만 쓰인다」는 틀렸다.
  `bodyMimeType` 은 `--dry-run --json` 출력에도 쓰인다. 세 곳이다.
- **m2.** `phase-03.md:17` 의 근거 문서 경로가 `docs/adr/024-...` 로 미완성이다.
  실제는 `docs/adr/024-comment-file-synthesis.md` 다.
- **m3.** `phase-03.md:131` 의 업로드 거절에 종료 코드와 오류 타입이 없다.
  ADR-055 는 거절을 종료 코드 3 으로 정하므로 `EXIT_PARAM_ERROR` 를 명시한다.
  `phase-03.md:111` 의 삭제 쪽이 쓰는 `EXIT_API_ERROR` 도 다시 볼 값이 있다.
  참조를 찾지 못한 것은 API 오류가 아니라 판정 결과다.
- **m4.** `phase-01.md:108` 의 `grep -c` 는 서로 다른 네 행이 아니라 일치한 줄 수를 센다.
- **m5.** `phase-02.md:208` 의 `grep -c "bodyMimeType" # >= 5` 는 지금도 4 라
  변경이 절반만 들어가도 통과한다.
- **m6.** `phase-03.md:152` 는 `delete.test.ts` 가 「없으면 만든다」고 적는데 이미 있다.
  `upload.test.ts` 도 있다.
