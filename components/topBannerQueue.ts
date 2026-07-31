export type TopBannerFeedbackVariant =
  | "success"
  | "error"
  | "warning"
  | "info";

interface TopBannerItemBase {
  id: string;
  message: string;
  dedupeKey?: string;
  durationMs: number;
}

export interface TopBannerFeedbackItem extends TopBannerItemBase {
  kind: "feedback";
  variant: TopBannerFeedbackVariant;
}

export interface TopBannerNotificationItem extends TopBannerItemBase {
  kind: "notification";
  title?: string;
  onPress?: () => void;
}

export type TopBannerItem =
  | TopBannerFeedbackItem
  | TopBannerNotificationItem;

export interface TopBannerQueueState {
  current: TopBannerItem | null;
  pending: TopBannerItem[];
  interruptedFeedbackId: string | null;
}

export type TopBannerQueueAction =
  | { type: "enqueue"; item: TopBannerItem }
  | { type: "dismiss"; id: string };

export const MAX_TOP_BANNER_QUEUE_LENGTH = 8;

export const EMPTY_TOP_BANNER_QUEUE: TopBannerQueueState = {
  current: null,
  pending: [],
  interruptedFeedbackId: null,
};

function priorityOf(
  item: TopBannerItem,
  interruptedFeedbackId: string | null,
): number {
  if (item.kind === "notification") return 0;
  if (item.id === interruptedFeedbackId) return 1;
  if (item.variant === "error") return 2;
  if (item.variant === "warning") return 3;
  return 4;
}

function orderByPriority(
  items: TopBannerItem[],
  interruptedFeedbackId: string | null,
): TopBannerItem[] {
  const buckets: TopBannerItem[][] = [[], [], [], [], []];
  items.forEach((item) =>
    buckets[priorityOf(item, interruptedFeedbackId)].push(item),
  );
  return buckets.flat();
}

function evictionGroup(item: TopBannerItem): number {
  if (
    item.kind === "feedback" &&
    (item.variant === "success" || item.variant === "info")
  ) {
    return 0;
  }
  if (item.kind === "feedback" && item.variant === "warning") return 1;
  if (item.kind === "feedback") return 2;
  return 3;
}

function trimPending(
  items: TopBannerItem[],
  protectedId?: string,
): TopBannerItem[] {
  const next = [...items];

  while (next.length > MAX_TOP_BANNER_QUEUE_LENGTH) {
    let removalIndex = -1;

    for (let group = 0; group <= 3 && removalIndex < 0; group += 1) {
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (
          next[index].id !== protectedId &&
          evictionGroup(next[index]) === group
        ) {
          removalIndex = index;
          break;
        }
      }
    }

    if (removalIndex < 0) removalIndex = next.length - 1;
    next.splice(removalIndex, 1);
  }

  return next;
}

function replaceDedupeMatch(
  existing: TopBannerItem,
  latest: TopBannerItem,
): TopBannerItem {
  return { ...latest, id: existing.id };
}

export function enqueueTopBanner(
  state: TopBannerQueueState,
  item: TopBannerItem,
): TopBannerQueueState {
  if (item.dedupeKey !== undefined) {
    if (state.current?.dedupeKey === item.dedupeKey) {
      return {
        ...state,
        current: replaceDedupeMatch(state.current, item),
      };
    }

    const queuedIndex = state.pending.findIndex(
      (queued) => queued.dedupeKey === item.dedupeKey,
    );
    if (queuedIndex >= 0) {
      const pending = [...state.pending];
      pending[queuedIndex] = replaceDedupeMatch(
        pending[queuedIndex],
        item,
      );
      return {
        ...state,
        pending: trimPending(
          orderByPriority(pending, state.interruptedFeedbackId),
        ),
      };
    }
  }

  if (!state.current) {
    return {
      current: item,
      pending: state.pending,
      interruptedFeedbackId: state.interruptedFeedbackId,
    };
  }

  if (
    item.kind === "notification" &&
    state.current.kind === "feedback"
  ) {
    const resumedFeedback = state.current;
    return {
      current: item,
      pending: trimPending(
        orderByPriority(
          [resumedFeedback, ...state.pending],
          resumedFeedback.id,
        ),
        resumedFeedback.id,
      ),
      interruptedFeedbackId: resumedFeedback.id,
    };
  }

  return {
    ...state,
    pending: trimPending(
      orderByPriority(
        [...state.pending, item],
        state.interruptedFeedbackId,
      ),
      state.interruptedFeedbackId ?? undefined,
    ),
  };
}

export function dismissTopBanner(
  state: TopBannerQueueState,
  id: string,
): TopBannerQueueState {
  if (state.current?.id !== id) return state;
  const [current = null, ...pending] = state.pending;
  return {
    current,
    pending,
    interruptedFeedbackId:
      current?.id === state.interruptedFeedbackId
        ? null
        : state.interruptedFeedbackId,
  };
}

export function topBannerQueueReducer(
  state: TopBannerQueueState,
  action: TopBannerQueueAction,
): TopBannerQueueState {
  if (action.type === "enqueue") {
    return enqueueTopBanner(state, action.item);
  }
  return dismissTopBanner(state, action.id);
}

export function isActionableNotification(
  item: TopBannerItem,
): item is TopBannerNotificationItem & { onPress: () => void } {
  return item.kind === "notification" && item.onPress !== undefined;
}

export interface TopBannerPressGuard {
  setCurrent: (id: string | null) => void;
  claim: (id: string) => boolean;
}

export function createTopBannerPressGuard(): TopBannerPressGuard {
  let currentId: string | null = null;
  let claimed = false;

  return {
    setCurrent(id) {
      if (id === currentId) return;
      currentId = id;
      claimed = false;
    },
    claim(id) {
      if (id !== currentId || claimed) return false;
      claimed = true;
      return true;
    },
  };
}

type TimerToken = ReturnType<typeof setTimeout>;

export interface TopBannerTimer {
  schedule: (callback: () => void, durationMs: number) => void;
  clear: () => void;
}

export function createTopBannerTimer(
  schedule: (
    callback: () => void,
    durationMs: number,
  ) => TimerToken = setTimeout,
  cancel: (token: TimerToken) => void = clearTimeout,
): TopBannerTimer {
  let token: TimerToken | null = null;

  const clear = () => {
    if (token === null) return;
    cancel(token);
    token = null;
  };

  return {
    schedule(callback, durationMs) {
      clear();
      token = schedule(() => {
        token = null;
        callback();
      }, durationMs);
    },
    clear,
  };
}
