# Phase 02. `post list` 가 태그로 거를 수 있게 한다

**Execution profile**: standard

## 목표

`post list --tag <이름>` 으로 그 태그가 붙은 업무만 받게 한다.

**범위 외**: `post get` 의 태그 노출은 phase 01 이다. 문서 갱신은 phase 03 이다.
`post list` 의 표에 태그 열을 더하지 않는다. 이유는 아래 「의도 메모」가 적는다.
`post list --json` 의 태그에 이름을 채우지 않는다. 보강 범위를 `post get` 하나로 둔 근거는 ADR-056 이 적는다.

## 컨텍스트

**근거 문서**: `docs/adr/056-json-enrichment-behind-option.md` 의 「적용 범위」 절.

`src/api/client.ts` 의 `getPosts` 가 `tagIds` 질의 인자를 **이미 처리한다.**
`joinIds(params?.tagIds)` 로 쉼표로 이어 붙여 보낸다. API 쪽 작업은 없다.

`src/commands/post/list.ts` 는 `--subject`, `--all`, `--page`, `--size` 네 옵션만 받는다.
`params` 객체에 `subjects` 만 넣고 있다.

**재사용할 것**은 하나다.

| 무엇 | 어디 | 쓰는 이유 |
| --- | --- | --- |
| `lookupTagIds(client, projectId, names)` | `src/resolvers/tag.ts` | 태그 이름 목록을 id 목록으로 바꾼다. `post edit --tag` 가 이미 쓴다 |

`lookupTagIds` 의 매칭 정책(정확일치 → 부분일치 → 모호하면 후보 출력)은 그 함수가 소유한다.
`post list --tag` 도 같은 정책을 그대로 따른다. 명령마다 다르면 사용자가 외워야 한다.

## 의도 메모

- 표에 태그 열을 더하지 않는다. `post list` 의 표는 이미 다섯 열이고,
  ADR-043 이 위키 목록에 열을 더했을 때 좁은 터미널에서 줄이 접히는 것을 감당할 것으로 적었다.
  태그는 업무마다 개수가 달라 열 폭이 더 불규칙하다.
  목록에서 태그로 찾는 요구는 필터가 직접 담는다.
- `--tag` 를 여러 번 주면 그 태그들을 모두 보낸다. 서버가 그것을 어떻게 해석하는지는 아래 작업 항목 1이 정한다.

## 작업 항목

### 1. `tagIds` 에 여러 값을 보냈을 때의 동작을 확인한다

공식 API 문서에서 `GET /project/v1/projects/{project-id}/posts` 의 `tagIds` 설명을 읽는다.
여러 id 를 보내면 그 태그를 **모두 가진** 업무인지, **하나라도 가진** 업무인지 확인한다.

공식 문서는 React 앱이라 `WebFetch` 로 본문을 읽을 수 없다.
`~/.claude/scripts/browser-driver` 로 연다. 명령 목록과 유의할 점은 `browser-driver help` 의 출력이 소유한다.
문서 주소는 `CLAUDE.md` 의 「API 스펙 확인 절차」 절에 있다.

문서가 그것을 정의하지 않으면 사용자에게 태그 둘이 서로 다르게 붙은 업무가 있는 프로젝트를 받아 실제로 호출해 확인한다.

확인한 결과를 `--tag` 옵션의 설명 문구에 적는다. 그 문구가 사용자가 읽는 유일한 설명이다.

### 2. `src/commands/post/list.ts` 에 `--tag` 를 더한다

`post edit` 의 `--tag` 와 같은 형태로 반복 가능하게 만든다.

```ts
.option(
  "--tag <name>",
  "<작업 항목 1에서 확인한 동작을 적는다>",
  (v, prev: string[]) => [...prev, v],
  [] as string[],
)
```

`action` 안에서 이름을 id 로 바꿔 `params` 에 넣는다.

```ts
const tagNames: string[] = (opts.tag ?? []).filter((s: string) => s.length > 0);
if (tagNames.length > 0) {
  params.tagIds = await lookupTagIds(client, projectId, tagNames);
}
```

`params` 의 타입 선언에 `tagIds?: string[]` 을 더한다.
지금 그 객체는 네 필드만 가진 인라인 타입이다.

`lookupTagIds` 는 `resolveProject` 로 얻은 `projectId` 가 필요하므로
그 호출 **뒤**에 둔다. 지금 코드에서 `projectId` 를 얻는 줄 바로 다음이다.

### 3. `src/commands/post/list.test.ts` 를 만들고 확인 넷을 담는다

이 파일이 없으면 만든다. `src/commands/post/edit.test.ts` 의 mock 방식을 따른다.

| 확인할 것 | 입력 | 기대 |
| --- | --- | --- |
| 태그 없음 | `--tag` 를 주지 않음 | `getPosts` 에 넘어간 인자에 `tagIds` 키가 없고 태그 조회 API 가 불리지 않는다 |
| 태그 하나 | `--tag <이름>` | `tagIds` 에 그 이름의 id 하나가 들어간다 |
| 태그 둘 | `--tag A --tag B` | `tagIds` 에 두 id 가 들어간다 |
| `--all` 과 함께 | `--tag <이름> --all` | 모든 페이지 호출에 같은 `tagIds` 가 들어간다 |

첫 번째는 키 존재로 확인한다. `expect(args).not.toHaveProperty("tagIds")` 형태여야
빈 배열을 넣은 경우도 잡힌다. 빈 배열을 보내면 `joinIds` 가 빈 문자열을 내고 그것이 질의에 붙을 수 있다.

네 번째는 `--all` 의 반복 호출이 `params` 를 펼쳐 쓰는 구조라 회귀가 나기 쉬운 자리다.

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
pnpm vitest run src/commands/post/list.test.ts
```

종료 코드 0 이어야 한다.

옵션이 등록됐는지 본다.

```bash
# cwd: <repo root>
node dist/index.js post list --help
```

출력에 `--tag` 가 있어야 하고, 그 설명이 작업 항목 1에서 확인한 동작을 적고 있어야 한다.

변경이 들어갔는지 본다.

```bash
# cwd: <repo root>
grep -c "lookupTagIds" src/commands/post/list.ts   # >= 1
grep -c "tagIds" src/commands/post/list.ts         # >= 2
```

실제 계정으로 확인한다. 태그가 붙은 업무가 있는 프로젝트를 사용자에게 받는다. 조회만 하므로 되돌릴 것이 없다.

```bash
# cwd: <repo root>
node dist/index.js post list <프로젝트> --tag <태그 이름> --quiet ; echo "종료코드=$?"
```

`종료코드=0` 이어야 하고, 출력의 업무 번호가 그 태그를 붙인 업무들이어야 한다.
태그를 붙이지 않은 업무 번호가 섞여 있으면 필터가 동작하지 않는 것이다.

없는 태그 이름을 주면 후보 목록과 함께 멈추는지 본다.

```bash
# cwd: <repo root>
node dist/index.js post list <프로젝트> --tag zzz-없는태그 ; echo "종료코드=$?"
```

`종료코드=3` 이어야 한다. `lookupTagIds` 가 `EXIT_PARAM_ERROR` 로 던진다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/post/list.ts` | 수정 — `--tag` 추가와 `tagIds` 전달 |
| `src/commands/post/list.test.ts` | 신규 — 확인 4건 |
