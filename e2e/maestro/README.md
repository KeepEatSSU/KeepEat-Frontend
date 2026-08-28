# Maestro E2E Suite (층 2)

Android **demo 번들 (`com.anonymous.keepeat_front.demo`)** 전용 UI 회귀 suite.
셀렉터는 testID 우선이며, 서버 상태를 바꾸지 않는 비파괴 flow 가 기본이다.

## 디렉터리

```
e2e/maestro/
  flows/               비파괴 기본 suite — 01→06 순서로 실행
  flows-catalog/       화면 카탈로그 캡처 flow (검증 없음) — --catalog 로 실행
  flows-catalog-full/  ⚠️ rate limit 소모 캡처 flow — --catalog-full 전용
  flows-destructive/   ⚠️ 상태 파괴 flow — 수동 실행 전용, 기본 suite 제외
  common/              공용 서브플로우 (suite 실행 대상 아님)
  run.sh               실행 헬퍼 (.env.maestro 에서 자격증명 로드)
  .env.maestro         자격증명 (직접 생성, gitignore 됨 — 커밋 금지)
e2e/screenshots/
  build-gallery.mjs    current/ 의 PNG 로 gallery.html 생성 (외부 의존성 없음)
  current/             flow 가 저장하는 스크린샷 (gitignore, 산출물)
  gallery.html         생성된 갤러리 (gitignore, 산출물)
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

5. **알림 권한 사전 부여** (APK 를 새로 설치했을 때 1회):

   ```bash
   adb shell pm grant com.anonymous.keepeat_front.demo android.permission.POST_NOTIFICATIONS
   ```

   신규 설치 직후에는 알림 권한이 `undetermined` 라서 로그인하면 인앱
   사전 안내 모달(`PushPermissionPrompt`)이 화면을 덮어 flow 가 실패한다.
   권한을 미리 부여하면 모달 발화 조건이 무너져 뜨지 않는다. (clearState
   는 앱 데이터만 지우고 런타임 권한은 유지하므로 재설치 전까지 1회면 된다.)

## 실행

```bash
bash e2e/maestro/run.sh
```

단일 flow:

```bash
bash e2e/maestro/run.sh flows/01-login.yaml
```

화면 카탈로그 (기본 6개 + 카탈로그 flow 실행 → 스크린샷 → 갤러리 빌드):

```bash
bash e2e/maestro/run.sh --catalog
```

완료되면 `e2e/screenshots/gallery.html` 절대경로가 출력된다. 스크린샷은
`e2e/screenshots/current/` 에 화면 이름 기준(`login.png`, `home.png`, …)으로
저장되며, 갤러리는 화면 유형별 섹션으로 묶어 나란히 보여준다 (UI 통일성
감사용). 갤러리만 다시 빌드하려면 `node e2e/screenshots/build-gallery.mjs`.

```bash
bash e2e/maestro/run.sh --catalog-full
```

`--catalog-full` 은 위에 더해 `flows-catalog-full/find-password-step2.yaml` 을
실행한다. **⚠️ 이 flow 는 TEST_EMAIL 로 실제 인증 메일을 1통 발송하고,
이메일당 발송 rate limit(3회/15분) 을 1회 소모한다.** 인증번호는 입력하지
않으므로 계정 상태는 바뀌지 않는다.

주의: flow 의 `takeScreenshot` 은 `${SCREENSHOT_DIR}` 환경변수를 쓰므로
`maestro test` 를 직접 실행할 때는 `-e SCREENSHOT_DIR=<절대경로>` 를 넘겨야
한다 — `run.sh` 를 쓰면 자동으로 설정된다.

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
- 기본 suite 의 각 flow 에는 `takeScreenshot` 스텝이 추가되어 있다
  (login/home/notifications-open/mypage/find-password-step1/
  find-password-email-error). 검증 로직에는 영향이 없는 순수 추가다.

## flows-catalog/ — 화면 카탈로그 (검증 없음, 캡처 목적)

`--catalog` 로 기본 suite 뒤에 실행된다. assert 없이 화면 도달 대기
(`extendedWaitUntil`)와 `takeScreenshot` 만 수행하며, 제출·삭제·토글 등
서버 상태를 바꾸는 액션은 하지 않는다.

| flow | 캡처 화면 |
| --- | --- |
| `01-mypage-change-password` | change-password, change-password-validation (조건 미달 새 비밀번호 + 확인 불일치, 제출 안 함) |
| `02-ingredient-screens` | ingredient-detail (첫 재료 카드, 조회만), add-menu (FAB 시트), ingredient-picker (수동 입력이 자동으로 여는 선택 시트), add-manual (피커 닫은 뒤 등록 화면, 입력 없음) |
| `03-recipe-screens` | recipe-list (레시피 탭), my-recipes (내 레시피), recipe-detail (첫 카드, 조회만) |
| `04-auth-signup-states` | login-error (형식 오류 이메일 제출 → 서버 400 인라인 에러 — 로그인 시도 1회 소모), signup-step1, signup-email-error, signup-step2 (deep link `keepeat-demo://signup-profile` 진입 — 서버 호출 없음), signup-validation |

- `04` 는 clearState 로 시작해 로그아웃 상태가 필요한 화면을 캡처하므로
  카탈로그 flow 중 마지막이다. 실행 후 앱은 로그아웃 상태로 남는다.
- signup 2단계는 정상 경로가 실제 이메일 인증(메일 발송)을 요구하므로,
  deep link 로 화면만 연다. 클라이언트 라우팅일 뿐이며 `가입하기` 는
  누르지 않는다.

### 캡처 불가 목록 (감사 시 수동 확인 대상)

| 화면/상태 | 이유 |
| --- | --- |
| `notifications-empty` / `ingredients-empty` | 알림함/냉장고 비우기가 파괴적(읽음 처리·삭제)이라 시도하지 않음 |
| recipe-swipe 덱 | AI 추천 완료 상태 필요 (1일 1회 제한) |
| cooking-ready / cooking-step / cooking-complete | 조리 세션 시작이 필요한 데이터 의존 화면 |
| OCR crop / 인식 결과 | 영수증 사진 파일/카메라 의존 |
| push 인앱 배너 표시 순간 | 실제 푸시 수신 타이밍 비결정적 |
| 각종 로딩 상태 | 타이밍상 캡처가 불안정해 시도하지 않음 |
| find-password 3단계 (새 비밀번호 설정) | 메일로 받은 실제 인증코드 필요 |
| 회원가입 완료 / 각종 제출 성공 상태 | 제출이 계정·데이터 상태를 바꿈 (파괴적) |

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
| `home.ingredient-card` | `app/(tabs)/index.tsx` (IngredientGridCard) |
| `tabbar.add-button` | `app/(tabs)/_layout.tsx` (FAB) |
| `add-menu.gallery-button` / `add-menu.camera-button` / `add-menu.manual-button` | `components/AddMenuSheet.tsx` |
| `recipe-list.card` | `components/RecipeListCard.tsx` |
| `signup.email.input` | `app/signup.tsx` |
| `signup-profile.nickname.input` / `signup-profile.password.input` / `signup-profile.password-confirm.input` | `app/signup-profile.tsx` |
| `change-password.current.input` / `change-password.new.input` / `change-password.confirm.input` | `app/change-password.tsx` |
