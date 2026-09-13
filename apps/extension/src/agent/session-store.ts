import { z } from "zod";

export const ACTIVE_SESSION_KEY = "privsight:active-session";
const SessionSchema = z.object({
  sessionId: z.string().min(1).max(64),
  tabId: z.number().int().nonnegative(),
  origin: z.string().url().refine(value => ["http:", "https:"].includes(new URL(value).protocol)),
  observationVersion: z.string().min(1).max(80),
  pending: z.unknown().optional(),
}).strict();

export type PersistedSession = z.infer<typeof SessionSchema>;
export interface SessionStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(record: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export async function saveSession(storage: SessionStorage, session: PersistedSession): Promise<void> {
  const parsed = SessionSchema.parse(session);
  await storage.set({ [ACTIVE_SESSION_KEY]: parsed });
}

export async function loadSession(storage: SessionStorage): Promise<PersistedSession | undefined> {
  const value = (await storage.get(ACTIVE_SESSION_KEY))[ACTIVE_SESSION_KEY];
  if (value === undefined) return undefined;
  const parsed = SessionSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  await storage.remove(ACTIVE_SESSION_KEY);
  return undefined;
}

export const clearSession = (storage: SessionStorage) => storage.remove(ACTIVE_SESSION_KEY);
