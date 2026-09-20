# Phase 01. 개인 프로젝트를 두 resolver 가 찾게 한다

**Execution profile**: standard

## 목표

`resolveProject` 가 공용 캐시에서 실패한 자리에서 private 프로젝트 목록을 받아 다시 찾게 한다.
`resolveWiki` 가 공용 캐시 하나가 아니라 공용과 private 두 캐시를 모두 보게 한다.

**범위 외**: `wiki page edit` 의 `--id` 모드는 phase 02 다.
README 와 스킬 문서와 `docs/code-architecture.md` 갱신은 phase 03 이다.
공용 캐시와 private 캐시를 하나로 합치는 일은 이 plan 이 다루지 않는다.

## 컨텍스트

**근거 문서**: `docs/adr/054-private-project-resolution.md`.

지금 동작은 아래와 같다.

`src/resolvers/project.ts` 의 `resolveProject` 는 네 단계를 거친다.

1. 입력이 15자리 이상 숫자면 그대로 projectId 로 본다 (ADR-030)
2. `ensureProjects` 로 공용 프로젝트 캐시를 채우고 `code` 나 `id` 로 찾는다
3. private 캐시가 **이미 유효할 때만** 그 안을 찾는다. `getPrivateProjects()` 와 `isExpired` 로 판정한다
4. 없으면 `프로젝트를 찾을 수 없습니다` 를 던진다

3번이 문제다. private 캐시가 없거나 기간이 지나면 그 단계가 통째로 건너뛰어진다.
같은 파일에 `ensurePrivateProjects` 가 이미 있고, 그 함수가 캐시를 확인하고 없으면 받아 채운다.
3번이 그 함수를 부르지 않고 캐시를 직접 읽는 것이 원인이다.

`src/resolvers/wiki.ts` 의 `resolveWiki` 는 `resolveProject` 를 부른 뒤
`getProjects()` 가 돌려주는 **공용 캐시에서만** 항목을 찾아 `wikiId` 를 꺼낸다.
개인 프로젝트는 private 캐시에만 있으므로 항목이 없고, 위키가 있어도
`프로젝트에 위키가 없습니다` 로 끝난다.

**재사용할 것**은 둘이다.

| 무엇 | 어디 | 쓰는 이유 |
| --- | --- | --- |
| `ensurePrivateProjects` | `src/resolvers/project.ts` | 캐시가 유효하면 그대로, 아니면 받아 채운다. 판정이 이미 그 안에 있다 |
| `isExpired` | `src/cache/store.ts` | 캐시 유효 판정. 새로 만들지 않는다 |

기존 테스트 파일이 `src/resolvers/project.test.ts` 와 `src/resolvers/wiki.test.ts` 에 있다.
그 파일들의 mock 방식을 그대로 따른다.

## 의도 메모

- 입력이 `@` 로 시작할 때만 private 목록을 받는 안을 기각한 이유는 ADR-054 의 「대안 기각」이 적는다.
  개인 프로젝트 코드의 형태에 기대는 방식이라 그 형태가 아닌 경우에 같은 실패가 남는다.
- private 목록 조회는 **공용 캐시에서 못 찾았을 때만** 나간다.
  공용 캐시에서 찾은 호출에는 왕복이 붙지 않는다. 대부분의 호출이 그쪽이다.
- `resolveWiki` 는 두 캐시를 합쳐서 찾는다. 같은 `code` 가 양쪽에 있는 경우는 공용을 먼저 쓴다.
  공용 프로젝트가 사용자가 의도한 대상일 가능성이 높고, 지금 동작도 공용을 본다.

## 작업 항목

### 1. `src/resolvers/project.ts` 의 `resolveProject` 를 고친다

3번 단계를 아래로 바꾼다.

```ts
// private 프로젝트는 별도 목록에만 있다. 캐시가 없거나 기간이 지났으면 받아서 채운다 (ADR-054).
const privateProjects = await ensurePrivateProjects(client);
const privateMatch = privateProjects.find((p) => p.code === input || p.id === input);
if (privateMatch) return privateMatch.id;
```

`getPrivateProjects` 와 `isExpired` 를 이 함수에서 더 쓰지 않는다.
두 import 가 다른 곳에서도 쓰이는지 확인하고, 쓰이지 않으면 import 에서 뺀다.
`buildProjectCodeMap` 이 둘을 쓰고 있으므로 import 자체는 남는다.

던지는 오류 문구에서 캐시 갱신 안내 줄을 뺀다.
이제 그 조회를 CLI 가 스스로 하므로, 사람에게 시키는 안내는 사실과 맞지 않는다.

```
프로젝트를 찾을 수 없습니다: <입력>
  목록에 없는 프로젝트는 projectId 를 직접 넣으면 됩니다 (15자리 이상 숫자)
```

### 2. `src/resolvers/wiki.ts` 의 `resolveWiki` 를 고친다

`getProjects()` 한 곳만 보던 것을 두 캐시로 넓힌다.

```ts
export async function resolveWiki(
  client: DoorayApiClient,
  projectCode: string,
): Promise<string> {
  // resolveProject 가 공용·private 두 목록을 모두 채운다 (ADR-054).
  const projectId = await resolveProject(client, projectCode);

  const publicEntry = await getProjects();
  const privateEntry = await getPrivateProjects();
  const candidates = [...(publicEntry?.data ?? []), ...(privateEntry?.data ?? [])];
  const project = candidates.find(
    (p) => p.id === projectId || p.code === projectCode || p.id === projectCode,
  );
  // ...
}
```

`resolveProject` 가 돌려준 `projectId` 로 먼저 찾는다.
입력이 15자리 이상 숫자면 `resolveProject` 가 캐시를 거치지 않고 그대로 돌려주므로(ADR-030),
그 값으로 찾아야 캐시에 있는 항목과 맞는다.

`getPrivateProjects` 를 이 파일에 import 한다.
유효 기간은 확인하지 않는다. `resolveProject` 가 방금 `ensurePrivateProjects` 로 채웠기 때문이다.

`project?.wikiId` 가 없을 때 던지는 오류와 `orgIdHint` 는 그대로 둔다.

### 3. `src/resolvers/project.test.ts` 에 확인 셋을 더한다

기존 파일의 mock 방식을 그대로 쓴다.

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| private 캐시가 비었을 때 | 공용 캐시에 없는 코드, private 캐시 없음, 목록 API 가 그 코드를 돌려줌 | projectId 를 돌려주고 `getProjects` 계열 API 가 private 타입으로 한 번 불린다 |
| private 캐시가 유효할 때 | 공용 캐시에 없는 코드, private 캐시에 그 코드가 있음 | projectId 를 돌려주고 private 목록 API 가 불리지 않는다 |
| 양쪽 어디에도 없을 때 | 공용에도 private 에도 없는 코드 | `EXIT_PARAM_ERROR` 로 던지고 문구에 `dooray project list --type private` 가 없다 |

세 번째는 문구에서 안내 줄을 뺀 것을 확인하는 것이다.
`toThrow` 만 확인하면 문구가 남아 있어도 통과한다.

### 4. `src/resolvers/wiki.test.ts` 에 확인 둘을 더한다

| 확인할 것 | 상황 | 기대 |
| --- | --- | --- |
| private 프로젝트의 위키 | 공용 캐시는 비었고 private 캐시에 `wikiId` 를 가진 항목이 있음 | 그 `wikiId` 를 돌려준다 |
| projectId 를 직접 넣었을 때 | 입력이 15자리 이상 숫자이고 그 id 가 private 캐시에 있음 | 그 항목의 `wikiId` 를 돌려준다 |

두 번째는 `resolveProject` 가 캐시를 거치지 않고 입력을 그대로 돌려주는 경로다.
그 값으로 캐시를 찾지 않으면 이 확인이 실패한다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 종료 코드 0 이어야 한다.

이 phase 의 테스트만 골라 돌린다.

```bash
# cwd: <repo root>
pnpm vitest run src/resolvers/project.test.ts src/resolvers/wiki.test.ts
```

종료 코드 0 이어야 한다.

변경이 실제로 들어갔는지 본다.

```bash
# cwd: <repo root>
grep -c "ensurePrivateProjects" src/resolvers/project.ts          # >= 2
grep -c "getPrivateProjects" src/resolvers/wiki.ts                # >= 1
grep -c "dooray project list --type private" src/resolvers/project.ts   # = 0
```

마지막 줄이 0 이어야 한다. 캐시 갱신 안내를 오류 문구에서 뺀 것을 확인하는 값이다.

실제 계정으로 확인한다. 개인 프로젝트 코드는 `dooray project list --type private` 로 얻는다.

```bash
# cwd: <repo root>
rm -f ~/.dooray/cache/private-projects.json
node dist/index.js wiki tree <개인 프로젝트 코드> ; echo "종료코드=$?"
```

`종료코드=0` 이어야 하고 출력에 페이지 트리가 나와야 한다.
캐시 파일을 지운 상태에서 시작하는 것이 이 확인의 요점이다.
캐시 파일 이름이 다르면 `ls ~/.dooray/cache/` 로 확인해 private 목록 파일을 지운다.

개인 식별 정보를 확인한다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
```

종료 코드 0 이어야 한다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/resolvers/project.ts` | 수정 — `resolveProject` 가 `ensurePrivateProjects` 를 부르고 오류 문구에서 캐시 안내를 뺀다 |
| `src/resolvers/wiki.ts` | 수정 — `resolveWiki` 가 공용과 private 두 캐시를 본다 |
| `src/resolvers/project.test.ts` | 수정 — 확인 3건 추가 |
| `src/resolvers/wiki.test.ts` | 수정 — 확인 2건 추가 |
