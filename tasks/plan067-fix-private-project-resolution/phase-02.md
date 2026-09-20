# Phase 02. `wiki page edit` 이 페이지 ID 하나로도 동작하게 한다

**Execution profile**: standard

## 목표

`wiki page edit` 의 입력 형태를 나머지 위키 페이지 명령 넷과 같게 만든다.
`--id <page-id>` 와 `--url` 과 Dooray URL positional 을 받게 한다.

**범위 외**: resolver 수정은 phase 01 이다. 문서 갱신은 phase 03 이다.
`wiki page create` 는 대상 페이지가 없는 명령이라 이 변경의 대상이 아니다.

## 컨텍스트

**근거 문서**: `docs/adr/054-private-project-resolution.md` 와
`docs/adr/045-wiki-page-standalone-fetch.md`.

`wiki page get`, `file`, `comment`, `delete` 는 `src/resolvers/wiki-page-input.ts` 의
`resolveWikiPageInput` 을 쓴다. 그 함수가 네 입력 형태를 모두 처리한다.

| 입력 | 해석 방법 |
| --- | --- |
| `--url <url>` | URL 에서 wikiId 와 pageId 를 함께 뽑는다 |
| 첫 positional 이 Dooray URL | 위와 같다 |
| `--id <page-id>` | `getWikiPageStandalone` 으로 응답에서 wikiId 를 얻는다. `--project` 를 주면 그 호출을 아낀다 |
| `<project> <page-id>` | `resolveWiki` 로 wikiId 를 얻는다 |

`src/commands/wiki/page-edit.ts` 만 이 함수를 쓰지 않는다.
`<project>` 와 `<page-id>` 를 필수 positional 로 받고 `resolveWiki` 를 직접 부른다.
그래서 페이지 ID 만 아는 상태에서는 수정할 방법이 없다.

`page-edit.ts` 는 `wikiId` 와 `pageId` 두 값만 쓴다.
`resolveWikiPageInput` 이 그 둘을 돌려주므로 해석 부분만 바꾸면 나머지 본문은 그대로 둔다.

**선례**: `src/commands/wiki/page-delete.ts` 가 같은 형태로 `resolveWikiPageInput` 을 쓴다.
옵션 정의와 인자 이름을 그 파일에서 그대로 가져온다.

## 의도 메모

- 새 해석기를 만들지 않는다. 다섯 명령이 같은 함수를 쓰는 것이 이 변경의 목적이다.
- `<project>` 를 필수에서 선택으로 바꾼다. 필수로 두면 `--id` 만 주는 호출이 commander 단계에서 막힌다.
- `--project` 옵션과 첫 positional 의 `project` 는 뜻이 다르다.
  `resolveWikiPageInput` 의 `project` 필드는 `--id` 와 **함께** 줄 수 있는 선택 값이고,
  `projectArg` 는 positional 이라 `--id` 와 함께 줄 수 없다. 그 구분을 그대로 넘긴다.

## 작업 항목

### 1. `src/commands/wiki/page-edit.ts` 의 인자와 옵션을 바꾼다

`src/commands/wiki/page-delete.ts:15-19` 의 다섯 줄을 그대로 복사한다.
인자 이름(`[arg1]`, `[arg2]`)과 설명 문구까지 그대로 가져온다.
`-y, --yes` 는 삭제 명령에만 필요하므로 가져오지 않는다.

**문구를 새로 쓰지 않는다.** 두 명령의 도움말이 다르게 읽히면 사용자가 다른 기능으로 오해한다.
지금 `page-edit.ts:17-18` 의 `<project>`/`<page-id>` 두 줄이 그 자리를 차지하고 있으므로
그 둘을 지우고 복사한 다섯 줄을 넣는다.

기존 `--title`, `--body`, `--body-file`, `--mime-type` 은 그대로 둔다.

### 2. 해석 부분을 `resolveWikiPageInput` 으로 바꾼다

`action` 의 시그니처를 `page-delete.ts:21` 과 같은 `(arg1, arg2, opts)` 로 바꾼다.
`page-edit.ts:37` 의 `resolveWiki` 호출을 아래로 바꾼다.

```ts
// resolveWikiPageInput 을 spinner 보다 먼저 호출 (validation-before-spinner)
const { wikiId, pageId } = await resolveWikiPageInput(client, {
  projectArg: arg1,
  pageIdArg: arg2,
  idOpt: opts.id,
  urlOpt: opts.url,
  project: opts.project,
});

startSpinner("위키 정보 조회 중...");
```

`page-delete.ts:39` 가 주석까지 달아 이 순서를 지킨다.
해석이 먼저라야 입력이 모자랄 때 spinner 를 띄우지 않은 채 종료 코드 3 으로 끝난다.

`resolveWiki` import 를 빼고 `resolveWikiPageInput` 을 import 한다.

**아래 본문에서 이름을 바꿀 자리는 없다.**
`page-edit.ts` 가 쓰는 두 값이 `wikiId` 와 `pageId` 이고,
`resolveWikiPageInput` 이 같은 이름으로 돌려준다.
`arg1` 과 `arg2` 는 이 해석 호출에서만 쓴다.

`stopSpinner(true, "위키 정보 조회 완료")` 가 비대화형 분기 앞(`page-edit.ts:69`)에 그대로 남는다.
`startSpinner` 를 뒤로 옮겼어도 그 사이에 API 호출이 없으므로 짝이 맞는다.

### 3. `src/commands/wiki/page-edit.test.ts` 에 확인 셋을 더한다

**먼저 mock 을 바꾼다.** 이 파일은 `resolveWiki` 를 mock 하고 있는데(`page-edit.test.ts:29-32`),
1번과 2번 항목을 끝내면 `page-edit.ts` 가 그 함수를 부르지 않는다.
`resolveWikiPageInput` 을 mock 하지 않으면 기존 확인 여덟 건이 실제 resolver 를 타고 깨진다.

- `vi.hoisted` 의 `mocks`(`page-edit.test.ts:4-17`)에 `resolveWikiPageInput: vi.fn()` 을 더한다
- `vi.mock("../../resolvers/wiki-page-input.js", ...)` 을 더한다.
  기존 `resolvers/wiki.js` mock 과 같은 `importOriginal` 형태를 쓴다
- `beforeEach`(`page-edit.test.ts:79-90`)에
  `mocks.resolveWikiPageInput.mockResolvedValue({ wikiId: "wiki-1", pageId: "page-1" })` 를 더한다.
  기존 확인들이 `"my-wiki" "page-1"` 을 positional 로 주고
  `"wiki-1"` 과 `"page-1"` 을 기대하므로(`page-edit.test.ts:109-112`) 이 기본값이면 그대로 통과한다
- 기존 `resolveWiki` mock 과 `beforeEach` 의 `mocks.resolveWiki.mockResolvedValue("wiki-1")` 을 **지운다**.
  `page-edit.ts` 가 더 부르지 않으므로 남기면 무엇이 실제로 쓰이는지 읽는 쪽이 알 수 없다

기존 확인 여덟 건의 본문은 그대로 둔다. 위 기본값이 그것들을 그대로 통과시킨다.

**그 다음 아래 셋을 더한다.**

| 확인할 것 | 입력 | 기대 |
| --- | --- | --- |
| `--id` 단독 | `--id <pageId>` 와 `--body` | `resolveWikiPageInput` 이 `idOpt` 에 그 값을 받고 `projectArg` 가 비어 있다 |
| `--id` 와 `--project` | `--id <pageId>` 와 `--project <code>` 와 `--body` | `project` 필드에 그 코드가 넘어간다 |
| positional 두 개 | `<project> <pageId>` 와 `--body` | `projectArg` 와 `pageIdArg` 에 각각 넘어간다 |

`resolveWikiPageInput` 을 mock 해 넘어온 인자를 확인한다.
그 함수 자체의 동작은 `src/resolvers/wiki-page-input.test.ts` 가 이미 확인한다.

`--id` 와 positional 을 함께 주면 거절하는 동작도 그 resolver 가 소유하므로 여기서 다시 확인하지 않는다.

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
pnpm vitest run src/commands/wiki/page-edit.test.ts
```

종료 코드 0 이어야 한다.

도움말에 새 옵션이 등록됐는지 본다.

```bash
# cwd: <repo root>
node dist/index.js wiki page edit --help
```

출력에 `--id`, `--url`, `--project` 세 옵션이 모두 있어야 한다.

입력을 하나도 주지 않으면 종료 코드 3 으로 끝나는지 본다.

```bash
# cwd: <repo root>
node dist/index.js wiki page edit --body "x" ; echo "종료코드=$?"
```

`종료코드=3` 이어야 한다. `EXIT_PARAM_ERROR` 가 3 이다.

변경이 들어갔는지 본다.

```bash
# cwd: <repo root>
grep -c "resolveWikiPageInput" src/commands/wiki/page-edit.ts
! grep -q "resolveWiki(" src/commands/wiki/page-edit.ts
```

첫 줄의 값이 1 이상이고 두 줄 모두 종료 코드 0 이어야 한다.
두 번째가 `resolveWiki` 직접 호출이 남아 있지 않다는 것을 판정한다.
`grep -c` 는 일치가 없으면 종료 코드 1 로 끝나므로 없는 것을 볼 때는 `! grep -q` 를 쓴다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

**실제 페이지를 수정하지 않는다.** 이 phase 는 위키 페이지를 고치지 않는다.
입력 해석이 맞는지는 위 단위 테스트가 판정하고, 명령 등록은 도움말 출력이 판정한다.
실제 수정으로 확인하고 싶으면 사람이 대상 페이지를 직접 정해서 실행한다.
이 문서에 대상 자리를 비워 두면 실행하는 쪽이 그 자리를 채우게 되고, 위키 수정은 되돌리기 번거롭다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/wiki/page-edit.ts` | 수정 — 입력 형태 넷을 받고 `resolveWikiPageInput` 을 쓴다 |
| `src/commands/wiki/page-edit.test.ts` | 수정 — 확인 3건 추가 |
