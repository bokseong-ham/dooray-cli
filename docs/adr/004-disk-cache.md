## ADR-004: 디스크 캐시 (project·member·workflow)

**결정**: `~/.dooray/cache.json`에 TTL 기반 캐시 저장

**대체된 부분**: 단일 `cache.json` 경로는 [ADR-010](010-cache-file-split.md)이 `~/.dooray/cache/` 디렉터리 분리로 대체했다.

**이유**:

- CLI는 매 실행이 새 프로세스 → in-memory 캐시 불가
- project code·member 이름 → ID 변환 시 매번 API 호출 시 지연 발생
- TTL 은 엔티티의 변경 빈도를 기준으로 정한다 (값과 근거는 `docs/data-schema.md` 의 TTL 설계 근거 표)

**트레이드오프**: 캐시 stale 가능성 → `dooray cache refresh`로 수동 갱신 제공
