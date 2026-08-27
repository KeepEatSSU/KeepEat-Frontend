# Maestro E2E Suite (층 2)

Android **demo 번들 (`com.anonymous.keepeat_front.demo`)** 전용 UI 회귀 suite.
셀렉터는 testID 우선이며, 서버 상태를 바꾸지 않는 비파괴 flow 가 기본이다.

## 디렉터리

```
e2e/maestro/
  flows/               비파괴 기본 suite — 01→06 순서로 실행
  flows-destructive/   ⚠️ 상태 파괴 flow — 수동 실행 전용, 기본 suite 제외
  common/              공용 서브플로우 (suite 실행 대상 아님)
  run.sh               실행 헬퍼 (.env.maestro 에서 자격증명 로드)
  .env.maestro         자격증명 (직접 생성, gitignore 됨 — 커밋 금지)
```

## 사전 준비

1. **demo APK 빌드 및 설치** (release 빌드 = Metro 불필요, JS 번들 내장):

   ```bash
   APP_ENV=demo EXPO_PUBLIC_API_URL=$(grep '^EXPO_PUBLIC_API_URL_DEMO' .env | cut -d= -f2-) npx expo prebuild --platform android --clean --no-install
   ```

   ```bash
   echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
   ```

   ```bash
   cd android && APP_ENV=demo EXPO_PUBLIC_API_URL=$(grep '^EXPO_PUBLIC_API_URL_DEMO' ../.env | cut -d= -f2-) ./gradlew assembleRelease
   ```

   ```bash
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```

   `EXPO_PUBLIC_API_URL` 은 번들 시점에 인라인되므로, **JS 코드가 바뀌면 재빌드**해야
   flow 가 새 코드를 본다. `--clean` prebuild 는 `android/local.properties` 를 지우니
   위처럼 복구할 것.

2. **자격증명 파일 생성** — `e2e/maestro/.env.maestro` (gitignore 됨):

   ```
   TEST_EMAIL=테스트계정@example.com
   TEST_PASSWORD=비밀번호
   ```

   flow 파일에 자격증명을 하드코딩하지 않는다. 이메일 가입(LOCAL) 계정이어야 하며,
   **냉장고에 식재료가 1개 이상** 있어야 02 flow 가 통과한다.

3. Android 에뮬레이터 실행 (`adb devices` 로 확인).

4. **에뮬레이터 autofill 비활성화** (1회):

   ```bash
   adb shell settings put secure autofill_service null
   ```

   끄지 않으면 Google Password Manager 의 "비밀번호 저장" 시스템 다이얼로그가
   로그인 직후 화면을 덮어 flow(특히 06)가 실패한다. 되돌리려면
   `adb shell settings put secure autofill_service com.google.android.gms/.autofill.service.AutofillService`.

## 실행

```bash
bash e2e/maestro/run.sh
```

단일 flow:

```bash
bash e2e/maestro/run.sh flows/01-login.yaml
```

## 기본 suite (비파괴)

| flow | 검증 내용 | 비고 |
| --- | --- | --- |
| `01-login` | 앱 데이터 클리어 → 이메일 로그인 → 홈 도달 | clearState 사용 |
| `02-home-ingredients` | 냉장고 재료 목록 표시 | 계정에 식재료 필요 |
| `03-notifications` | 알림함 열기 → 표시 → 닫기 | 읽음 tap 안 함 |
| `04-mypage` | 닉네임/이메일 표시 | |
| `05-notification-toggle` | 푸시 수신 스위치 반대로→원상복구 | 멱등 PATCH, 자동 원복 |
| `06-find-password-entry` | 비밀번호 찾기 진입 → 형식 에러 → 뒤로 → 재로그인 | clearState 사용 |

- 각 flow 는 독립 실행 가능하다. 02~05 는 세션이 없으면
  `common/ensure-logged-in.yaml` 이 로그인부터 수행한다.
- 로그인 rate limit 이 15분당 10회이므로, suite 를 짧은 간격으로 반복 실행하면
  429 로 실패할 수 있다 (01/06 은 매번 로그인, 02~05 는 세션 재사용).
- 06의 "잘못된 이메일" 검증은 **형식 오류(클라이언트 인라인 에러)** 다.
  미가입 이메일은 서버가 계정 열거 방지를 위해 성공 응답을 주므로
  결정적으로 검증할 수 없다.

## ⚠️ flows-destructive/ — 수동 실행 전용

기본 suite 에 절대 포함하지 말 것. 실행하면 계정/기기 세션 상태가 바뀐다.

| flow | 효과 |
| --- | --- |
| `logout.yaml` | 현재 기기 refresh 토큰 무효화 → 재실행 시 로그인 화면 확인. 실행 후 다른 flow 는 로그인부터 다시 시작한다. |

```bash
bash e2e/maestro/run.sh flows-destructive/logout.yaml
```

비밀번호 변경 / 모든 기기 로그아웃 / 회원 탈퇴는 **flow 로 만들지 않았다** —
계정 상태를 바꿔 다른 flow 를 연쇄 실패시키기 때문. 아래 수동 체크리스트로만 검증한다.

## 수동 체크리스트 (자동화 제외 항목)

메일 수신, 1일 1회 제한, 푸시 대기 등 자동화가 부적합한 흐름:

- [ ] **비밀번호 찾기 전체 흐름**: 유효 이메일 제출 → 메일로 받은 6자리 인증코드 입력
      → 새 비밀번호 설정 → 새 비밀번호로 로그인 (메일 의존)
- [ ] **비밀번호 변경**: 마이페이지 → 비밀번호 변경 → 현재/새 비밀번호 입력 → 성공 후
      기존 세션 동작 확인 (계정 상태 변경 — 변경 후 `.env.maestro` 갱신 필요)
- [ ] **모든 기기에서 로그아웃**: 두 기기 로그인 상태에서 실행 → 두 기기 모두 세션
      만료 확인 (전 기기 세션 파괴)
- [ ] **회원 탈퇴**: 전용 일회용 계정으로만. 탈퇴 후 로그인 불가 확인
- [ ] **AI 레시피 생성**: 냉장고 탭에서 생성 요청 → 완료 알림 수신 → 결과 5개 표시
      (1일 1회 제한이라 자동화 제외)
- [ ] **푸시 수신**: 서버가 실제 발송한 푸시가 기기에 도착하고, 탭 시 해당 화면으로
      라우팅되는지 (수신 타이밍 비결정적)
- [ ] **OCR 등록**: 영수증 사진 → 인식 결과 확인 (사진 파일/카메라 의존)

## testID 컨벤션

`화면/영역/역할` 순 (`docs/quality/test-ids.md` 참고). 이 suite 를 위해 추가된 testID:

| testID | 위치 |
| --- | --- |
| `login.email.input` / `login.password.input` / `login.submit-button` / `login.find-password-link` | `app/login.tsx` |
| `find-password.back-button` / `find-password.email.input` / `find-password.submit-button` | `app/find-password.tsx` |
| `home.ingredient-list` / `home.empty-state` | `app/(tabs)/index.tsx` |
| `header.notification-bell` | `components/NotificationBell.tsx` |
| `notification-popup.root` / `notification-popup.close-button` | `components/NotificationPopup.tsx` |
| `mypage.nickname.text` / `mypage.email.text` / `mypage.notification-toggle.switch` / `mypage.logout-button` | `app/(tabs)/mypage.tsx` |
