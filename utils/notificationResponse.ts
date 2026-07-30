import type { NotificationResponse } from "expo-notifications";

export type NotificationResponseConsumer =
  | "notification-routing"
  | "recipe-result-recovery";

const MAX_TRACKED_RESPONSES = 32;

let initialResponsePromise: Promise<NotificationResponse | null> | null = null;
const handledResponseKeys = new Map<
  NotificationResponseConsumer,
  Set<string>
>();

export function loadInitialNotificationResponseOnce(
  load: () => Promise<NotificationResponse | null>,
): Promise<NotificationResponse | null> {
  initialResponsePromise ??= load();
  return initialResponsePromise;
}

export function claimNotificationResponse(
  consumer: NotificationResponseConsumer,
  response: NotificationResponse,
): boolean {
  const key = [
    response.notification.request.identifier,
    response.actionIdentifier,
  ].join(":");
  const handled = handledResponseKeys.get(consumer) ?? new Set<string>();

  if (handled.has(key)) return false;

  handled.add(key);
  if (handled.size > MAX_TRACKED_RESPONSES) {
    const oldest = handled.values().next().value;
    if (oldest !== undefined) handled.delete(oldest);
  }
  handledResponseKeys.set(consumer, handled);
  return true;
}
