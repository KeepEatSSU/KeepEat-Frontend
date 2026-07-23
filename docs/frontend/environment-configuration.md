# 앱 환경과 실행 설정

KeepEat 프론트엔드는 개발자가 아래 네 가지 명령만 선택하도록 구성한다.

| 명령 | API 값 위치 | 결과 |
| --- | --- | --- |
| `npm run start:local` | `.env`의 `EXPO_PUBLIC_API_URL_LOCAL` | Metro + Demo 앱, 로컬 API |
| `npm run start:demo` | `.env`의 `EXPO_PUBLIC_API_URL_DEMO` | Metro + Demo 앱, 공용 demo API |
| `eas build --profile demo` | EAS `preview` Environment의 `EXPO_PUBLIC_API_URL` | 설치 가능한 Demo 앱 |
| `eas build --profile production` | EAS `production` Environment의 `EXPO_PUBLIC_API_URL` | 실제 Production 앱 |

## 로컬 Metro 설정

루트 `.env`는 Git에서 제외한다. `.env.example`을 참고해 두 값을 설정한다.

```dotenv
EXPO_PUBLIC_API_URL_LOCAL=http://localhost:8080
EXPO_PUBLIC_API_URL_DEMO=<demo-api-url>
```

`scripts/start-variant.mjs`가 명령에 맞는 값을 선택해 앱 코드가 읽는
`EXPO_PUBLIC_API_URL`로 주입한다. `constants/config.ts`는 최종 주입값만 읽으며,
값이 없거나 HTTP(S) URL이 아니면 명확한 설정 오류를 낸다.

- iOS Simulator 로컬 API: 일반적으로 `http://localhost:8080`
- Android Emulator 로컬 API: 일반적으로 `http://10.0.2.2:8080`
- 두 emulator에서 같은 `localhost`를 쓰려면 Android에
  `adb reverse tcp:8080 tcp:8080`을 먼저 적용한다.

## 앱 환경과 네이티브 식별자

`APP_ENV`는 실행 스크립트와 EAS profile이 내부적으로 설정한다. 개발자가 직접
바꿀 필요는 없다.

| `APP_ENV` | 앱 이름 | Scheme | iOS bundle identifier | Android package |
| --- | --- | --- | --- | --- |
| `local`, `demo` | `KeepEat Demo` | `keepeat-demo` | `com.anonymous.keepeatfront.demo` | `com.anonymous.keepeat_front.demo` |
| `prod` | `KeepEat` | `keepeat` | `com.anonymous.keepeatfront` | `com.anonymous.keepeat_front` |

production 이름과 식별자, scheme은 변경하지 않는다. Demo와 Production은 서로
다른 앱 샌드박스를 사용하므로 한 기기에 동시에 설치할 수 있고 SecureStore 토큰도
분리된다.

## OAuth callback

`services/googleAuth.ts`는 현재 Expo scheme으로 callback을 생성한다.

- Demo: `keepeat-demo://oauth2/redirect`
- Production: `keepeat://oauth2/redirect`

백엔드에도 두 redirect URI를 모두 허용해야 한다. 이 흐름은 Expo Go가 아니라
development build 또는 standalone 앱을 전제로 한다.

## EAS Build와 Update

EAS 클라우드 빌드는 Git에서 제외된 `.env`를 읽지 않는다. 원격 EAS Environment에
다음 값을 등록한다.

| EAS Environment | 필수 값 | 사용 profile/channel |
| --- | --- | --- |
| `preview` | `APP_ENV=demo`, `EXPO_PUBLIC_API_URL=<demo-api-url>` | profile `demo`, channel `demo` |
| `production` | `APP_ENV=prod`, `EXPO_PUBLIC_API_URL=<production-api-url>` | profile `production`, channel `production` |

여기서 `preview`는 Expo가 제공하는 원격 환경변수 저장소 이름이다. 앱의 Build
profile과 Update channel 이름은 `demo`다. Android Demo 빌드에서 푸시를 사용하려면
`.demo` package용 Firebase 파일을 `GOOGLE_SERVICES_JSON` EAS 파일 변수로 별도
등록한다.

EAS Update runtime은 Demo `1.0.0-demo`, Production `1.0.0`처럼 variant별로
분리해 서로 다른 앱에 update가 적용되지 않게 한다.

## 설정 책임 파일

| 파일 | 책임 |
| --- | --- |
| `app.config.ts` | `APP_ENV`를 네이티브 식별자, scheme, runtimeVersion으로 변환 |
| `scripts/start-variant.mjs` | Metro 명령별 API URL 선택과 환경 주입 |
| `constants/config.ts` | 최종 `EXPO_PUBLIC_API_URL` 검증과 `API_BASE_URL` 제공 |
| `eas.json` | development/demo/production build profile과 Update channel 설정 |
| `.env.example` | 로컬 `.env` 작성 예시 |

설정 변경 후에는 local/demo/prod 각각의 `npx expo config` 결과와
`npm run verify`를 확인한다. 실제 EAS Build와 배포는 별도 승인 없이 실행하지 않는다.
