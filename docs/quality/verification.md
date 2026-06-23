# 검증 절차

## 현재 확인된 명령

`package.json` 기준:

```bash
npm install
npm start
npm run ios
npm run android
npm run web
npm run lint
```

현재 테스트 전용 스크립트는 확인되지 않았다.

## 개발 실행 주의

README 기준:

- Expo Go가 아니라 dev-client 빌드가 필요하다.
- 네이티브 모듈로 `expo-notifications`, `expo-haptics`, gesture handler 등을 사용한다.
- iOS/Android 개발 빌드는 각각 `npm run ios`, `npm run android`를 사용한다.

## 기본 검증

문서만 수정한 경우:

- 문서 파일 경로와 링크가 맞는지 확인한다.
- `git diff -- AGENTS.md ARCHITECTURE.md docs`로 문서 diff를 확인한다.

코드 변경이 있는 경우:

1. `npm run lint`
2. 변경 화면 수동 실행
3. 관련 API 성공/실패 케이스 확인
4. 인증 만료 또는 401 영향을 받는 변경이면 refresh/logout 흐름 확인

## 주요 수동 시나리오

식재료:

- 냉장고 목록 로딩/검색/필터.
- 식재료 상세 수정/삭제.
- 수동 식재료 등록.
- 갤러리/카메라 OCR 등록.

레시피:

- 공용 레시피 목록/검색/상세.
- 내 레시피 목록/필터/삭제.
- 좋아요/싫어요 optimistic update와 실패 rollback.
- AI 추천 요청, 완료 알림, 스와이프 저장.
- 조리 준비, 조리 단계, 조리 완료와 식재료 삭제.

인증:

- 이메일 로그인.
- 이메일 인증 회원가입.
- Google OAuth 로그인.
- 비밀번호 찾기/변경.
- 로그아웃/회원 탈퇴.

알림:

- 알림 목록 refresh/load more.
- 단건/전체/타입별 읽음.
- 단건/일괄 삭제.
- foreground push 인앱 표시.
- push 탭 라우팅.

## TODO / 확인 필요

- 단위 테스트 또는 E2E 테스트 도구 도입 여부.
- CI에서 실행하는 명령 목록.
- QA 기기/OS 버전 기준.
- API mock 또는 staging 환경 사용법.
- 테스트 계정과 seed data 준비 방식.
