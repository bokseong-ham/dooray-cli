---
id: inaccurate-file-scope
category: plan
title: 파일 범위 부정확
triggers: [파일 범위, 전체 수정, scope, docs 일괄]
tool_catchable: false
source: [1-2, PR #69]
related: []
---

**증상**: "commands 전체 수정" 처럼 "전체" 로 적으면 critic 이 대상 파일을 추적하지 못한다.
**왜**: 누락된 파일이 conflict 진앙이 되면 executor 가 헤맨다.

```bash
git diff <base>..<target> --name-only -- <scope-dir>/
```

**Self-check**: 파일 목록을 plan 에 전부 나열했고, 각 파일 처리 원칙이 서술됐는가?
디렉터리 단위 정리 task (docs 일괄 backfill / lint 전 적용 등) 는 `ls <dir>/*.md` 결과를 plan 본문에 직접 인용하여 큰 파일 누락 회피.
(PR #69 의 critic REVISE 사유가 이것이다.
당시 `docs/` 에 있던 878줄짜리 MVP 구축 가이드를 빠뜨렸다.
그 파일은 지금 저장소에 없다. 본문은 글쓴이의 블로그로 옮겼다)
