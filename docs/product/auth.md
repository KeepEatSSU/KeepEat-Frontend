# 인증과 계정

## 확인된 현재 구조

인증/계정 기능은 다음 파일들이 중심이다.

- 로그인: `app/login.tsx`
- 회원가입 이메일 인증: `app/signup.tsx`
- 회원가입 프로필/비밀번호: `app/signup-profile.tsx`
- 비밀번호 변경: `app/change-password.tsx`
- 마이페이지/로그아웃/탈퇴: `app/(tabs)/mypage.tsx`
- 인증 전역 상태: `context/AuthContext.tsx`
- API 클라이언트와 인증 helper: `services/api.ts`
- Google OAuth: `services/googleAuth.ts`
- 토큰 저장: `services/tokenStorage.ts`

## 인증 상태

`AuthContext`에서 확인된 상태와 액션:

- `user`
- `isAuthenticated`
- `isLoading`
- `login(email, password)`
- `signUp(email, password, nickname)`
- `loginWithTokens(accessToken, refreshToken)`
- `setUserNotificationEnabled(enabled)`
- `logout()`
- `logoutAll()`
- `endLocalSession()` — 네트워크 없이 토큰·푸시 등록 상태·`user`만 비운다. 서버 세션이 이미 사라진 경우(비밀번호 변경 204)에 쓴다.
- `deleteAccount(password?)`

앱 부팅 시 `tokenStorage.getAccessToken()`이 있으면 `getMyInfo()`로 토큰을 검증한다. 실패하면 토큰을 삭제하고 비인증 상태로 둔다.

`app/_layout.tsx`의 `AuthGate`:

- 인증되지 않았고 auth 화면이 아니면 `/login`으로 이동한다.
- 인증된 상태에서 auth 화면이면 `/(tabs)`로 이동한다.
- 인증 부팅 중에는 native splash를 유지한다.

## 토큰과 refresh

`services/api.ts`에서 확인된 동작:

- 요청 인터셉터가 access token을 Bearer header에 붙인다.
- 401 응답이면 `/api/users/refresh`로 refresh token을 보내 access token을 갱신하고 원 요청을 한 번 재시도한다.
- 동시 401은 하나의 refresh promise를 공유한다.
- refresh 실패 시 토큰을 삭제하고 `authEvents.emitLogout()`을 호출한다.
- `AuthContext`는 logout event를 구독해 `user`를 null로 만든다.

토큰 저장:

- `services/tokenStorage.ts`가 `expo-secure-store`를 사용한다.

## 로그인

`app/login.tsx`:

- 이메일/비밀번호 로그인은 `AuthContext.login()`을 호출한다.
- 성공 시 `router.replace("/(tabs)")`.
- 비밀번호 찾기는 `findPassword(email)`을 호출하고 서버의 plain string 메시지를 toast로 보여준다.
- 구글 로그인은 `startGoogleLogin()` 후 `loginWithTokens()`로 이어진다.

## 회원가입

`app/signup.tsx`:

- 이메일 형식 검증 후 `sendEmailCode(email)` 호출.
- 6자리 인증번호 입력 완료 시 `verifyEmailCode(email, code)` 호출.
- 성공하면 `/signup-profile?email=...`로 이동한다.

`app/signup-profile.tsx`:

- nickname, password, password confirm을 입력한다.
- 비밀번호 길이/복잡도/일치 여부를 클라이언트에서 검사한다.
- `signUp(email, password, nickname)` 호출 후 성공 시 `/(tabs)`로 이동한다.

## Google OAuth

`services/googleAuth.ts`:

- 백엔드 OAuth URL: `${API_BASE_URL}/oauth2/authorization/google`
- redirect URL은 현재 app variant의 Expo scheme으로 생성한다.
  - demo: `keepeat-demo://oauth2/redirect`
  - production: `keepeat://oauth2/redirect`
- `WebBrowser.openAuthSessionAsync()` 결과 URL에서 `accessToken`, `refreshToken` query param을 파싱한다.

보안상 토큰 또는 redirect 전체 URL은 로그로 남기지 말라는 주석이 있다.

## 계정 관리

`app/(tabs)/mypage.tsx`:

- 사용자 표시명은 nickname, 이메일 local-part 순으로 fallback한다.
- provider가 `google`이면 Google 계정으로 표시한다.
- 알림 행은 서버 설정이 아니라 OS 권한 상태를 반영한다.
- 로그아웃은 `AuthContext.logout()`을 호출한다.
- 탈퇴는 provider에 따라 Google 확인 모달 또는 LOCAL 비밀번호 모달을 사용한다.
- 탈퇴 성공 후 최근 검색 캐시를 삭제한다.

`app/change-password.tsx`:

- 현재 비밀번호, 새 비밀번호, 확인 입력을 검사한다. 새 비밀번호 규칙은 서버
  `PasswordChangeRequest`의 `@Pattern`을 그대로 옮긴 것이다:
  `^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,15}$`
  (허용 특수문자는 `@$!%*#?&` 뿐, 그 밖의 문자는 서버가 400으로 거절한다).
  현재 비밀번호는 서버 `@Size(max = 72)`에 맞춰 72자로 제한한다.
  새 비밀번호가 현재 비밀번호와 같으면 전송 전에 막는다(서버도 400을 던진다).
- `changePassword(currentPassword, newPassword)`를 호출한다.
- **성공은 204 No Content이며, 서버는 응답 전 같은 트랜잭션에서 해당 유저의
  모든 UserSession, Expo Push Token, Password Reset Token을 삭제한다.** 즉
  204가 온 시점에 이 기기의 세션도 이미 서버에 없다. 화면은 안내 토스트를
  띄운 뒤 `endLocalSession()`으로 로컬 세션을 정리하고, `AuthGate`가 `/login`
  으로 replace 한다 (`router.back()` 하지 않는다).
- 실패는 status/`code`로 갈라 보여준다.
  - 401 `INVALID_CREDENTIALS`: 현재 비밀번호 필드 inline error + 포커스 복귀.
    인터셉터가 이 code를 refresh 대상에서 제외하므로 원본 401이 그대로 온다.
  - 401 `code` 없음(`{ error, message }`): 세션 만료. 인터셉터가 이미 로그아웃을
    진행하므로 폼 대신 toast로 이유만 알린다.
  - 404 `USER_NOT_FOUND`: 재로그인 안내를 form error로 노출.
  - 400/500/네트워크: 서버 `message` 우선, 없으면 폴백 문구.

## TODO / 확인 필요

- 회원가입(`app/signup-profile.tsx`)의 비밀번호 regex는 아직 서버
  `SignUpRequest` 규칙과 대조하지 않았다. 확인 필요.
  (비밀번호 변경 화면은 서버 `PasswordChangeRequest`와 정렬 완료.)
- 이메일 인증번호 만료 시간과 재전송 제한 정책.
- `UserInfo.provider` casing 정책. 현재 코드는 `LOCAL`/`google` 혼재를 방어한다.
- 서버의 알림 설정 API와 현재 마이페이지 OS 권한 중심 UX의 최종 정책.
