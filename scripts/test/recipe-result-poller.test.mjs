// RecipeResultPoller 하네스.
//
// 재현 대상 실기 버그 (Android Demo):
//   생성 요청 → 409 폴링 2회 → 홈 버튼(background, pause) → 2분+ 경과 후
//   RECIPE_READY push tap → resume — 이때 /result GET이 0회였다.
//   원인: pause 중에도 wall clock 기준 deadline이 소진되어, resume/재요청
//   시점에 timeout으로 즉시 종료되고 fetch가 나가지 않았다.
//
// 수정 계약:
//   1) pause는 deadline 시계를 정지시킨다 (background 시간은 예산 미소진).
//   2) push recover는 poller.start(now)로 신선한 deadline을 얻어
//      최소 1회 GET을 보장한다. 409면 폴링이 재개된다.

import test from "node:test";
import assert from "node:assert/strict";
import {
  RecipeResultPoller,
  classifyRecipeResultHttpStatus,
} from "@/utils/recipeResultPoller";

const INTERVAL_MS = 3_000;
const TIMEOUT_MS = 2 * 60 * 1_000;

function createHarness({ foreground = true } = {}) {
  const state = {
    now: 0,
    foreground,
    timers: [],
    fetchCalls: [],
    responses: [],
    completions: [],
    terminals: [],
  };

  const poller = new RecipeResultPoller({
    fetchResult: (timeoutMs) => {
      state.fetchCalls.push({ at: state.now, timeoutMs });
      const next = state.responses.shift();
      if (!next) throw new Error("응답 큐가 비었습니다 — 테스트 시나리오 오류");
      return next();
    },
    classifyError: (error) => classifyRecipeResultHttpStatus(error?.status),
    onComplete: (result) => state.completions.push(result),
    onTerminal: (failure) => state.terminals.push(failure),
    isForeground: () => state.foreground,
    now: () => state.now,
    schedule: (callback, delayMs) => {
      const timer = { callback, at: state.now + delayMs, cancelled: false };
      state.timers.push(timer);
      return timer;
    },
    cancelScheduled: (timer) => {
      timer.cancelled = true;
    },
  });

  return {
    state,
    poller,
    pending409: () => () => Promise.reject({ status: 409 }),
    resolved: (result) => () => Promise.resolve(result),
    // 살아 있는 다음 타이머 1개를 그 발화 시각으로 시계를 옮겨 실행한다.
    async fireNextTimer() {
      let timer = state.timers.shift();
      while (timer?.cancelled) timer = state.timers.shift();
      assert.ok(timer, "발화할 타이머가 없습니다");
      state.now = Math.max(state.now, timer.at);
      timer.callback();
      await drain();
    },
    liveTimers: () => state.timers.filter((t) => !t.cancelled),
  };
}

// requestResult 내부 async 체인이 정리될 때까지 microtask를 비운다.
async function drain() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

test("실기 타임라인: 2분+ background pause 후 resume이 GET을 발행하고 완료된다", async () => {
  const h = createHarness();
  h.state.responses = [h.pending409(), h.pending409(), h.resolved(["r1"])];

  // t=0: 생성 202 직후 start → 즉시 1회 GET → 409
  await h.poller.start(0);
  assert.equal(h.state.fetchCalls.length, 1);

  // t=3s: 폴링 2회차 → 409
  await h.fireNextTimer();
  assert.equal(h.state.fetchCalls.length, 2);

  // t=6s: 홈 버튼 → background. pause는 타이머 제거 + deadline 시계 정지.
  h.state.now = 6_000;
  h.state.foreground = false;
  h.poller.pause();
  assert.equal(h.liveTimers().length, 0);

  // 2분 이상 경과 후 push tap으로 resume.
  h.state.now = 126_000;
  h.state.foreground = true;
  await h.poller.resume();
  await drain();

  // 수정 전에는 timeout terminal + fetch 0회 추가였다. 수정 후에는
  // pause 구간이 예산에서 제외되어 GET이 나가고 200으로 완료된다.
  assert.equal(h.state.fetchCalls.length, 3);
  assert.deepEqual(h.state.completions, [["r1"]]);
  assert.equal(h.state.terminals.length, 0);
  assert.equal(h.poller.isRunning, false);
});

test("push recover: 만료된 run 위에서도 start(now)는 즉시 GET하고 200이면 완료된다", async () => {
  const h = createHarness();
  h.state.responses = [h.pending409(), h.resolved(["r1"])];

  await h.poller.start(0);
  h.state.now = 1_000;
  h.state.foreground = false;
  h.poller.pause();

  // 구 run의 원래 deadline(120s)을 한참 지난 시점의 push tap recover.
  // recoverResultFromPush는 resume이 아니라 start(now)를 호출한다.
  // AppState가 아직 active로 바뀌기 전이어도 start의 첫 요청은
  // foreground 게이트를 우회해야 한다.
  h.state.now = 300_000;
  await h.poller.start(h.state.now);
  await drain();

  assert.equal(h.state.fetchCalls.length, 2);
  assert.equal(h.state.fetchCalls[1].at, 300_000);
  assert.deepEqual(h.state.completions, [["r1"]]);
  assert.equal(h.state.terminals.length, 0);
});

test("push recover: 재시작 후 409면 신선한 deadline으로 폴링이 재개된다", async () => {
  const h = createHarness();
  h.state.responses = [h.pending409(), h.pending409(), h.resolved(["r1"])];

  await h.poller.start(0);
  h.poller.pause();

  h.state.now = 300_000;
  await h.poller.start(h.state.now);
  assert.equal(h.state.fetchCalls.length, 2);
  assert.equal(h.poller.isRunning, true);

  // 다음 폴링 타이머가 새 deadline 기준으로 살아 있고, 발화 시 GET이 나간다.
  assert.equal(h.liveTimers().length, 1);
  await h.fireNextTimer();
  assert.equal(h.state.fetchCalls.length, 3);
  assert.deepEqual(h.state.completions, [["r1"]]);
});

test("회귀 가드: foreground에서 실제로 2분을 소진하면 여전히 timeout으로 종료된다", async () => {
  const h = createHarness();
  h.state.responses = [h.pending409(), h.pending409()];

  await h.poller.start(0);
  await h.fireNextTimer();
  assert.equal(h.state.fetchCalls.length, 2);

  // pause 없이 foreground에서 deadline을 넘긴 다음 타이머 발화.
  const timer = h.state.timers.shift();
  h.state.now = TIMEOUT_MS + 1_000;
  timer.callback();
  await drain();

  assert.equal(h.state.fetchCalls.length, 2, "만료 후에는 fetch가 없어야 한다");
  assert.equal(h.state.terminals.length, 1);
  assert.equal(h.state.terminals[0].reason, "timeout");
  assert.equal(h.poller.isRunning, false);
});

test("완료 뒤의 늦은 resume은 아무 요청도 만들지 않는다", async () => {
  const h = createHarness();
  h.state.responses = [h.resolved(["r1"])];

  await h.poller.start(0);
  assert.deepEqual(h.state.completions, [["r1"]]);

  h.state.now = 10_000;
  await h.poller.resume();
  await drain();

  assert.equal(h.state.fetchCalls.length, 1);
  assert.equal(h.state.terminals.length, 0);
});

test("폴링 간격은 interval을 따른다 (pause 수정이 스케줄 계산을 깨지 않는다)", async () => {
  const h = createHarness();
  h.state.responses = [h.pending409(), h.pending409(), h.resolved(["r1"])];

  await h.poller.start(0);
  assert.equal(h.state.timers[0].at, INTERVAL_MS);
  await h.fireNextTimer();
  assert.equal(h.state.timers[0].at, INTERVAL_MS * 2);
  await h.fireNextTimer();
  assert.deepEqual(h.state.completions, [["r1"]]);
});
