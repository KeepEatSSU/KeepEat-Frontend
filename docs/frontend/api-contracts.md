# API 계약

이 문서는 현재 프론트 코드에 구현된 API 사용 계약만 정리한다. 백엔드의 최신 공식 명세가 아니며, 확인되지 않은 필드는 `TODO / 확인 필요`에 둔다.

## 공용 클라이언트

`services/api.ts`:

- base URL: `constants/config.ts`의 `API_BASE_URL`
- `API_BASE_URL`은 빌드/실행 시 주입된 `EXPO_PUBLIC_API_URL`에서 생성하며, 누락되거나 HTTP(S) URL이 아니면 앱 시작 시 명시적 설정 오류를 낸다.
- timeout: `API_TIMEOUT_MS`, 현재 15초
- 기본 header: `Content-Type: application/json`
- access token 자동 첨부
- 401 refresh/retry
- refresh 실패 시 token clear와 logout event 발행
- multipart `FormData` 요청은 `Content-Type`을 삭제해 boundary 생성을 RN/axios에 맡긴다.

예외:

- OCR 업로드는 `services/ocr.ts`에서 `fetch`를 직접 사용한다.

## 인증 API

`services/api.ts`에서 확인:

| 함수 | Method/Path | 요청 | 응답/동작 |
| --- | --- | --- | --- |
| `login` | `POST /api/users/login` | `{ email, password }` | `{ accessToken, refreshToken }` 저장 |
| `sendEmailCode` | `POST /api/users/send` | `{ email }` | 성공/실패만 사용 |
| `verifyEmailCode` | `POST /api/users/verify` | `{ email, code }` | 성공/실패만 사용 |
| `findPassword` | `POST /api/users/password/find` | `{ email }` | plain string |
| `signUp` | `POST /api/users/signup` | `{ nickname, email, password }` | 성공/실패만 사용 |
| `getMyInfo` | `GET /api/users/me` | 없음 | `UserInfo` |
| `changePassword` | `PATCH /api/users/me/password` | `{ currentPassword, newPassword }` | plain string |
| `updateNotificationSetting` | `PATCH /api/users/me/notification-setting` | body 없음 | plain string |
| `deleteAccount` | `DELETE /api/users/me` | LOCAL `{ password }`, Google body 없음 | token clear, logout event |
| `logout` | `POST /api/users/logout` | 없음 | 실패해도 local cleanup |

## 식재료 API

`services/userIngredients.ts`에서 확인:

| 함수 | Method/Path | 메모 |
| --- | --- | --- |
| `fetchAllIngredients` | `GET /api/v1/user-ingredients` | 204면 빈 배열 |
| `searchIngredients` | `GET /api/v1/user-ingredients/search?q=...` | 204면 빈 배열 |
| `createIngredients` | `POST /api/v1/user-ingredients` | body `{ items }` |
| `updateIngredient` | `PATCH /api/v1/user-ingredients/{id}` | 부분 업데이트 |
| `deleteIngredient` | `DELETE /api/v1/user-ingredients/{id}` | 204 success |
| `deleteUserIngredients` | `DELETE /api/v1/user-ingredients` | body `{ ids }` |
| `getOwnedIngredientsByRecipe` | `GET /api/v1/user-ingredients/by-recipe/{recipeId}` | 204면 빈 배열 |

## 식재료 마스터 API

`services/ingredientMaster.ts`:

- `GET /api/v1/ingredients/master`
- `If-None-Match` header 사용
- 200: body를 local snapshot 형태로 변환해 저장
- 304: 기존 snapshot 유지

## OCR API

`services/ocr.ts`:

- `POST /api/v1/ocr/parse`
- multipart field name: `image`
- 업로드 파일명: `ocr_image.jpg`
- 타입: `image/jpeg`
- Bearer token 직접 첨부

## 레시피 API

`services/recipes.ts`에서 확인:

| 함수 | Method/Path | 메모 |
| --- | --- | --- |
| `generateAiRecipes` | `POST /api/v1/recipes/generate` | timeout 120초, `{ recipes }` 응답 |
| `saveRecipes` | `POST /api/v1/recipes` | body `{ recipes }` |
| `searchRecipes` | `GET /api/v1/recipes` | `keyword`, `cursor`, `size` |
| `getRecipeDetail` | `GET /api/v1/recipes/detail/{recipeId}` | 공용/내 레시피 상세 통합 |
| `toggleReaction` | `POST /api/v1/recipes/{recipeId}/reaction` | body `{ reactionType }` |
| `completeCooking` | `POST /api/v1/recipes/{recipeId}/cook` | plain string |
| `addToMyRecipes` | `POST /api/v1/my-recipes` | body `{ recipeIds }` |
| `getMyRecipes` | `GET /api/v1/my-recipes` | 배열 또는 `{ myRecipes }` 방어 |
| `deleteMyRecipes` | `DELETE /api/v1/my-recipes?recipeIds=1,2` | comma-separated query |

## 알림 API

`services/notifications.ts`에서 확인:

| 함수 | Method/Path | 메모 |
| --- | --- | --- |
| `fetchNotificationsPage` | `GET /api/notifications` | `cursor`, `size`, 기본 size 20 |
| `markNotificationRead` | `PATCH /api/notifications/{id}/read` | 단건 읽음 |
| `markAllNotificationsRead` | `PATCH /api/notifications/read-all` | 전체 읽음 |
| `markTypeNotificationsRead` | `PATCH /api/notifications/read-all/{TYPE}` | 타입별 읽음 |
| `deleteNotification` | `DELETE /api/notifications/{id}` | 단건 삭제 |
| `deleteNotifications` | `DELETE /api/notifications` | body `{ ids }` |
| `registerPushToken` | `POST /api/notifications/token` | body `{ token }` |
| `deletePushToken` | `DELETE /api/notifications/token` | body `{ token }` |
| `fetchUnreadCount` | `GET /api/notifications/unread-count` | `{ unreadCount }` |

## TODO / 확인 필요

- 최신 Swagger/OpenAPI와 이 문서의 차이.
- 공용 API error envelope의 정확한 형식. 현재 `message`만 사용자에게 노출한다.
- pagination cursor 타입의 최종 정책. 알림은 number, 레시피는 string으로 사용 중이다.
- `updateNotificationSetting`이 현재 UI에서 직접 사용되지 않는 이유와 향후 정책.
- OCR multipart field와 이미지 크기 제한.
- 모든 DTO의 nullable/optional 필드 최신화.
