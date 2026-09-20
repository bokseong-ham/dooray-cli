# Phase 01. 업무 상태를 바꾸는 두 명령의 설명에 사용자가 쓰는 말을 넣는다

**Execution profile**: standard

## 목표

`post workflow` 와 `post done` 의 설명에 「업무 상태」와 「진행 상태」를 함께 담아,
그 말로 명령을 찾는 사람과 에이전트가 `--help` 목록 한 번으로 찾게 한다.
`post done` 이 워크플로를 옮기는 것과 같은 동작인지도 설명에 밝힌다.

**범위 외**: 워크플로 해석 정책과 `resolveWorkflow` 의 매칭 규칙은 그대로 둔다.
옵션과 인자의 구성도 바꾸지 않는다. 바꾸는 것은 설명 문자열과 그것을 옮겨 적은 문서뿐이다.

## 컨텍스트

Dooray 화면과 사용자는 업무의 진행 상태를 「업무 상태」나 「진행 상태」라고 부른다.
CLI 의 설명에는 「워크플로우」만 있어서, 상태를 바꾸려는 쪽이 먼저 `post edit --help` 를 열고
거기 없는 것을 확인한 뒤에야 `post --help` 목록에서 별도 명령을 찾는다.

에이전트는 `--help` 목록을 훑어 명령을 고르므로 설명에 들어 있는 낱말이 곧 검색 대상이 된다.

고칠 자리는 둘이다.

| 파일 | 줄 | 현재 |
| --- | --- | --- |
| `src/commands/post/workflow.ts` | 12 | `.description("업무 워크플로우 변경")` |
| `src/commands/post/done.ts` | 8 | `.description("업무 완료 처리")` |

두 명령은 서로 다른 endpoint 를 부른다.
`setPostDone` 은 `project/v1/projects/{projectId}/posts/{postId}/set-done` 이고(`src/api/client.ts:305-313`),
`setPostWorkflow` 는 `.../set-workflow` 에 `workflowId` 를 실어 보낸다(`src/api/client.ts:315-325`).
호출이 다르다는 것은 코드로 확인했다. **그 둘이 같은 결과를 내는지는 아직 확인하지 않았다.**
작업 항목 1 이 그것을 확정한다.

**근거 문서**: `docs/flow.md` 의 「업무 워크플로우 변경 흐름」 절

## 의도 메모

- 설명에 낱말을 더하는 것이지 바꾸는 것이 아니다. 「워크플로우」로 찾던 쪽이 못 찾게 되면 안 된다.
- 새 alias 명령을 만들지 않는다. 이름이 늘면 `post --help` 목록이 길어지고,
  어느 것이 정본인지 다시 갈린다. 요청도 설명 보강이지 명령 추가가 아니다.
- `post done` 의 동작 서술은 공식 API 문서로 확정한다.
  코드는 두 endpoint 가 다르다는 것까지만 말하고 결과가 같은지는 말하지 않는다.
  추측해서 적으면 그 문장이 다음 사람에게 근거가 된다.

## 작업 항목

### 1. `set-done` 이 워크플로를 옮기는지 공식 문서로 확정한다

`CLAUDE.md` 의 「API 스펙 확인 절차」를 따른다.
공식 문서는 React 앱이라 `WebFetch` 로 본문을 읽지 못하므로
`~/.claude/scripts/browser-driver` 로 연다. 명령 목록은 `browser-driver help` 의 출력이 소유한다.

문서에서 볼 것은 `set-done` 의 설명과 응답, 그리고 그것이 workflow 를 바꾸는지 여부다.

확인 결과에 따라 쓸 문구를 미리 정해 둔다. 구현자는 고르기만 한다.

| 확인 결과 | `post done` 의 설명 |
| --- | --- |
| `set-done` 이 워크플로를 완료 클래스로 옮긴다 | `업무 완료 처리 (업무 상태를 완료로 바꾼다)` |
| 워크플로와 별개의 완료 표시다 | `업무 완료 처리 (워크플로 변경과는 별개다)` |
| 문서가 정의하지 않는다 | `업무 완료 처리` 를 그대로 두고, 작업 항목 4 를 건너뛰고 무엇을 확인하지 못했는지 이 phase 의 보고에 적는다 |

문서가 정의하지 않으면 추측해 적지 않는다. `docs/adr/046-official-api-doc-precedence.md` 가
공식 문서를 근거의 상위에 두므로, 문서에 없는 것을 저장소 서술로 만들지 않는다.

### 2. 두 명령의 `description` 을 고친다

`src/commands/post/workflow.ts:12` 를 아래로 바꾼다.

```ts
.description("업무 워크플로우 변경 (업무 상태·진행 상태 변경)")
```

`src/commands/post/done.ts:8` 은 작업 항목 1 의 표에서 고른 문구로 바꾼다.

두 파일의 다른 줄은 손대지 않는다.

### 3. `skills/dooray-cli/SKILL.md` 의 의도 열을 보강한다

`skills/dooray-cli/SKILL.md:116-117` 의 두 행이 대상이다.
이 표는 에이전트가 의도로 명령을 찾는 자리라 `--help` 와 같은 낱말을 담아야 한다.

| 줄 | 현재 의도 | 바꿀 의도 |
| --- | --- | --- |
| 116 | `완료 처리` | `완료 처리 (업무 상태를 완료로)` |
| 117 | `워크플로우 변경` | `워크플로우 변경 (업무 상태·진행 상태 변경)` |

116 행의 괄호 안은 작업 항목 1 의 결과가 「별개다」이면 `완료 처리` 를 그대로 둔다.

`skills/dooray-cli/references/workflow.md` 도 연다.
그 파일에 「업무 상태」라는 말이 한 번도 없으면 첫 문단에 한 문장을 더한다.
이미 있으면 손대지 않는다.

이 두 파일은 공개 문서라 `ADR-NNN` 과 `Issue #NN` 같은 내부 번호를 넣지 않는다.
판정은 작업 항목 5 의 `node scripts/check-public-refs.mjs` 가 한다.

### 4. `docs/flow.md` 의 「업무 워크플로우 변경 흐름」 절에 한 줄을 더한다

`docs/flow.md:417-422` 의 코드 블록 아래에 작업 항목 1 로 확정한 내용을 한 문장으로 적는다.
`post done` 과 `post workflow` 가 같은 결과를 내는지, 다르면 어떻게 다른지가 그 문장이 담을 것이다.

문서가 정의하지 않아 확정하지 못했으면 이 항목을 건너뛴다.
확인하지 못한 것을 확인한 것처럼 적지 않는다.

### 5. `src/commands/post/description.test.ts` 로 설명 문구를 검사한다

새 파일을 만든다. commander 의 `Command` 객체는 `description()` 으로 설명을 돌려주므로
두 명령을 import 해 그 문자열을 단언한다.

| 확인할 것 | 대상 | 기대 |
| --- | --- | --- |
| 상태라는 말로 찾힌다 | `postWorkflowCommand.description()` | `업무 상태` 를 담는다 |
| 종전 낱말이 남아 있다 | `postWorkflowCommand.description()` | `워크플로우` 를 담는다 |
| 완료 명령도 찾힌다 | `postDoneCommand.description()` | `업무 완료 처리` 를 담는다 |

두 번째 확인이 이 phase 의 실패 경로다. 설명을 더하는 대신 바꿔 버리면 여기서 걸린다.

세 번째 확인의 기대값은 작업 항목 1 의 결과와 무관하게 성립한다. 세 문구 모두 그 말로 시작한다.

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

종료 코드 0 이어야 한다. 새로 만든 `description.test.ts` 가 함께 돈다.

```bash
# cwd: <repo root>
pnpm run build
node dist/index.js post --help
```

출력의 `workflow` 행과 `done` 행에 각각 바꾼 문구가 보여야 한다.

```bash
# cwd: <repo root>
node dist/index.js post --help 2>&1 | grep -c "업무 상태"
```

1 이상이어야 한다. 이것이 이슈가 요청한 결과를 그대로 보는 명령이다.

```bash
# cwd: <repo root>
node scripts/check-public-refs.mjs
node scripts/check-pii.mjs
```

둘 다 종료 코드 0 이어야 한다.

```bash
# cwd: <repo root>
~/personal/fos-skills/korean-check/scripts/check.sh docs/flow.md skills/dooray-cli/SKILL.md
```

종료 코드 0 이어야 한다. 이 phase 에서 고치지 않은 파일은 대상에 넣지 않는다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/post/workflow.ts` | 수정 |
| `src/commands/post/done.ts` | 수정 |
| `src/commands/post/description.test.ts` | 신규 |
| `skills/dooray-cli/SKILL.md` | 수정 |
| `skills/dooray-cli/references/workflow.md` | 조건부 수정 |
| `docs/flow.md` | 조건부 수정 |
