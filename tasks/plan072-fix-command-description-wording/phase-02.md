# Phase 02. `wiki page` 하위 명령의 `--id` 와 `--project` 도움말을 하나로 모은다

**Execution profile**: standard

## 목표

`resolveWikiPageInput` 을 쓰는 명령 열넷의 `--id` 와 `--project` 설명을
공용 상수 둘로 모아, 도움말이 resolver 의 실제 동작과 맞고 명령마다 갈리지 않게 한다.

**범위 외**: resolver 의 동작은 바꾸지 않는다. 옵션을 더하거나 빼지도 않는다.
positional 인자의 설명도 손대지 않는다. `<project> <pageId>` 두 개를 함께 받는 형태는
실제로 둘이 필요하므로 지금 문구가 맞다.

## 컨텍스트

`--id` 를 준 호출은 `--project` 없이 동작한다.
`src/resolvers/wiki-page-input.ts:68-87` 이 `--project` 가 없으면
`client.getWikiPageStandalone(idOpt)` 를 불러 응답에서 `wikiId` 를 얻는다.
`--project` 는 그 호출을 한 번 아끼는 선택 옵션이다.

그런데 그 resolver 를 부르는 명령 열넷의 도움말이 다섯 갈래로 갈려 있고,
그중 넷은 `--project` 가 필요하다고 적어 실제 동작과 반대다.

| 현재 문구 | 명령 수 | 실제 동작과 |
| --- | --- | --- |
| `위키 페이지 ID (project 없이 단독 지정)` | 1 | 맞다 |
| `위키 페이지 ID` | 5 | 모자라다 |
| `위키 페이지 ID (--project 동반)` / `(--project 동반 필요)` | 4 | 어긋난다 |
| `위키 페이지 ID (positional 대신)` | 4 | 모자라다 |

`--project` 설명도 네 갈래다.
`프로젝트 코드 (선택, 주면 wikiId 해석 호출을 아낀다)`,
`프로젝트 코드 (--id 모드에서 wikiId 해석용)`,
`프로젝트 코드 (--id 모드에서 wikiId 해석 호출 절약)`,
`프로젝트 코드 (--id 모드용)` 이 그것이다.

열넷이 모두 같은 resolver 를 부르므로 동작은 하나다. 설명만 갈렸다.

문서는 이미 단독 동작으로 적고 있다. `CLAUDE.md` 의 「명령 공통 규약」과
`docs/flow.md` 의 「위키 흐름」 절이 그렇다. 이번에 고칠 것은 코드의 설명 문자열뿐이다.

**근거 문서**: `docs/adr/045-wiki-page-standalone-fetch.md`, `docs/flow.md` 의 「위키 흐름」 절

## 의도 메모

- 문구를 명령마다 손으로 맞추지 않고 상수로 모은다.
  손으로 맞추면 다음에 명령이 하나 늘 때 다시 갈린다. 이 이슈가 그렇게 생겼다.
- 상수를 `src/resolvers/wiki-page-input.ts` 에 둔다.
  그 파일이 `--id` 단독 동작을 소유하므로 그것을 설명하는 문자열도 같은 곳에 둔다.
  `src/utils/` 에 새 파일을 만들면 동작과 설명이 갈라진다.
- 기준 문구는 `src/commands/wiki/page-get.ts:13,15` 의 표기다.
  넷 중 유일하게 실제 동작과 맞고, 이미 저장소에 쓰이고 있어 새로 짓는 말이 아니다.
- positional 인자는 이 변경에서 뺀다.
  `[page-id]` 의 `(project와 함께 사용)` 는 `resolveWikiPageInput` 의 네 번째 분기
  (`src/resolvers/wiki-page-input.ts:93-96`) 가 실제로 둘을 요구하므로 맞는 서술이다.

## 작업 항목

### 1. `src/resolvers/wiki-page-input.ts` 에 설명 상수 둘을 더한다

파일 상단의 기존 상수 곁에 둔다.

```ts
export const WIKI_PAGE_ID_OPTION_DESC = "위키 페이지 ID (project 없이 단독 지정)";
export const WIKI_PAGE_PROJECT_OPTION_DESC =
  "프로젝트 코드 (선택, 주면 wikiId 해석 호출을 아낀다)";
```

문자열은 `src/commands/wiki/page-get.ts:13` 과 `:15` 의 현재 값을 그대로 옮긴 것이다.
새로 짓지 않는다.

### 2. 명령 열넷이 그 상수를 쓰게 고친다

대상은 아래 열넷이다. 목록의 근거는 이 명령이다.

```bash
# cwd: <repo root>
grep -rln "resolveWikiPageInput" src/commands/ --include="*.ts" | grep -v "\.test\.ts$"
```

| 파일 | 고칠 줄 |
| --- | --- |
| `src/commands/wiki/page-get.ts` | 13, 15 |
| `src/commands/wiki/page-delete.ts` | 17, 19 |
| `src/commands/wiki/page-move.ts` | 102, 104 |
| `src/commands/wiki/page-file/download-all.ts` | 17, 19 |
| `src/commands/wiki/page-file/download.ts` | 18, 20 |
| `src/commands/wiki/page-file/list.ts` | 13, 15 |
| `src/commands/wiki/page-file/upload.ts` | 18, 20 |
| `src/commands/wiki/page-file/delete.ts` | 20, 22 |
| `src/commands/wiki/page-comment/get.ts` | 15, 17 |
| `src/commands/wiki/page-comment/edit.ts` | 15, 17 |
| `src/commands/wiki/page-comment/latest.ts` | 13, 15 |
| `src/commands/wiki/page-comment/add.ts` | 17, 19 |
| `src/commands/wiki/page-comment/list.ts` | 13, 15 |
| `src/commands/wiki/page-comment/delete.ts` | 17, 19 |

줄 번호는 이 phase 를 쓴 시점의 값이다. 어긋나면 그 파일에서
`.option("--id <pageId>"` 와 `.option("--project <code>"` 를 찾아 그 자리를 고친다.

각 파일에서 두 가지를 한다.

- `wiki-page-input.js` 에서 상수 둘을 import 한다. 그 파일은 이미 같은 모듈에서
  `resolveWikiPageInput` 을 import 하고 있으므로 import 구문에 이름을 더하면 된다
- 옵션의 두 번째 인자인 문자열 리터럴을 상수로 바꾼다

`page-move.ts` 는 `--project` 설명이 `wikiId 해석 호출 절약` 으로 뜻은 같고 표기만 다르다.
이것도 상수로 바꾼다. 남겨 두면 갈린 상태가 하나 남는다.

### 3. `src/resolvers/wiki-page-input.test.ts` 에 상수 확인을 더한다

이 파일은 이미 있다. 없는 것으로 다루지 않는다.
먼저 열어 기존 확인이 무엇을 보는지 읽고, 그 아래에 더한다.

| 확인할 것 | 기대 |
| --- | --- |
| `--id` 설명이 단독 동작을 말한다 | `WIKI_PAGE_ID_OPTION_DESC` 가 `project 없이` 를 담는다 |
| `--project` 설명이 선택임을 말한다 | `WIKI_PAGE_PROJECT_OPTION_DESC` 가 `선택` 을 담는다 |

문자열만 보는 확인이라 값이 바뀌면 걸린다.

### 4. `src/commands/wiki/page-input-help.test.ts` 로 열넷이 같은 문구를 쓰는지 검사한다

새 파일을 만든다. 이것이 이 phase 의 결과를 직접 판정하는 자리다.
상수를 만들어도 명령 하나가 옛 리터럴을 그대로 두면 이 확인에서 걸린다.

열넷의 `Command` 객체를 import 해 배열에 담고, 각각에서 `--id` 와 `--project` 옵션을 찾아
설명이 상수와 같은지 본다. commander 의 `Command` 는 `options` 로 등록된 옵션 목록을 돌려주고,
각 항목의 `long` 과 `description` 을 읽을 수 있다.

| 확인할 것 | 대상 | 기대 |
| --- | --- | --- |
| `--id` 문구가 하나다 | 열넷 전부 | 설명이 `WIKI_PAGE_ID_OPTION_DESC` 와 같다 |
| `--project` 문구가 하나다 | 열넷 전부 | 설명이 `WIKI_PAGE_PROJECT_OPTION_DESC` 와 같다 |
| 어긋난 표현이 남지 않았다 | 열넷 전부 | `--id` 설명에 `동반` 이 없다 |

세 번째가 이 phase 가 고치려는 실패다. 이슈가 지목한 네 자리의 `--project 동반` 이 그것이다.

명령 이름을 함께 단언해 어느 명령이 걸렸는지 실패 출력에 보이게 한다.
`describe.each` 로 열넷을 돌리면 그렇게 된다.
선례는 `src/commands/delete-confirmation-policy.test.ts:131` 의 `describe.each(cases)` 다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
```

타입 오류가 없어야 한다.

```bash
# cwd: <repo root>
pnpm test
```

종료 코드 0 이어야 한다. 기존 위키 관련 테스트가 함께 돈다.
`src/commands/wiki/page-edit.test.ts` 와 `page-move.test.ts` 와
`src/commands/wiki/page-comment/parse-args.test.ts` 가 여기 해당한다.
설명 문자열만 바꾸므로 이 셋은 그대로 통과해야 한다. 깨지면 옵션 정의를 잘못 건드린 것이다.

```bash
# cwd: <repo root>
grep -rn "위키 페이지 ID (--project 동반" src/commands/ | wc -l
```

0 이어야 한다. 이슈가 지목한 네 자리가 남지 않은 것을 본다.

```bash
# cwd: <repo root>
grep -rn "\"프로젝트 코드 (--id 모드" src/commands/wiki/ | wc -l
```

0 이어야 한다. `--project` 쪽 갈린 표기가 남지 않은 것을 본다.

```bash
# cwd: <repo root>
pnpm run build
node dist/index.js wiki page comment list --help
node dist/index.js wiki page get --help
```

두 출력의 `--id` 설명이 같아야 한다. 이슈가 어긋남을 확인한 그 두 명령이다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
```

둘 다 종료 코드 0 이어야 한다.

두 phase 를 모두 통과했으면 `tasks/plan072-fix-command-description-wording/index.json` 의
`status` 를 `completed` 로, `current_phase` 를 `2` 로 바꾼다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/resolvers/wiki-page-input.ts` | 수정 |
| `src/resolvers/wiki-page-input.test.ts` | 수정 |
| `src/commands/wiki/page-get.ts` | 수정 |
| `src/commands/wiki/page-delete.ts` | 수정 |
| `src/commands/wiki/page-move.ts` | 수정 |
| `src/commands/wiki/page-file/download-all.ts` | 수정 |
| `src/commands/wiki/page-file/download.ts` | 수정 |
| `src/commands/wiki/page-file/list.ts` | 수정 |
| `src/commands/wiki/page-file/upload.ts` | 수정 |
| `src/commands/wiki/page-file/delete.ts` | 수정 |
| `src/commands/wiki/page-comment/get.ts` | 수정 |
| `src/commands/wiki/page-comment/edit.ts` | 수정 |
| `src/commands/wiki/page-comment/latest.ts` | 수정 |
| `src/commands/wiki/page-comment/add.ts` | 수정 |
| `src/commands/wiki/page-comment/list.ts` | 수정 |
| `src/commands/wiki/page-comment/delete.ts` | 수정 |
| `src/commands/wiki/page-input-help.test.ts` | 신규 |
