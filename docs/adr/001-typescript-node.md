## ADR-001: TypeScript (Node.js) 선택

**결정**: Kotlin(기존 MCP 서버) 대신 TypeScript로 새로 작성

**이유**:

- 팀의 주력 스택이 TypeScript → 개발 속도 우선
- npm 생태계로 `npx @bifos/dooray-cli` 즉시 배포 가능
- CLI 툴 생태계(Commander, chalk, ora 등)가 Node.js에서 가장 성숙

**대안 기각**: Kotlin MCP 서버 코드 재사용을 포기한다.
`types.ts` 포팅 비용이 1일 내라, 기존 자산을 유지하는 이득보다 팀 주력 스택에 맞추는 이득이 크다.
