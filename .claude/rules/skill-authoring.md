---
paths:
  - ".claude/skills/**"
---

# 저장소 스킬 작성 규약

`.claude/skills/` 의 스킬은 기존 스킬(`release`, `health-check`)의 문서 구조를 따른다.
통과 조건은 관측할 수 있는 사실로 쓰고, 순서가 없는 스킬은 개요 표를 두지 않는다.

- **반복되는 절차와 판정은 그 스킬의 `scripts/*.mjs` 로 옮긴다.**
  선례는 `.claude/skills/release/scripts/preflight.mjs` 다.
  저장소 전체가 쓰는 검사는 root 의 `scripts/` 에 두고, `scripts/check-pii.mjs` 와 `scripts/verify-package.mjs` 가 그쪽 선례다
- **스크립트로 막을 수 있는 실행 함정은 스크립트가 처리한다.**
  옵션 문자열을 `grep` 에 넘기면 자기 옵션으로 해석되므로 스크립트가 파일을 직접 읽어 찾는다.
  스크립트로 막을 수 없는 함정은 그 단계 절에 실패 조건과 관측 결과를 함께 적는다
- 스킬 스크립트는 저장소 root 를 스스로 찾아 이동하고, 각 명령의 종료 코드를 그 자리에서 읽는다.
  출력을 `tail` 이나 `head` 로 잇지 않는다. 파이프 뒤의 `$?` 는 마지막 명령의 것이라 실패가 0 으로 보인다
- 명령 블록에서 사용자가 채울 값은 셸 변수로 두고 블록 앞에 무엇을 넣는지 적는다.
  따옴표 없는 `<이름>` 은 셸이 입력 리다이렉션으로 해석한다
- pnpm 과 npm 은 Windows 에서 `.cmd` 라서 `shell` 없이 spawn 하면 ENOENT 로 실패한다.
  이 둘만 `shell: true` 로 실행하고 인자를 큰따옴표로 감싸며, 인자 안의 큰따옴표도 escape 한다.
  git 과 `process.execPath` 는 shell 없이 실행한다
- `references/` 에는 특정 상황에서만 필요한 것, 한 단계 안에서만 쓰는 상세 절차, 길고 자주 바뀌는 목록을 둔다.
  본문에는 그 파일을 읽을 조건과 경로만 남기고 내용을 요약하지 않는다
