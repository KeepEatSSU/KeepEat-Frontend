/**
 * KeepEat — temporary mock data.
 *
 * Replace each constant here with real API calls as backend endpoints
 * come online. Once empty, this file (and the `mocks/` directory) can
 * be deleted entirely. Domain types live in `@/constants/domain`.
 *
 * As of this turn the user-ingredient flows (fridge list, search,
 * create, update, delete) are wired to real APIs in
 * `@/services/userIngredients`. Recipe and OCR flows below remain
 * mocked — they'll move to services in a follow-up.
 */

import type { Recipe, RecipeDetail } from "@/constants/domain";

// ─── Crop / OCR Loading (crop.tsx) ────────────────────────────────────────────

export const OCR_LOADING_TIPS: string[] = [
  "대파는 키친타월로 감싸서 보관하면\n한 달동안 신선하게 먹을 수 있습니다",
  "사과는 에틸렌 가스를 내뿜으니\n다른 과일과 따로 비닐에 묶어 보관하세요",
  "진간장은 볶음요리에 강하고\n국간장은 볶으면 향이 날라가요!",
  "감자는 사과와 함께 두면\n싹이 나는 것을 막아줍니다",
  "다진 마늘은 얼음틀에 넣어 냉동실에 얼리면\n요리할 때 하나씩 빼쓰기 편해요",
];

// ─── Recipes (recipe.tsx) — 보고서용 메인 레시피 ──────────────────────────────────

export const MOCK_RECIPES: Recipe[] = [
  {
    id: "1",
    title: "삼겹살 듬뿍 김치볶음밥",
    matchCount: 4,
    totalCount: 5,
    difficulty: "쉬움",
    time: "15분",
    kcal: "650kcal",
  },
  {
    id: "2",
    title: "대파 계란 볶음밥",
    matchCount: 3,
    totalCount: 4,
    difficulty: "쉬움",
    time: "10분",
    kcal: "420kcal",
  },
  {
    id: "3",
    title: "삼겹살 대파 구이",
    matchCount: 2,
    totalCount: 4,
    difficulty: "보통",
    time: "20분",
    kcal: "580kcal",
  },
];

// ─── AI Recommended Recipes Pool (recipe-swipe.tsx) ──────────────────────────

export const RECOMMENDED_RECIPES_POOL: Recipe[] = [
  // 🔽 유저가 [저장]할 레시피 3개 (MOCK_RECIPES와 동일)
  {
    id: "r1",
    title: "삼겹살 듬뿍 김치볶음밥",
    matchCount: 4,
    totalCount: 5,
    difficulty: "쉬움",
    time: "15분",
    kcal: "650kcal",
    ingredients: ["삼겹살", "김치", "대파", "밥", "참기름"],
    steps: [
      "대파는 송송 썰고, 김치와 삼겹살은 먹기 좋은 크기로 잘게 잘라 준비합니다.",
      "팬을 중불로 달군 후, 삼겹살을 넣고 노릇노릇해질 때까지 3분 볶아줍니다.",
      "삼겹살 기름이 충분히 나오면 대파를 넣고 파기름을 냅니다.",
      "파향이 올라오면 잘게 썬 김치를 넣고 2분 더 볶아줍니다.",
      "불을 약하게 줄이고 밥을 넣어 고루 섞은 뒤, 참기름을 한 바퀴 둘러 완성합니다.",
    ],
  },
  {
    id: "r2",
    title: "대파 계란 볶음밥",
    matchCount: 3,
    totalCount: 4,
    difficulty: "아주 쉬움",
    time: "10분",
    kcal: "420kcal",
    ingredients: ["대파", "계란", "밥", "간장"],
    steps: [
      "대파는 송송 썰어 준비하고, 계란은 미리 풀어둡니다.",
      "팬에 기름을 두르고 대파를 넣어 파기름을 냅니다.",
      "파향이 올라오면 밥을 넣고 1분간 볶아줍니다.",
      "풀어둔 계란을 넣고 빠르게 섞어 볶습니다.",
      "간장 한 바퀴 둘러 마무리합니다.",
    ],
  },
  {
    id: "r3",
    title: "삼겹살 대파 구이",
    matchCount: 2,
    totalCount: 4,
    difficulty: "보통",
    time: "20분",
    kcal: "580kcal",
    ingredients: ["삼겹살", "대파", "마늘", "쌈장"],
    steps: [
      "삼겹살은 먹기 좋은 크기로 자르고, 대파는 어슷썰기 합니다.",
      "팬을 강불로 달군 후 삼겹살을 올려 겉면이 노릇해질 때까지 굽습니다.",
      "삼겹살이 반쯤 익으면 다진 마늘을 넣고 함께 볶습니다.",
      "대파를 넣고 30초간 빠르게 볶아 마무리합니다.",
      "쌈장과 곁들여 드세요.",
    ],
  },

  // 🔽 유저가 [거절]할 레시피 2개 (보유 재료 기반이지만 패스함)
  {
    id: "r4",
    title: "얼큰 김치 만두 전골",
    matchCount: 3, // 김치, 대파, 만두 보유
    totalCount: 6,
    difficulty: "보통",
    time: "25분",
    kcal: "720kcal",
    ingredients: ["만두", "김치", "대파", "사골육수", "고춧가루", "버섯"],
    steps: [
      "김치는 먹기 좋게 자르고, 대파는 어슷썰어 준비합니다.",
      "냄비에 사골육수를 붓고 끓기 시작하면 김치를 넣어 5분간 끓입니다.",
      "만두를 넣고 다시 끓어오르면 중불로 줄여 7분간 익힙니다.",
      "버섯과 대파를 넣고 고춧가루로 간을 맞춥니다.",
      "3분 더 끓인 후 완성합니다.",
    ],
  },
  {
    id: "r5",
    title: "삼겹살 비빔면",
    matchCount: 1, // 삼겹살만 보유
    totalCount: 3,
    difficulty: "쉬움",
    time: "10분",
    kcal: "600kcal",
    ingredients: ["삼겹살", "비빔라면", "오이"],
    steps: [
      "비빔라면을 끓는 물에 3분간 삶아 찬물에 헹궈 준비합니다.",
      "삼겹살은 얇게 썰어 팬에 바삭하게 구워냅니다.",
      "오이는 채썰어 준비합니다.",
      "면, 삼겹살, 오이를 그릇에 담고 동봉된 비빔장에 비벼 완성합니다.",
    ],
  },
];

// ─── Recipe Details (recipe-detail.tsx) — 요리 진행(타이머) 완벽 대응 ───────────────

export const MOCK_RECIPE_DETAILS: RecipeDetail[] = [
  {
    id: "1",
    title: "삼겹살 듬뿍 김치볶음밥",
    matchCount: 4,
    totalCount: 5,
    difficulty: "쉬움",
    time: "15분",
    kcal: "650kcal",
    ingredients: [
      { name: "삼겹살", amount: 150, unit: "g", owned: true },
      { name: "김치", amount: 50, unit: "g", owned: true },
      { name: "대파", amount: 30, unit: "g", owned: true },
      { name: "밥", amount: 200, unit: "g", owned: true },
      { name: "참기름", amount: 1, unit: "g", owned: false },
    ],
    steps: [
      { order: 1, instruction: "대파는 송송 썰고, 김치와 삼겹살은 먹기 좋은 크기로 잘게 잘라 준비합니다." },
      { order: 2, instruction: "팬을 중불로 달군 후, 삼겹살을 넣고 노릇노릇해질 때까지 3분 볶아줍니다.", timerSeconds: 180 },
      { order: 3, instruction: "삼겹살 기름이 충분히 나오면 대파를 넣고 파기름을 냅니다." },
      { order: 4, instruction: "파향이 올라오면 잘게 썬 김치를 넣고 2분 더 볶아줍니다.", timerSeconds: 120 },
      { order: 5, instruction: "불을 약하게 줄이고 밥을 넣어 고루 섞은 뒤, 참기름을 한 바퀴 둘러 완성합니다." },
    ],
  },
];
