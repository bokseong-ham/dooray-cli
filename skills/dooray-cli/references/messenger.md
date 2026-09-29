# messenger

## 메시지 읽기

`logs` 가 가져올 수 있는 것은 최근 1000건까지다. 그 이전으로 거슬러 갈 수단이 API 에 없어
`-n` 에 1000 을 넘기면 조용히 잘리지 않고 에러로 끝난다. 날짜 필터도 없다.
표에는 발신자 이름이 나오지만 `--json` 은 서버 응답 원형이라 발신자가 id 로만 들어 있다.
정렬도 원형을 따라 최신이 앞이다. 표와 `--quiet` 은 대화 순서대로 뒤집어 내보내므로 둘을 나란히 대조하지 않는다.
**표의 내용 열은 60자에서 자른다.** 메시지를 읽어 요약하거나 옮겨 적을 때는 표가 아니라 `--json` 으로 전문을 받는다.
가져온 것보다 오래된 메시지가 남아 있으면 stderr 로 한 줄 알린다. stdout 에는 섞이지 않으므로 파싱에 영향이 없다.
**이 명령이 부르는 endpoint 는 공식 API 문서에 없다.** 보내는 쪽은 문서에 있고 읽는 쪽만 없다.
동작은 실제 호출로 확인했지만 호환을 약속받은 것이 아니므로 예고 없이 막힐 수 있다.
멈추면 곤란한 자동화라면 실패했을 때의 경로를 함께 둔다.

## 스레드에 보고 쌓기

진행 상황을 여러 번 보고할 때는 대화방 본문에 늘어놓지 말고 스레드에 쌓는다.
`thread-send --quiet` 이 내는 값은 log-id 가 아니라 새로 만들어진 스레드 채널의 id 이고,
그 값을 `channel-send --channel` 에 주면 메시지가 스레드에 붙는다.

```bash
THREAD=$(dooray messenger thread-send --channel "배포알림" --body "v1.2.3 배포" --quiet)
dooray messenger channel-send --channel "$THREAD" --body "빌드 통과"
dooray messenger channel-send --channel "$THREAD" --body "배포 완료"
```
