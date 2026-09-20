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

`page-delete.ts` 의 정의를 본으로 삼는다.

```ts
.argument("[project]", "프로젝트 코드 또는 ID (또는 첫 인자에 Dooray Wiki URL)")
.argument("[page-id]", "페이지 ID (project 와 함께 사용)")
.option("--id <pageId>", "위키 페이지 ID (project/page-id 대신)")
.option("--url <url>", "Dooray Wiki 페이지 URL (project/page-id 대신)")
.option("--project <project>", "wikiId 해석에 쓸 프로젝트 (--id 와 함께 쓰는 선택 옵션)")
```

기존 `--title`, `--body`, `--body-file`, `--mime-type` 은 그대로 둔다.

`page-delete.ts` 의 실제 옵션 설명 문구를 읽고 그것과 같은 표현을 쓴다.
두 명령의 도움말이 서로 다르게 읽히면 사용자가 다른 기능으로 오해한다.

### 2. 해석 부분을 `resolveWikiPageInput` 으로 바꾼다

`action` 의 시그니처를 `(project, pageId, opts)` 로 유지하되, 안에서 해석을 바꾼다.

```ts
startSpinner("위키 정보 조회 중...");
const { wikiId, pageId: resolvedPageId } = await resolveWikiPageInput(client, {
  projectArg: project,
  pageIdArg: pageId,
  idOpt: opts.id,
  urlOpt: opts.url,
  project: opts.project,
});
```

`resolveWiki` import 를 빼고 `resolveWikiPageInput` 을 import 한다.

이 함수 아래의 본문에서 `pageId` 를 쓰는 곳을 모두 `resolvedPageId` 로 바꾼다.
`getWikiPage`, `updateWikiPage`, `updateWikiPageContent`, `updateWikiPageTitle` 호출과
마지막 출력 문구가 여기 해당한다.

**이름을 바꿀 때 일괄 치환 도구를 쓰지 않는다.**
바꿀 자리가 한 파일 안에 열 곳 미만이므로 편집 도구로 직접 고친다.

### 3. `src/commands/wiki/page-edit.test.ts` 에 확인 셋을 더한다

이 파일은 이미 있다. 기존 확인은 그대로 두고 아래를 더한다.

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
grep -c "resolveWikiPageInput" src/commands/wiki/page-edit.ts   # >= 1
grep -c "resolveWiki(" src/commands/wiki/page-edit.ts           # = 0
```

두 번째가 0 이어야 한다. `resolveWiki` 직접 호출이 남아 있지 않다는 값이다.

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
