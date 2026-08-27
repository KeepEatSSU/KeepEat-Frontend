// Baseline coverage for the auth primitives the interceptor is built on.
// These must keep passing unchanged across auth work.

import test from "node:test";
import assert from "node:assert/strict";
import {
  clearPersistedAuthTokens,
  createAuthRefreshCoordinator,
  parseAuthTokens,
  savePersistedAuthTokens,
} from "@/services/authSession";
import { getErrorCode, getErrorMessage, getErrorStatus } from "@/services/api";

function fakePersistence() {
  const state = { access: null, refresh: null };
  return {
    state,
    setAccessToken: async (t) => void (state.access = t),
    setRefreshToken: async (t) => void (state.refresh = t),
    deleteAccessToken: async () => void (state.access = null),
    deleteRefreshToken: async () => void (state.refresh = null),
  };
}

test("parseAuthTokens accepts a well-formed pair", () => {
  assert.deepEqual(parseAuthTokens({ accessToken: "a", refreshToken: "b" }), {
    accessToken: "a",
    refreshToken: "b",
  });
});

test("parseAuthTokens rejects everything else", () => {
  for (const bad of [
    null,
    undefined,
    "a",
    42,
    [],
    {},
    { accessToken: "a" },
    { refreshToken: "b" },
    { accessToken: "", refreshToken: "b" },
    { accessToken: "a", refreshToken: "   " },
    { accessToken: 1, refreshToken: 2 },
  ]) {
    assert.equal(parseAuthTokens(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("savePersistedAuthTokens writes both tokens", async () => {
  const p = fakePersistence();
  await savePersistedAuthTokens(p, "a", "b");
  assert.deepEqual(p.state, { access: "a", refresh: "b" });
});

test("savePersistedAuthTokens refuses a partial pair and leaves nothing behind", async () => {
  const p = fakePersistence();
  p.state.access = "stale";
  await assert.rejects(() => savePersistedAuthTokens(p, "a", ""));
  assert.deepEqual(p.state, { access: null, refresh: null });
});

test("clearPersistedAuthTokens removes both tokens", async () => {
  const p = fakePersistence();
  await savePersistedAuthTokens(p, "a", "b");
  await clearPersistedAuthTokens(p);
  assert.deepEqual(p.state, { access: null, refresh: null });
});

test("refresh coordinator is single-flight", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  const coordinator = createAuthRefreshCoordinator({
    getRefreshToken: async () => "r",
    requestRefresh: async () => {
      calls += 1;
      await gate;
      return { accessToken: "a2", refreshToken: "r2" };
    },
    saveAuthTokens: async () => {},
    expireSession: async () => {},
  });

  const all = Promise.all([coordinator.refresh(), coordinator.refresh(), coordinator.refresh()]);
  release();
  const tokens = await all;

  assert.equal(calls, 1);
  assert.deepEqual(tokens, ["a2", "a2", "a2"]);
});

test("refresh coordinator expires the session when refresh fails", async () => {
  let expired = 0;
  const coordinator = createAuthRefreshCoordinator({
    getRefreshToken: async () => "r",
    requestRefresh: async () => {
      throw new Error("boom");
    },
    saveAuthTokens: async () => {},
    expireSession: async () => void (expired += 1),
  });

  await assert.rejects(() => coordinator.refresh());
  assert.equal(expired, 1);
});

test("refresh coordinator expires the session when no refresh token is stored", async () => {
  let expired = 0;
  const coordinator = createAuthRefreshCoordinator({
    getRefreshToken: async () => null,
    requestRefresh: async () => assert.fail("must not hit the network"),
    saveAuthTokens: async () => {},
    expireSession: async () => void (expired += 1),
  });

  await assert.rejects(() => coordinator.refresh());
  assert.equal(expired, 1);
});

test("getErrorMessage prefers the backend message and falls back otherwise", () => {
  const axiosLike = {
    isAxiosError: true,
    response: { data: { message: "이메일 또는 비밀번호가 일치하지 않습니다." } },
  };
  assert.equal(getErrorMessage(axiosLike, "fallback"), "이메일 또는 비밀번호가 일치하지 않습니다.");
  assert.equal(getErrorMessage({ isAxiosError: true, response: { data: {} } }, "fallback"), "fallback");
  assert.equal(getErrorMessage(new Error("nope"), "fallback"), "fallback");
});

test("getErrorStatus reports the HTTP status, or null without a response", () => {
  assert.equal(getErrorStatus({ isAxiosError: true, response: { status: 401, data: {} } }), 401);
  assert.equal(getErrorStatus({ isAxiosError: true }), null, "network failure has no status");
  assert.equal(getErrorStatus(new Error("nope")), null);
});

test("getErrorCode reads `code`, and returns null for the expiry-401 body", () => {
  const credential = {
    isAxiosError: true,
    response: { status: 401, data: { status: "error", code: "INVALID_CREDENTIALS", message: "x" } },
  };
  const expired = {
    isAxiosError: true,
    response: { status: 401, data: { error: "Unauthorized", message: "x" } },
  };
  assert.equal(getErrorCode(credential), "INVALID_CREDENTIALS");
  // 이 null이 화면에서 "세션 폐기"를 가르는 유일한 근거다.
  assert.equal(getErrorCode(expired), null);
  assert.equal(getErrorCode({ isAxiosError: true, response: { data: null } }), null);
  assert.equal(getErrorCode({ isAxiosError: true, response: { data: "<html>" } }), null);
  assert.equal(getErrorCode({ isAxiosError: true, response: { data: [{ code: "X" }] } }), null);
  assert.equal(getErrorCode({ isAxiosError: true, response: { data: { code: 400 } } }), null);
  assert.equal(getErrorCode(new Error("nope")), null);
});
