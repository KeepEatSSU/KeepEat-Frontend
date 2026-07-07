# KeepEat Maestro Regression Drafts

이 폴더는 KeepEat 수동/반자동 Maestro 회귀 검증 초안입니다. 현재 서버가 내려가 있어 실제 실행 검증은 하지 않았으며, 서버 복구 후 `inspect_screen` 기준으로 selector와 화면 상태를 보정해야 합니다.

## Flows

| Flow | 목적 | Mutation 정책 |
| --- | --- | --- |
| `login.yaml` | 로그인 후 인증된 탭 진입을 확인합니다. | 인증 상태 초기화를 위해 `clearState: true`를 사용합니다. |
| `ingredient-add-manual.yaml` | 수동 식재료 추가 폼의 필수 입력 메시지와 CTA 상태를 확인합니다. | 신규 식재료 등록 CTA는 누르지 않습니다. |
| `cooking-flow.yaml` | 레시피 상세에서 조리 준비 화면을 거쳐 조리 단계 이전/다음 이동을 확인하는 smoke test입니다. | 조리 완료는 사용자 기록/식재료 데이터를 변경할 수 있으므로 실행하지 않습니다. |

## Required Environment Variables

- `TEST_EMAIL`
- `TEST_PASSWORD`
- `TEST_RECIPE_TITLE`

## Run Examples

```sh
maestro test -e TEST_EMAIL=<email> -e TEST_PASSWORD=<password> .maestro/login.yaml
maestro test .maestro/ingredient-add-manual.yaml
maestro test -e TEST_RECIPE_TITLE='<recipe title>' .maestro/cooking-flow.yaml
```

## Follow-Up After Server Recovery

- `inspect_screen` 결과를 기준으로 text selector를 안정적인 testID로 교체합니다.
- optional selector는 초안 단계의 관찰용입니다. 회귀 계약으로 확정된 selector는 `optional`을 제거합니다.
- 신규 식재료 등록 및 조리 완료처럼 mutation이 발생하는 단계는 의도적으로 제외되어 있습니다.
- 테스트 데이터 생성/정리 정책이 확정되기 전까지 mutation을 발생시키는 CTA는 flow에 추가하지 않습니다.
