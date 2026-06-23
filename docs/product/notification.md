# 알림과 푸시

## 확인된 현재 구조

알림 기능은 다음 파일들이 중심이다.

- 전역 알림 상태와 푸시 listener: `context/NotificationContext.tsx`
- 알림 API: `services/notifications.ts`
- Expo push token 발급/서버 동기화: `services/pushNotifications.ts`
- 알림 타입별 라우팅 결정: `utils/notificationRouting.ts`
- 알림 팝업 UI: `components/NotificationPopup.tsx`
- 알림 벨: `components/NotificationBell.tsx`
- 헤더 우측 묶음: `components/AppHeaderRight.tsx`
- 푸시 권한 사전 안내: `components/PushPermissionPrompt.tsx`
- foreground OS 배너 억제 handler: `context/RecipeRecommendationContext.tsx`

## 알림 타입

`constants/domain.ts` 기준 domain type:

- `notice`
- `expiry_soon`
- `recipe_ready`

`services/notifications.ts` 기준 backend enum:

- `NOTICE`
- `EXPIRY_SOON`
- `RECIPE_READY`

알 수 없는 backend enum은 UI에서 `notice`로 fallback한다.

## 알림 API

`services/notifications.ts`에서 확인된 엔드포인트:

- `GET /api/notifications?cursor=&size=20`
- `PATCH /api/notifications/{id}/read`
- `PATCH /api/notifications/read-all`
- `PATCH /api/notifications/read-all/{TYPE}`
- `DELETE /api/notifications/{id}`
- `DELETE /api/notifications`
- `POST /api/notifications/token`
- `DELETE /api/notifications/token`
- `GET /api/notifications/unread-count`

목록은 cursor pagination이고 기본 size는 20이다.

## NotificationContext 동작

확인된 상태:

- `items`
- `unreadCount`
- `hasNext`
- `loading`

확인된 액션:

- `refresh()`
- `loadMore()`
- `markRead(id)`
- `markAllRead()`
- `markTypeRead(type)`
- `removeNotification(id)`
- `removeNotifications(ids)`
- `maybeRefreshUnreadCount()`

동작:

- 인증되면 최초 알림 목록과 unread count를 가져온다.
- 로그아웃 시 로컬 알림 상태를 비운다.
- 앱이 background에서 active로 돌아오면 unread count만 가볍게 갱신한다.
- 탭 focus 시에도 unread count 갱신을 시도하며 5초 throttle이 있다.
- foreground push는 OS 배너 대신 인앱 드롭다운으로 보여준다.
- OS 푸시 탭, 인앱 드롭다운 탭, 알림창 카드 탭은 `resolveNotificationAction()` 규칙을 공유한다.

## 라우팅 규칙

`utils/notificationRouting.ts` 기준:

| 타입 | route | 읽음 처리 |
| --- | --- | --- |
| `expiry_soon` | `/` | 타입 읽음 처리 |
| `recipe_ready` | `/recipe-swipe` | 결과를 실제로 보여줄 때 읽음 처리 |
| `notice` | 없음 | 타입 읽음 처리 |

`recipe_ready`는 결과가 준비되지 않았거나 이미 읽은 알림이면 이동하지 않는 가드가 있다. 일부 진입 경로에서는 swipe 화면이 최종 가드를 맡는다.

## Push token

`services/pushNotifications.ts`:

- web에서는 Expo push token을 발급하지 않는다.
- 이미 OS 알림 권한이 granted일 때만 token을 발급한다.
- Android는 `default` notification channel을 설정한다.
- EAS `projectId`는 `app.json`의 `extra.eas.projectId`에서 읽는다.
- 로그인/부팅 복구 시 token을 서버에 등록한다.
- 로그아웃/탈퇴 전 token을 서버에서 삭제한다.

## TODO / 확인 필요

- `AppNotification.targetId` 기반 상세 이동은 현재 주석상 향후 작업으로 보인다.
- `recipe_ready`의 "마지막 추천 결과 조회 GET" 도입 여부.
- 서버가 push를 보내는 정확한 조건과 중복 방지 정책.
- 알림 삭제/읽음 실패 시 UX 정책.
- OS 권한과 서버 알림 설정 flag의 최종 관계.
