export type ClickToCallLiveIntent = {
  fromExtension: string;
  destinationNumber: string;
  createdAt: number;
  expiresAt: number;
  seenActive: boolean;
};

const intents = new Map<string, ClickToCallLiveIntent>();
const INTENT_TTL_MS = 90_000;

const digits = (value: unknown): string => String(value || '').replace(/\D/g, '');

export function rememberClickToCallLiveIntent(fromExtension: unknown, destinationNumber: unknown, now = Date.now()): ClickToCallLiveIntent | null {
  const from = digits(fromExtension);
  const destination = digits(destinationNumber);
  if (from.length < 2 || from.length > 5 || destination.length < 7) return null;
  const intent = { fromExtension: from, destinationNumber: destination, createdAt: now, expiresAt: now + INTENT_TTL_MS, seenActive: false };
  intents.set(from, intent);
  return intent;
}

export function getClickToCallLiveIntent(fromExtension: unknown, now = Date.now()): ClickToCallLiveIntent | null {
  const from = digits(fromExtension);
  const intent = intents.get(from);
  if (!intent) return null;
  if (intent.expiresAt <= now) {
    intents.delete(from);
    return null;
  }
  return intent;
}

export function clearClickToCallLiveIntent(fromExtension: unknown): void {
  intents.delete(digits(fromExtension));
}

export function markClickToCallLiveIntentActive(fromExtension: unknown): void {
  const intent = getClickToCallLiveIntent(fromExtension);
  if (intent) intent.seenActive = true;
}
