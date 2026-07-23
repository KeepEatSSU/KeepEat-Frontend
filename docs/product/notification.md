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

목록 API의 알 수 없는 backend enum은 UI 렌더링 안전성을 위해 `notice`로
fallback한다. Push payload의 알 수 없는 `type`은 route 없이 무시한다.

## Push payload

신규 Expo Push payload의 최소 계약은 다음 두 값이다.

```ts
type NotificationPushData = {
  notificationId?: number;
  type?: NotificationType;
};
```

- 신규 backend payload는 `notificationId`와 `type`을 함께 보낸다.
- 프론트 타입의 optional 표시는 `notificationId`가 없던 구형 Push와 잘못된
  payload를 안전하게 처리하기 위한 호환성이다.
- Expo payload에서 ID가 숫자 문자열로 들어오면
  `parseNotificationPushData()`가 한 번만 `number`로 정규화한다. 양의 safe
  integer가 아니면 ID를 무시한다.
- `targetId`는 현재 Push 계약과 라우팅에 사용하지 않는다.

## 알림 API

`services/notifications.ts`에서 확인된 엔드포인트:

- `GET /api/notifications?cursor=&size=20`
- `PATCH /api/notifications/{id}/read`
- `PATCH /api/notifications/read-all`
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
- `markAllRead()`
- `handleNotificationPress({ notificationId, type })`
- `removeNotification(id)`
- `removeNotifications(ids)`
- `maybeRefreshUnreadCount()`

동작:

- 인증되면 최초 알림 목록과 unread count를 가져온다.
- 로그아웃 시 로컬 알림 상태를 비운다.
- 앱이 background에서 active로 돌아오면 unread count만 가볍게 갱신한다.
- 탭 focus 시에도 unread count 갱신을 시도하며 5초 throttle이 있다.
- foreground push는 OS 배너 대신 인앱 드롭다운으로 보여준다.
- 알림함 카드, foreground 드롭다운, OS Push response는
  `handleNotificationPress()`를 공유한다.

## 읽음 정책

| 사건 | 읽음 처리 |
| --- | --- |
| Push 도착 또는 foreground 드롭다운 표시 | 없음 |
| 알림함 열기, 닫기, 체류 | 없음 |
| 알림함 개별 카드 탭 | 해당 `notificationId` 한 건 |
| foreground 드롭다운 탭 | 해당 `notificationId` 한 건 |
| background/cold-start OS Push 탭 | 해당 `notificationId` 한 건 |
| 냉장고 홈 또는 `/recipe-swipe` 직접 진입 | 없음 |
| 사용자의 `모두 읽음` 탭 | 전체 |

- 읽지 않은 로드된 항목은 즉시 `isRead: true`로 바꾸고 unread count를 1
  줄인 뒤 단건 API를 호출한다.
- 이미 읽은 항목을 다시 눌러도 API를 재호출하거나 unread count를 중복
  감소시키지 않는다.
- 단건 API가 실패하면 해당 항목과 감소시킨 count만 rollback한다. 다른 알림은
  변경하지 않는다.
- `모두 읽음`도 optimistic update 후 실패 시 목록과 count를 rollback한다.
- `notificationId`가 없는 구형 Push는 읽음 API와 타입 전체 읽음을 수행하지
  않고 `type`에 따른 route만 처리한다.

## 라우팅 규칙

`utils/notificationRouting.ts` 기준:

| 타입 | route | 읽음 처리 |
| --- | --- | --- |
| `expiry_soon` | `/` | 유효한 `notificationId` 한 건 |
| `recipe_ready` | `/recipe-swipe` | 유효한 `notificationId` 한 건 |
| `notice` | 없음 | 유효한 `notificationId` 한 건 |

읽음 API 실패는 라우팅을 막지 않는다. `notice` 알림함 카드는 해당 한 건을
읽고 기존처럼 본문을 펼치거나 접는다. 특정 식재료·레시피·공지 상세로 이동하는
딥링크는 현재 범위에 없다.

## Push token

`services/pushNotifications.ts`:

- web에서는 Expo push token을 발급하지 않는다.
- 이미 OS 알림 권한이 granted일 때만 token을 발급한다.
- Android는 `default` notification channel을 설정한다.
- EAS `projectId`는 `app.json`의 `extra.eas.projectId`에서 읽는다.
- 로그인/부팅 복구 시 token을 서버에 등록한다.
- 로그아웃/탈퇴 전 token을 서버에서 삭제한다.

## TODO / 확인 필요

- 목록 DTO의 optional `AppNotification.targetId`는 남아 있지만 현재 Push
  계약과 라우팅에서는 사용하지 않는다.
- `recipe_ready`의 "마지막 추천 결과 조회 GET" 도입 여부.
- 서버가 push를 보내는 정확한 조건과 중복 방지 정책.
- 알림 삭제/읽음 실패 시 UX 정책.
- OS 권한과 서버 알림 설정 flag의 최종 관계.
