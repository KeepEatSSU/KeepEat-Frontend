export type RecipeResultErrorDisposition =
  | "pending"
  | "transient"
  | "terminal";

export type RecipeResultTerminalReason =
  | "timeout"
  | "terminal-error"
  | "transient-retries-exhausted";

export interface RecipeResultTerminalFailure {
  reason: RecipeResultTerminalReason;
  error?: unknown;
}

interface RecipeResultPollerOptions<T> {
  fetchResult: (timeoutMs: number) => Promise<T>;
  classifyError: (error: unknown) => RecipeResultErrorDisposition;
  onComplete: (result: T) => void;
  onTerminal: (failure: RecipeResultTerminalFailure) => void;
  isForeground: () => boolean;
  intervalMs?: number;
  timeoutMs?: number;
  requestTimeoutMs?: number;
  maxTransientRetries?: number;
  now?: () => number;
  schedule?: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  cancelScheduled?: (timer: ReturnType<typeof setTimeout>) => void;
}

const DEFAULT_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_TRANSIENT_RETRIES = 3;

export function classifyRecipeResultHttpStatus(
  status: number | undefined,
): RecipeResultErrorDisposition {
  if (status === 409) return "pending";
  if (
    status === undefined ||
    status === 408 ||
    status === 429 ||
    status === 503 ||
    status === 504
  ) {
    return "transient";
  }
  return "terminal";
}

/**
 * Runs one recipe-result request at a time and schedules the next request only
 * after the previous one settles. The class owns no React or navigation state,
 * which keeps deadline and concurrency behavior independently testable.
 */
export class RecipeResultPoller<T> {
  private active = false;
  private generation = 0;
  private startedAt = 0;
  private transientRetries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: {
    generation: number;
    promise: Promise<void>;
  } | null = null;

  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxTransientRetries: number;
  private readonly now: () => number;
  private readonly schedule: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly cancelScheduled: (
    timer: ReturnType<typeof setTimeout>,
  ) => void;

  constructor(private readonly options: RecipeResultPollerOptions<T>) {
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxTransientRetries =
      options.maxTransientRetries ?? DEFAULT_MAX_TRANSIENT_RETRIES;
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? setTimeout;
    this.cancelScheduled = options.cancelScheduled ?? clearTimeout;
  }

  get isRunning(): boolean {
    return this.active;
  }

  /**
   * Starts a new polling generation and performs the required immediate first
   * request. That first request may finish after the app backgrounds; only
   * subsequent timer scheduling is paused outside the foreground.
   */
  start(startedAt = this.now()): Promise<void> {
    this.cancel();
    this.active = true;
    this.startedAt = startedAt;
    this.transientRetries = 0;
    return this.requestResult(true);
  }

  pause(): void {
    this.clearTimer();
  }

  resume(): Promise<void> {
    return this.requestResult(false);
  }

  expedite(): Promise<void> {
    return this.requestResult(false);
  }

  /**
   * Invalidates timers and any late response. The underlying network request
   * may still settle, but its generation can no longer call a consumer.
   */
  cancel(): void {
    this.active = false;
    this.generation += 1;
    this.startedAt = 0;
    this.transientRetries = 0;
    this.clearTimer();
  }

  private requestResult(allowInactive: boolean): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (!allowInactive && !this.options.isForeground()) {
      return Promise.resolve();
    }

    this.clearTimer();
    const remainingMs = this.remainingMs();
    if (remainingMs <= 0) {
      this.finish({ reason: "timeout" });
      return Promise.resolve();
    }

    const generation = this.generation;
    if (this.inFlight?.generation === generation) {
      return this.inFlight.promise;
    }

    const promise = (async () => {
      try {
        const result = await this.options.fetchResult(
          Math.min(this.requestTimeoutMs, remainingMs),
        );
        if (!this.isCurrent(generation)) return;
        if (this.remainingMs() <= 0) {
          this.finish({ reason: "timeout" });
          return;
        }

        this.active = false;
        this.clearTimer();
        this.options.onComplete(result);
      } catch (error) {
        if (!this.isCurrent(generation)) return;
        if (this.remainingMs() <= 0) {
          this.finish({ reason: "timeout", error });
          return;
        }

        const disposition = this.options.classifyError(error);
        if (disposition === "pending") {
          this.transientRetries = 0;
          this.scheduleNext();
          return;
        }
        if (disposition === "transient") {
          if (this.transientRetries < this.maxTransientRetries) {
            this.transientRetries += 1;
            this.scheduleNext();
            return;
          }
          this.finish({
            reason: "transient-retries-exhausted",
            error,
          });
          return;
        }

        this.finish({ reason: "terminal-error", error });
      }
    })();

    this.inFlight = { generation, promise };
    const clearInFlight = () => {
      if (
        this.inFlight?.generation === generation &&
        this.inFlight.promise === promise
      ) {
        this.inFlight = null;
      }
    };
    void promise.then(clearInFlight, clearInFlight);
    return promise;
  }

  private scheduleNext(): void {
    if (!this.active || !this.options.isForeground()) return;

    const remainingMs = this.remainingMs();
    if (remainingMs <= 0) {
      this.finish({ reason: "timeout" });
      return;
    }

    const generation = this.generation;
    this.timer = this.schedule(() => {
      this.timer = null;
      if (!this.isCurrent(generation)) return;
      void this.requestResult(false);
    }, Math.min(this.intervalMs, remainingMs));
  }

  private remainingMs(): number {
    return this.startedAt + this.timeoutMs - this.now();
  }

  private isCurrent(generation: number): boolean {
    return this.active && this.generation === generation;
  }

  private finish(failure: RecipeResultTerminalFailure): void {
    if (!this.active) return;
    this.active = false;
    this.clearTimer();
    this.options.onTerminal(failure);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    this.cancelScheduled(this.timer);
    this.timer = null;
  }
}
