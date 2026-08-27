// Fake HTTP transport for the auth harness.
//
// Swaps axios adapters instead of stubbing our own code, so every request still
// runs through the real request/response interceptors in services/api.ts:
//   - `api.defaults.adapter`   -> application requests
//   - `axios.defaults.adapter` -> the bare axios.post() used by the refresh call
//
// Each installed transport records every attempt that reached the wire, which is
// what lets the tests assert "0 retries" and "exactly 1 refresh".

import axios, { AxiosError } from "axios";
import { API_BASE_URL, AUTH_ENDPOINTS } from "@/constants/config";
import { api, authEvents } from "@/services/api";
import { tokenStorage } from "@/services/tokenStorage";

const REFRESH_URL = `${API_BASE_URL}${AUTH_ENDPOINTS.refresh}`;

function normalizePath(config) {
  const url = config?.url ?? "";
  const withoutBase = url.startsWith(API_BASE_URL)
    ? url.slice(API_BASE_URL.length)
    : url;
  const cut = withoutBase.search(/[?#]/);
  return cut >= 0 ? withoutBase.slice(0, cut) : withoutBase;
}

function settle(config, { status = 200, data = {}, headers = {} }) {
  // headers: 응답 헤더 (예: 429의 { "retry-after": "60" }). axios는 헤더 키를
  // 소문자로 정규화해 노출하므로 라우트도 소문자 키로 넘긴다.
  const response = {
    status,
    statusText: String(status),
    headers,
    config,
    request: {},
    data,
  };
  if (status >= 200 && status < 300) {
    return Promise.resolve(response);
  }
  // A custom adapter owns status validation; axios' own settle() is bypassed.
  return Promise.reject(
    new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_REQUEST,
      config,
      response.request,
      response,
    ),
  );
}

/**
 * @param {object} options
 * @param {Record<string, (attempt: number) => {status?: number, data?: unknown}>} options.routes
 *   keyed by request path; `attempt` is 1-based per path.
 * @param {(attempt: number) => {status?: number, data?: unknown}} [options.refresh]
 *   response for POST /api/users/refresh. Defaults to a successful rotation.
 */
export function installTransport({ routes, refresh }) {
  const attempts = [];
  const refreshAttempts = [];
  const logoutEvents = [];
  const tokensRefreshedEvents = [];

  const perPathCount = new Map();

  api.defaults.adapter = async (config) => {
    const path = normalizePath(config);
    const attempt = (perPathCount.get(path) ?? 0) + 1;
    perPathCount.set(path, attempt);
    attempts.push({
      path,
      attempt,
      method: (config.method ?? "get").toUpperCase(),
      authorization: config.headers?.Authorization ?? null,
      data: config.data,
    });

    const route = routes[path];
    if (!route) {
      return settle(config, { status: 404, data: { code: "NO_ROUTE", path } });
    }
    return settle(config, route(attempt));
  };

  axios.defaults.adapter = async (config) => {
    const path = normalizePath(config);
    if (path !== AUTH_ENDPOINTS.refresh) {
      throw new Error(`unexpected bare-axios request to ${config.url}`);
    }
    refreshAttempts.push({ url: config.url, data: config.data });
    const responder =
      refresh ??
      (() => ({
        status: 200,
        data: { accessToken: "access-2", refreshToken: "refresh-2" },
      }));
    return settle(config, responder(refreshAttempts.length));
  };

  const offLogout = authEvents.onLogout(() => logoutEvents.push(Date.now()));
  const offRefreshed = authEvents.onTokensRefreshed(() =>
    tokensRefreshedEvents.push(Date.now()),
  );

  return {
    attempts,
    refreshAttempts,
    logoutEvents,
    tokensRefreshedEvents,
    refreshUrl: REFRESH_URL,
    attemptsFor: (path) => attempts.filter((a) => a.path === path),
    dispose: () => {
      offLogout();
      offRefreshed();
      api.defaults.adapter = undefined;
      axios.defaults.adapter = undefined;
    },
  };
}

/** Puts a usable session in SecureStore so refresh has something to send. */
export async function seedSession() {
  await tokenStorage.setTokens("access-1", "refresh-1");
}
