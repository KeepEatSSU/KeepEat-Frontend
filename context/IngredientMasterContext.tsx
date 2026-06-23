import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/context/AuthContext";
import {
  fetchMaster,
  getMasterSnapshot,
  type ResolvedSnapshot,
} from "@/services/ingredientMaster";

export type IngredientMasterStatus = "idle" | "loading" | "ready" | "error";

type IngredientMasterContextValue = {
  status: IngredientMasterStatus;
  snapshot: ResolvedSnapshot | null;
  error: string | null;
  refresh: () => Promise<void>;
  isReady: boolean;
};

const IngredientMasterContext =
  createContext<IngredientMasterContextValue | undefined>(undefined);

export function IngredientMasterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<IngredientMasterStatus>("idle");
  const [snapshot, setSnapshot] = useState<ResolvedSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setStatus("idle");
      setSnapshot(null);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setError(null);

    try {
      const source = await fetchMaster();
      const nextSnapshot = getMasterSnapshot();
      if (requestId !== requestIdRef.current) return;
      setSnapshot(nextSnapshot);
      setStatus("ready");
      if (__DEV__) console.log("[master] loaded from:", source);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setSnapshot(null);
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to load ingredient master");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      requestIdRef.current += 1;
      setStatus("idle");
      setSnapshot(null);
      setError(null);
      return;
    }
    refresh();
  }, [isAuthenticated, refresh]);

  const value = useMemo<IngredientMasterContextValue>(
    () => ({
      status,
      snapshot,
      error,
      refresh,
      isReady: status === "ready",
    }),
    [status, snapshot, error, refresh],
  );

  return (
    <IngredientMasterContext.Provider value={value}>
      {children}
    </IngredientMasterContext.Provider>
  );
}

export function useIngredientMaster(): IngredientMasterContextValue {
  const ctx = useContext(IngredientMasterContext);
  if (!ctx) {
    throw new Error(
      "useIngredientMaster must be used inside <IngredientMasterProvider>",
    );
  }
  return ctx;
}
