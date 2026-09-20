# Phase 01. `post get` 이 태그를 보여주게 한다

**Execution profile**: standard

## 목표

`post get` 의 일반 출력에 태그 줄을 더하고, `--with-tag-names` 옵션으로 `--json` 의 각 태그에 이름을 채운다.

**범위 외**: `post list --tag` 필터는 phase 02 다. 문서 갱신은 phase 03 이다.
`post comment list --json` 과 `post list --json` 은 손대지 않는다.
보강 범위를 `post get` 하나로 둔 근거는 ADR-056 의 「대안 기각」이 적는다.

## 컨텍스트

**근거 문서**: `docs/adr/056-json-enrichment-behind-option.md`.
관련된 기존 결정은 `docs/adr/021-member-command-creator-enrich.md` 와
`docs/adr/043-wiki-name-search-and-project-column.md` 다. 둘 다 `--json` 을 raw 로 두기로 정했다.

지금 동작은 아래와 같다.

`src/formatters/post.ts` 의 `formatPostDetail` 은 `--json` 이면 응답 전체를 그대로 낸다.
일반 출력은 번호와 제목, 프로젝트, 상태, 우선순위, 작성자, 담당자, 생성과 수정 시각, 본문을 낸다.
**태그는 어느 쪽에도 없다.**

응답의 `tags` 는 `src/api/types.ts` 의 `Tag` 형이고 `name` 이 선택 필드다.
실제 업무 상세 응답에는 `id` 만 들어 있다.

```json
"tags": [{"id": "<tagId>"}, {"id": "<tagId>"}]
```

**재사용할 것**은 하나다.

| 무엇 | 어디 | 쓰는 이유 |
| --- | --- | --- |
| `ensureTags(client, projectId)` | `src/resolvers/tag.ts` | 프로젝트 태그를 캐시로 받아 `{ id, name, color, group* }` 목록을 돌려준다 |

`ensureTags` 는 캐시가 유효하면 그대로 쓰고 아니면 받아 채운다. 조회 로직을 새로 만들지 않는다.

## 의도 메모

- 이름을 못 찾은 태그에 `name` 키를 **넣지 않는다.** 빈 문자열로 채우면 이름이 비어 있는 태그와 구별되지 않는다.
  근거는 ADR-056 이 적는다.
- 서버 응답에 `name` 이 이미 있으면 덮어쓰지 않는다. 나중에 API 가 이름을 내려주게 되면 그쪽이 맞다.
- 일반 출력의 태그 줄은 옵션 없이 항상 낸다. 그쪽은 raw 유지 규약의 대상이 아니다(ADR-021).
- 일반 출력의 태그 조회가 실패해도 `post get` 은 성공으로 끝낸다.
  사람이 읽는 출력이라 태그 한 줄 때문에 상세 조회 전체를 버릴 이유가 없다.
  `--with-tag-names` 는 반대다. 옵션을 준 호출은 이름을 기대하므로 못 채우면 실패한다.

## 작업 항목

### 1. `src/formatters/post.ts` 의 `formatPostDetail` 시그니처를 넓힌다

이름을 붙인 태그 목록을 밖에서 받는다. 포맷터가 API 를 부르지 않게 하려는 것이다.

```ts
export interface PostDetailTag {
  id: string;
  name?: string;
}

export function formatPostDetail(
  post: PostDetail,
  opts: OutputOptions,
  tags?: PostDetailTag[],
): void
```

`--json` 분기는 `tags` 인자가 있을 때만 응답의 `tags` 를 그것으로 바꾼다.
없으면 지금처럼 응답을 그대로 낸다. 다른 키는 건드리지 않는다.

일반 출력에는 `담당자:` 줄 **다음**에 태그 줄을 넣는다.

```
태그: <이름1>, <이름2>
```

이름을 못 찾은 태그는 `<이름>` 자리에 그 id 를 넣고 뒤에 `(이름 없음)` 을 붙인다.
태그가 하나도 없으면 그 줄 자체를 내지 않는다. 빈 줄을 내면 태그가 없는 업무마다 의미 없는 줄이 생긴다.

이 함수를 쓰는 다른 곳이 있는지 확인한다.

```bash
# cwd: <repo root>
grep -rn "formatPostDetail" src/
```

세 번째 인자를 선택으로 두었으므로 기존 호출은 고치지 않아도 된다.

### 2. `src/resolvers/tag.ts` 에 이름을 붙이는 함수를 더한다

```ts
export interface TagNameResult {
  tags: { id: string; name?: string }[];
  missing: string[];
}

/** 업무 응답의 태그에 프로젝트 태그 캐시의 이름을 붙인다. 찾지 못한 id 는 missing 에 담는다. */
export async function attachTagNames(
  client: DoorayApiClient,
  projectId: string,
  tags: ReadonlyArray<{ id: string; name?: string }>,
): Promise<TagNameResult>
```

- `tags` 가 비어 있으면 API 를 부르지 않고 빈 결과를 돌려준다.
  태그가 없는 업무마다 목록을 받으면 왕복이 낭비된다
- 이미 `name` 이 있는 항목은 그대로 둔다
- `ensureTags` 결과에서 id 로 찾는다. 이름이 빈 문자열이면 못 찾은 것으로 본다.
  `fetchAllTags` 가 `t.name ?? ""` 로 채우고 있어 빈 문자열이 「이름이 없다」는 뜻이다
- 못 찾은 id 는 `missing` 에 담는다. 던지지 않는다.
  호출부가 일반 출력과 `--with-tag-names` 에서 다르게 처리해야 하기 때문이다

### 3. `src/commands/post/get.ts` 에 `--with-tag-names` 를 더한다

```ts
.option("--with-tag-names", "태그에 이름을 채운다 (--json 출력에 name 필드 추가)")
```

동작은 이렇다.

1. 업무를 받는다
2. `post.tags` 가 비어 있으면 `attachTagNames` 를 부르지 않고 지금과 같이 출력한다
3. 비어 있지 않으면 `attachTagNames` 를 부른다
4. `--with-tag-names` 가 있고 `missing` 이 비어 있지 않으면
   `EXIT_API_ERROR` 로 던진다. 문구에 못 찾은 id 를 적고 캐시를 지우는 방법을 안내한다
5. `--with-tag-names` 가 있고 `missing` 이 비어 있으면 붙인 목록을 포맷터에 넘긴다
6. `--with-tag-names` 가 없으면 `--json` 은 raw 그대로 내고,
   일반 출력에만 붙인 목록을 쓴다

3번에서 `attachTagNames` 가 실패하면 처리가 갈린다.

- `--with-tag-names` 가 있으면 그 오류를 그대로 던진다
- 없으면 오류를 삼키고 stderr 에 한 줄 경고를 낸 뒤 이름 없이 진행한다.
  사람이 읽는 출력이라 태그 줄 하나 때문에 상세 조회를 버리지 않는다

4번의 오류 문구는 이렇다.

```
태그 이름을 찾지 못했습니다: <id>, <id>
  태그 캐시가 오래됐을 수 있습니다: dooray cache clear
```

`cache clear` 의 실제 명령 형태를 `src/commands/cache.ts` 에서 확인해 옮긴다.
태그 캐시만 지우는 방법이 있으면 그것을 적는다.

### 4. `src/resolvers/tag.test.ts` 에 확인 넷을 더한다

| 확인할 것 | 입력 | 기대 |
| --- | --- | --- |
| 빈 목록 | `tags` 가 빈 배열 | API 가 불리지 않고 빈 결과가 온다 |
| 모두 찾음 | 캐시에 모든 id 가 있음 | 각 항목에 `name` 이 붙고 `missing` 이 빈 배열이다 |
| 일부 못 찾음 | 캐시에 없는 id 가 하나 | 그 항목에 `name` 키가 없고 `missing` 에 그 id 가 있다 |
| 이름이 빈 문자열 | 캐시의 그 항목 `name` 이 `""` | `missing` 에 들어간다 |

세 번째는 `name` 이 `undefined` 인지가 아니라 **키가 없는지** 확인한다.
`expect(tag).not.toHaveProperty("name")` 형태여야 `undefined` 로 채운 경우도 잡힌다.

### 5. `src/commands/post/get.test.ts` 를 만들고 확인 다섯을 담는다

이 파일이 없으면 만든다. `src/commands/post/edit.test.ts` 의 mock 방식을 따른다.

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| 일반 출력의 태그 줄 | 태그 2개, 이름 모두 찾음 | 출력에 `태그: ` 로 시작하는 줄이 있고 두 이름이 들어 있다 |
| 태그 없는 업무 | `tags` 가 빈 배열 | `태그:` 줄이 없고 태그 목록 API 가 불리지 않는다 |
| 옵션 없는 `--json` | `--json` 만 | 출력의 `tags` 에 `name` 키가 없다 |
| 옵션 있는 `--json` | `--json --with-tag-names`, 모두 찾음 | 각 태그에 `name` 이 있다 |
| 옵션 있고 못 찾음 | `--json --with-tag-names`, 하나를 못 찾음 | `EXIT_API_ERROR` 로 던진다 |

세 번째가 ADR-056 의 핵심이다. 옵션을 주지 않은 호출의 출력이 종전과 같아야 한다.

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
pnpm vitest run src/resolvers/tag.test.ts src/commands/post/get.test.ts
```

종료 코드 0 이어야 한다.

옵션이 등록됐는지 본다.

```bash
# cwd: <repo root>
node dist/index.js post get --help
```

출력에 `--with-tag-names` 가 있어야 한다.

변경이 들어갔는지 본다.

```bash
# cwd: <repo root>
grep -c "attachTagNames" src/resolvers/tag.ts        # >= 1
grep -c "attachTagNames" src/commands/post/get.ts    # >= 1
grep -c "withTagNames" src/commands/post/get.ts      # >= 1
```

실제 계정으로 확인한다. 태그가 붙은 업무를 사용자에게 받는다. 조회만 하므로 되돌릴 것이 없다.

```bash
# cwd: <repo root>
node dist/index.js post get <프로젝트> <업무번호> | head -20
node dist/index.js post get <프로젝트> <업무번호> --json --with-tag-names ; echo "종료코드=$?"
```

첫 명령의 출력에 `태그:` 줄이 있고 이름이 들어 있어야 한다.
두 번째는 `종료코드=0` 이고 `tags` 의 각 항목에 `name` 이 있어야 한다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/formatters/post.ts` | 수정 — `formatPostDetail` 이 태그 목록을 받고 태그 줄을 낸다 |
| `src/resolvers/tag.ts` | 수정 — `attachTagNames` 추가 |
| `src/resolvers/tag.test.ts` | 수정 — 확인 4건 추가 |
| `src/commands/post/get.ts` | 수정 — `--with-tag-names` 와 처리 분기 |
| `src/commands/post/get.test.ts` | 신규 — 확인 5건 |
