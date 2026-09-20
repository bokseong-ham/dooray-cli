# plan067 검토 지적 (판정: REJECT)

`tasks/plan067-fix-private-project-resolution/` 을 이슈 #173 의 항목 1, 2, 3 과 대조한 결과다.
**구현을 시작하기 전에 아래를 plan 에 반영하고, 반영한 것을 커밋으로 남긴다.**

아래 목록은 전수가 아니다. 같은 성격의 결함이 더 있을 수 있으므로
`gh issue view 173` 과 `docs/adr/054-private-project-resolution.md` 를 직접 읽고 한 번 더 대조한다.

## Critical

### C1. phase-03 의 검증이 그 phase 자신을 거절한다

`phase-03.md:151` 이 `verify_task.py` 종료 코드 0 을 요구한다. 지금 돌리면 1 이다.

```
tasks/plan067-fix-private-project-resolution/phase-03.md — 마지막 작업 항목이 테스트가 아니다: ### 6. `index.json` 을 완료로 표시한다
```

검사기는 마지막 `###` 작업 항목에 `테스트|검사|test|spec` 중 하나가 있기를 요구한다
(`~/.claude/skills/planning/scripts/verify_task.py:153-157`).
`phase-03.md:102` 의 「6. `index.json` 을 완료로 표시한다」가 그 자리를 차지한다.

**고칠 것**: `index.json` 표시를 `###` 작업 항목에서 빼고 검증 절의 일반 문단으로 내린다.

### C2. phase-01 이 기존 테스트 2건을 깨뜨리는데 수정 지시가 없다

`src/resolvers/project.test.ts:42` 의 「code 매칭 실패」 확인이 두 가지로 깨진다.

- `project.test.ts:52` 가 `expect(err.message).toContain("dooray project list --type private")` 를 단언하는데
  `phase-01.md:72` 가 그 줄을 오류 문구에서 빼라고 지시한다
- 그 테스트는 client 를 `{} as unknown as DoorayApiClient` 로 넘긴다(`project.test.ts:43`).
  `phase-01.md:63` 의 새 코드가 `ensurePrivateProjects(client)` 를 부르고
  mock 의 `getPrivateProjects` 가 `null` 이라(`project.test.ts:19`) `client.getProjects(...)` 까지 간다.
  `{}` 에는 그 함수가 없어 TypeError 로 끝난다

`phase-01.md:111` 의 작업 항목 3 은 「확인 셋을 더한다」만 적고 기존 확인의 수정을 적지 않는다.

**고칠 것**: 작업 항목 3 에 기존 확인의 client mock 교체와 단언 뒤집기를 명시한다.

### C3. projectId 직접 입력 경로가 고쳐지지 않는데 테스트가 그것을 가린다

이슈 #173 의 1번은 「프로젝트 코드 대신 projectId 나 wikiId 를 직접 넣어도 같은 결과」라고 적는다.

`src/resolvers/project.ts:80` 에서 15자리 이상 숫자는 `ensureProjects` 도 `ensurePrivateProjects` 도
거치지 않고 즉시 반환된다. 캐시가 채워지지 않은 채 `resolveWiki` 에 닿는다.
`src/resolvers/wiki.ts:38` 의 `getProjects()` 는 공용 캐시만 읽으므로
`프로젝트에 위키가 없습니다` 가 그대로 남는다.

그런데 `phase-01.md:107` 은 이렇게 적는다.

```
유효 기간은 확인하지 않는다. `resolveProject` 가 방금 `ensurePrivateProjects` 로 채웠기 때문이다.
```

숫자 입력 경로에서는 사실이 아니다.
더 나쁜 것은 `phase-01.md:129` 의 확인 2번이 「그 id 가 private 캐시에 있음」을 전제한다는 점이다.
캐시가 채워진 상태만 확인하므로 **테스트는 통과하고 실제 동작은 실패한다.**

**고칠 것**: `resolveWiki` 가 두 캐시에서 못 찾으면 그 자리에서 private 목록을 받아 채우고 다시 찾게 한다.
확인 2번의 상황을 「private 캐시 없음」으로 바꾼다.
이 결정은 `docs/adr/054-private-project-resolution.md` 의 결정 절에 이미 반영해 두었다. 그것을 따른다.

## Major

### M1. 이슈 3번(`--link-task`)이 어느 phase 에도 이름으로 없다

실제 경로는 `src/resolvers/task-link.ts:12` → `src/resolvers/post-input.ts:172` 의 `resolveProject` 라
phase 01 의 수정이 결과적으로 고치기는 한다. 그러나 목표와 검증 어디에도 `--link-task` 가 없어
이슈 3번이 처리됐다는 근거가 남지 않는다.

**고칠 것**: phase-01 컨텍스트에 그 호출 경로를 적고, 검증에 `--link-task` 를 쓰는 명령 한 줄을 넣는다.

### M2. phase-03 의 CLAUDE.md 검증이 변경 전에도 통과한다

`phase-03.md:141` 의 `grep -c "wiki page edit" CLAUDE.md` 는
`CLAUDE.md:63` 의 `$EDITOR` 설명 줄 때문에 변경 전에도 1 이다.
작업 항목 1 을 건너뛰어도 통과한다.

**고칠 것**: 「입력 형식」 줄에 한정해 보는 값으로 바꾼다.

### M3. phase-02 의 작업 항목 1 이 자기 자신과 어긋난다

`phase-02.md:50` 과 `:62` 는 「`page-delete.ts` 를 본으로 삼는다」고 적는데
그 사이의 코드 조각(`phase-02.md:53-57`)이 `page-delete.ts:15-19` 와 다른 문자열을 준다.
인자 이름이 `[project]`/`[page-id]` 와 `[arg1]`/`[arg2]` 로 다르고,
`--project` 의 인자명도 `<project>` 와 `<code>` 로 다르다.

**고칠 것**: 코드 조각을 지우고 「`page-delete.ts:15-19` 를 복사한 뒤 `-y, --yes` 만 뺀다」로 하거나,
반대로 62번 줄을 지우고 코드 조각을 정본으로 못박는다.

### M4. phase-02 의 새 테스트가 기존 테스트 8건을 깨뜨린다

`phase-02.md:99` 가 `resolveWikiPageInput` 을 mock 하라고 지시한다.
`vi.mock` 은 파일 단위라 `src/commands/wiki/page-edit.test.ts` 의 기존 확인 전부가 그 mock 을 거친다.
기존 확인들은 `mocks.resolveWiki.mockResolvedValue("wiki-1")`(`page-edit.test.ts:85`)에 기대는데,
`beforeEach` 에서 기본 반환값을 주지 않으면 전부 깨진다.
그런데 `phase-02.md:91` 은 「기존 확인은 그대로 두고 더한다」고 적는다.

**고칠 것**: `vi.hoisted` 에 `resolveWikiPageInput` 을 더하고
`beforeEach` 에서 `{ wikiId: "wiki-1", pageId: "page-1" }` 를 기본값으로 주라고 명시한다.
기존 `resolveWiki` mock 을 남길지도 함께 정한다.

### M5. `docs/flow.md:466` 이 낡는데 phase-03 의 검색어가 찾지 못한다

`docs/flow.md:466` 의 「`wiki page` 의 `file`, `comment`, `delete` 도 같은 방식으로 `--id` 만 받는다」에
phase 02 를 끝내면 `edit` 이 들어가야 한다.
`phase-03.md:99` 의 검색어는 `resolveProject\|프로젝트 코드` 라 그 줄을 찾지 못한다.

**고칠 것**: 검색어에 `--id` 와 `wiki page` 를 더하고, 466번 줄 수정을 명시적 작업으로 적는다.

### M6. wikiId 직접 입력이 범위 외로 적히지 않았다

이슈 1번의 세 형태 중 wikiId 는 ADR-054 의 「대안 기각」 네 번째가 기각했다.
그런데 `phase-01.md:10-12` 와 `phase-02.md:10-11` 의 범위 외 절에 그 말이 없다.

**고칠 것**: phase-01 의 범위 외에 한 줄을 더한다.

## Minor

- **m1.** `phase-01.md:169` 의 캐시 파일 이름이 틀렸다.
  실제는 `projects-private.json` 이다(`src/cache/store.ts:21`).
- **m2.** `phase-01.md:160` 과 `phase-02.md:145` 의 `grep -c ... # = 0` 은 종료 코드 1 로 끝난다.
  `|| true` 를 붙이거나 `! grep -q` 로 바꾼다.
- **m3.** `phase-02.md:70` 이 `startSpinner` 를 `resolveWikiPageInput` 앞에 두는데,
  `src/commands/wiki/page-delete.ts:39` 가 주석까지 달아 반대로 둔다(validation-before-spinner).
- **m4.** `phase-03.md:49` 의 `grep -rln "resolveWikiPageInput" src/commands/` 는
  `src/commands/delete-confirmation-policy.test.ts` 를 함께 준다. 테스트를 빼는 조건을 준다.
- **m5.** `phase-02.md:83-84` 가 `pageId` 를 바꿀 자리를 하나만 적는데
  실제는 `src/commands/wiki/page-edit.ts:64` 와 `:117` 둘이다.
- **m6.** `README.md` 의 위키 예시 묶음(121-126번 줄)에 `wiki page edit` 줄이 없다.
  `phase-03.md:66` 이 그 사용 예를 고치라고 하는데 고칠 자리가 없다. 넣을 위치를 지정한다.
- **m7.** `src/resolvers/task-link.ts:9` 의 `Promise.all` 이 링크마다 `resolveProject` 를 병렬로 부른다.
  private 캐시가 비어 있으면 목록 조회가 동시에 여러 번 나간다. ADR-054 의 「감당할 것」에 없다.
