export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export interface AuthTokenPersistence {
  setAccessToken: (token: string) => Promise<void>;
  setRefreshToken: (token: string) => Promise<void>;
  deleteAccessToken: () => Promise<void>;
  deleteRefreshToken: () => Promise<void>;
}

export interface AuthRefreshDependencies {
  getRefreshToken: () => Promise<string | null>;
  requestRefresh: (refreshToken: string) => Promise<unknown>;
  saveAuthTokens: (tokens: AuthTokens) => Promise<void>;
  expireSession: () => Promise<void>;
}

export interface AuthRefreshCoordinator {
  refresh: () => Promise<string>;
  retryAfterRefresh: <T>(
    retry: (accessToken: string) => Promise<T>,
  ) => Promise<T>;
}

function isNonEmptyToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseAuthTokens(value: unknown): AuthTokens | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const data = value as Record<string, unknown>;
  if (
    !isNonEmptyToken(data.accessToken) ||
    !isNonEmptyToken(data.refreshToken)
  ) {
    return null;
  }

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

export async function clearPersistedAuthTokens(
  persistence: AuthTokenPersistence,
): Promise<void> {
  const results = await Promise.allSettled([
    Promise.resolve().then(() => persistence.deleteAccessToken()),
    Promise.resolve().then(() => persistence.deleteRefreshToken()),
  ]);
  const failed = results.find(
    (result): result is PromiseRejectedResult =>
      result.status === "rejected",
  );

  if (failed) {
    throw failed.reason;
  }
}

export async function savePersistedAuthTokens(
  persistence: AuthTokenPersistence,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  if (!isNonEmptyToken(accessToken) || !isNonEmptyToken(refreshToken)) {
    await clearPersistedAuthTokens(persistence);
    throw new Error("Both access and refresh tokens are required.");
  }

  const results = await Promise.allSettled([
    Promise.resolve().then(() => persistence.setAccessToken(accessToken)),
    Promise.resolve().then(() => persistence.setRefreshToken(refreshToken)),
  ]);
  const failed = results.find(
    (result): result is PromiseRejectedResult =>
      result.status === "rejected",
  );

  if (failed) {
    try {
      await clearPersistedAuthTokens(persistence);
    } catch {
      throw new Error(
        "Failed to save auth tokens and clear the partial session.",
      );
    }
    throw failed.reason;
  }
}

export function createAuthRefreshCoordinator(
  dependencies: AuthRefreshDependencies,
): AuthRefreshCoordinator {
  let inFlightRefresh: Promise<string> | null = null;

  async function performRefresh(): Promise<string> {
    try {
      const currentRefreshToken = await dependencies.getRefreshToken();
      if (!isNonEmptyToken(currentRefreshToken)) {
        throw new Error("No refresh token is available.");
      }

      const response = await dependencies.requestRefresh(currentRefreshToken);
      const tokens = parseAuthTokens(response);
      if (!tokens) {
        throw new Error("The refresh response did not contain valid tokens.");
      }

      await dependencies.saveAuthTokens(tokens);
      return tokens.accessToken;
    } catch (error) {
      await dependencies.expireSession();
      throw error;
    }
  }

  async function runSharedRefresh(): Promise<string> {
    try {
      return await performRefresh();
    } finally {
      inFlightRefresh = null;
    }
  }

  function refresh(): Promise<string> {
    if (!inFlightRefresh) {
      inFlightRefresh = runSharedRefresh();
    }
    return inFlightRefresh;
  }

  async function retryAfterRefresh<T>(
    retry: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const accessToken = await refresh();
    return retry(accessToken);
  }

  return {
    refresh,
    retryAfterRefresh,
  };
}
