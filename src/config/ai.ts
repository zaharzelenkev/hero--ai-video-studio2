/**
 * AI Director runtime configuration.
 *
 * Priority for the Groq API key:
 *   1) GROQ_API_KEY          (server-only, recommended — set it in Vercel/`.env.local`)
 *   2) NEXT_PUBLIC_GROQ_API_KEY (exposed to the client; acceptable for client-side usage)
 *
 * NOTE: no hardcoded keys are shipped — a leaked key in a public bundle is a
 * security and billing liability. The presence/absence of the key is an
 * internal detail: the UI never shows "offline", "fallback", "heuristic" or
 * similar technical messages to the user. If Groq is unreachable the director
 * transparently falls back to a local heuristic engine — the user just keeps
 * getting professional direction.
 */

const resolveKey = (): string => {
  // Server-side envs (Next exposes only NEXT_PUBLIC_* to the client; process.env
  // on the server still has GROQ_API_KEY).
  const serverKey =
    (typeof process !== "undefined" && (process as any).env?.GROQ_API_KEY) || "";
  const publicKey =
    (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_GROQ_API_KEY) || "";
  return String(serverKey || publicKey || "").trim();
};

export const AI_CONFIG = {
  groqApiKey: resolveKey(),
  apiUrl: "https://api.groq.com/openai/v1/chat/completions",
  /**
   * Primary chat/JSON model. NOTE: `llama-3.3-70b-versatile` was deprecated by
   * Groq (shutdown 2026-08-16) and returns `model_decommissioned` errors, which
   * used to make the AI Director fail with "не получил полный ответ". We now
   * use Groq's recommended replacement; `fallbackModels` protects us if any
   * model in the list gets deprecated in the future (the client auto-advances
   * to the next working model instead of hard-failing).
   */
  model: "openai/gpt-oss-120b",
  // Ordered fallback list. The client walks it in order and stops at the first
  // model that accepts requests, so a future deprecation can't break generation.
  fallbackModels: [
    "openai/gpt-oss-120b",
    "qwen/qwen3.6-27b",
    "llama-3.3-70b-versatile",
  ],
  // Robust networking: fail fast so the local engine can take over without the
  // user ever noticing a spinner of death.
  timeoutMs: 120_000,
  maxRetries: 3,
  retryBaseDelayMs: 600,
  streaming: false, // streaming disabled for now to keep JSON-mode reliable
};

/** Quick probe used by API routes to decide whether to even try Groq. */
export const hasGroqKey = (): boolean => AI_CONFIG.groqApiKey.startsWith("gsk_");
