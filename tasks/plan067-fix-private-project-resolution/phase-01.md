# Phase 01. 개인 프로젝트를 두 resolver 가 찾게 한다

**Execution profile**: standard

## 목표

`resolveProject` 가 공용 캐시에서 실패한 자리에서 private 프로젝트 목록을 받아 다시 찾게 한다.
`resolveWiki` 가 공용 캐시 하나가 아니라 공용과 private 두 캐시를 모두 보게 한다.

**범위 외**: `wiki page edit` 의 `--id` 모드는 phase 02 다.
README 와 스킬 문서와 `docs/code-architecture.md` 갱신은 phase 03 이다.
공용 캐시와 private 캐시를 하나로 합치는 일은 이 plan 이 다루지 않는다.
`resolveWiki` 가 wikiId 를 직접 받게 하는 것도 다루지 않는다.
15자리 이상 숫자를 projectId 로 볼지 wikiId 로 볼지 구별할 수 없어
ADR-054 의 「대안 기각」 네 번째가 기각했다.

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

**두 캐시를 읽는 것만으로는 모자란다.** 입력이 15자리 이상 숫자면 `resolveProject` 가
1번 단계에서 그대로 돌려주므로(ADR-030) 어느 캐시도 채워지지 않은 채 `resolveWiki` 에 닿는다.
그 경로에서 캐시만 읽으면 개인 프로젝트의 projectId 는 종전과 같이 실패한다.
이슈의 「projectId 를 직접 넣어도 같은 결과」가 이 경로다.
`resolveWiki` 가 두 캐시에서 못 찾았을 때 그 자리에서 private 목록을 받아 채우고
다시 찾아야 한다. ADR-054 의 결정 절이 이것을 적는다.

`--link-task` 도 이 수정으로 함께 고쳐진다.
`src/resolvers/task-link.ts:12` 가 `resolvePostInput` 을 부르고,
`src/resolvers/post-input.ts:172` 가 그 안에서 `resolveProject` 를 부른다.
대상 지정과 같은 resolver 를 쓰므로 1번 항목의 수정이 그대로 닿는다.
`--link-task` 전용으로 손댈 코드는 없다.

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
- `src/resolvers/task-link.ts:9` 의 `Promise.all` 이 링크마다 `resolveProject` 를 병렬로 부른다.
  private 캐시가 비어 있으면 목록 조회가 링크 수만큼 동시에 나간다.
  이 plan 에서는 그대로 둔다. `api/rate-limiter` 가 요청 간격을 이미 조절하고,
  한 번 받은 목록이 캐시에 남아 같은 세션에서 반복되지 않는다.
  ADR-054 의 「감당할 것」에 이 항목을 phase 03 에서 더한다.

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
  const projectId = await resolveProject(client, projectCode);

  const matches = (p: CachedProject) =>
    p.id === projectId || p.code === projectCode || p.id === projectCode;

  const publicEntry = await getProjects();
  const privateEntry = await getPrivateProjects();
  let project = [...(publicEntry?.data ?? []), ...(privateEntry?.data ?? [])].find(matches);

  // 입력이 15자리 이상 숫자면 resolveProject 가 캐시를 거치지 않고 그대로 돌려준다 (ADR-030).
  // 그 경로에서는 private 캐시가 비어 있을 수 있으므로 여기서 받아 채우고 다시 찾는다 (ADR-054).
  if (!project) {
    project = (await ensurePrivateProjects(client)).find(matches);
  }
  // ...
}
```

`resolveProject` 가 돌려준 `projectId` 로 먼저 찾는다.
입력이 15자리 이상 숫자면 `resolveProject` 가 캐시를 거치지 않고 그대로 돌려주므로(ADR-030),
그 값으로 찾아야 캐시에 있는 항목과 맞는다.

`getPrivateProjects` 와 `ensurePrivateProjects` 와 `CachedProject` 타입을 이 파일에 import 한다.
캐시를 읽을 때 유효 기간은 확인하지 않는다.
못 찾았을 때 부르는 `ensurePrivateProjects` 가 유효 기간을 스스로 판정하고,
기간이 지났으면 목록을 다시 받는다.

**두 캐시에서 찾았으면 `ensurePrivateProjects` 를 부르지 않는다.**
프로젝트 코드로 부르는 대부분의 호출은 `resolveProject` 가 이미 캐시를 채운 뒤라 여기서 걸린다.
추가 왕복은 projectId 를 직접 넣은 경로와 어디에도 없는 입력에만 붙는다.

`project?.wikiId` 가 없을 때 던지는 오류와 `orgIdHint` 는 그대로 둔다.

### 3. `src/resolvers/project.test.ts` 의 기존 확인 하나를 고치고 셋을 더한다

**먼저 기존 확인을 고친다.** `project.test.ts:42` 의 「code 매칭 실패」가 두 가지로 깨진다.

- `project.test.ts:51` 의 `expect(err.message).toContain("dooray project list --type private")` 는
  1번 항목이 그 줄을 오류 문구에서 빼므로 실패한다.
  `toContain` 을 `not.toContain` 으로 뒤집는다
- 그 확인은 client 를 `{} as unknown as DoorayApiClient` 로 넘긴다(`project.test.ts:43`).
  새 코드가 `ensurePrivateProjects(client)` 를 부르고, mock 의 `getPrivateProjects` 가
  `null` 이라(`project.test.ts:19`) `client.getProjects(...)` 까지 간다.
  `{}` 에는 그 함수가 없어 TypeError 로 끝난다.
  `wiki.test.ts:73` 의 `mockProjectClient` 와 같은 형태로
  `{ getProjects: vi.fn().mockResolvedValue({ result: [], totalCount: 0 }) }` 를 넘긴다

client mock 이 필요한 확인이 여럿이 되므로 그 생성을 파일 안의 헬퍼 함수 하나로 둔다.

**그 다음 아래 셋을 더한다.** 기존 파일의 mock 방식을 그대로 쓴다.

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
| projectId 를 직접 넣었을 때 | 입력이 15자리 이상 숫자이고 **private 캐시가 비어 있음**. private 목록 API 가 그 id 와 `wikiId` 를 돌려줌 | 그 `wikiId` 를 돌려주고 private 목록 API 가 한 번 불린다 |

두 번째가 이 phase 의 핵심 확인이다.
`resolveProject` 가 캐시를 거치지 않고 입력을 그대로 돌려주는 경로라,
어느 캐시도 채워지지 않은 상태에서 `resolveWiki` 에 닿는다.
**private 캐시가 이미 채워진 상황으로 확인하면 안 된다.** 그 상황은 캐시를 읽기만 해도 통과해
실제로 실패하는 경로를 확인하지 못한다.

기존 파일의 `vi.mock("../cache/store.js", ...)` 는 `getPrivateProjects` 가 `null` 을 돌려준다.
상황마다 반환값이 달라야 하므로 그 mock 함수의 반환값을 테스트 안에서
`mockResolvedValueOnce` 로 다시 지정한다.

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
grep -c "ensurePrivateProjects" src/resolvers/wiki.ts             # >= 1
! grep -q "dooray project list --type private" src/resolvers/project.ts
```

세 줄이 모두 종료 코드 0 이어야 한다.
마지막 줄이 캐시 갱신 안내를 오류 문구에서 뺀 것을 판정한다.
`grep -c` 에 `# = 0` 주석을 달아 두면 일치가 없을 때 종료 코드 1 로 끝나므로 `! grep -q` 를 쓴다.

실제 계정으로 확인한다. 개인 프로젝트 코드는 `dooray project list --type private` 로 얻는다.
그 출력의 `--json` 에서 `id` 도 함께 적어 둔다. 두 번째 확인에 쓴다.

```bash
# cwd: <repo root>
rm -f ~/.dooray/cache/projects-private.json
node dist/index.js wiki tree <개인 프로젝트 코드> ; echo "종료코드=$?"
```

`종료코드=0` 이어야 하고 출력에 페이지 트리가 나와야 한다.
캐시 파일을 지운 상태에서 시작하는 것이 이 확인의 요점이다.

projectId 를 직접 넣는 경로도 같은 방식으로 본다.

```bash
# cwd: <repo root>
rm -f ~/.dooray/cache/projects-private.json
node dist/index.js wiki tree <개인 프로젝트의 projectId> ; echo "종료코드=$?"
```

`종료코드=0` 이어야 한다. 이 경로는 `resolveProject` 가 캐시를 거치지 않으므로
`resolveWiki` 안의 `ensurePrivateProjects` 호출이 없으면 실패한다.

`--link-task` 가 개인 프로젝트 코드를 해석하는지 본다.

```bash
# cwd: <repo root>
rm -f ~/.dooray/cache/projects-private.json
node dist/index.js post edit <개인 프로젝트 코드> <업무 번호> \
  --body "확인" --link-task <개인 프로젝트 코드>/<다른 업무 번호> --dry-run ; echo "종료코드=$?"
```

`종료코드=0` 이어야 하고 출력의 본문에 링크가 만들어져 있어야 한다.
`--dry-run` 이라 실제 업무는 바뀌지 않는다.
이 확인이 이슈의 3번 항목이 처리됐다는 근거다.

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
| `src/resolvers/wiki.ts` | 수정 — `resolveWiki` 가 두 캐시를 보고, 못 찾으면 private 목록을 받아 다시 찾는다 |
| `src/resolvers/project.test.ts` | 수정 — 기존 확인 1건 수정, 확인 3건 추가 |
| `src/resolvers/wiki.test.ts` | 수정 — 확인 2건 추가 |
