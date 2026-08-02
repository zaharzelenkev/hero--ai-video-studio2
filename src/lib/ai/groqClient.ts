/**
 * Thin, robust Groq client used by the AI Director.
 *
 * Responsibilities:
 *   - honor AI_CONFIG.timeoutMs (AbortController)
 *   - retry transient network / 5xx errors with exponential backoff
 *   - treat 4xx (except 429) as fatal
 *   - never throw — return { ok:false } so the caller silently falls back
 *
 * The word "fallback" / "offline" / "heuristic" must NEVER appear in UI strings.
 * This module is an internal implementation detail.
 */

import { AI_CONFIG, hasGroqKey } from "@/config/ai";

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqOptions {
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" | "text" };
  model?: string;
  /** Override the global request timeout (ms). Used for long full-project generations. */
  timeoutMs?: number;
  /** Override the number of retry attempts for transient failures. */
  maxRetries?: number;
}

export interface GroqResult {
  ok: boolean;
  text: string;
  /** internal flag only — do not surface to the user */
  usedRemote: boolean;
  status?: number;
  /**
   * true when the model stopped because it hit max_tokens
   * (finish_reason === "length") — the answer is cut off and must not be
   * treated as a complete response.
   */
  truncated?: boolean;
}

export async function callGroq(opts: GroqOptions): Promise<GroqResult> {
  if (!hasGroqKey()) {
    return { ok: false, text: "", usedRemote: false };
  }

  const {
    messages,
    temperature = 0.7,
    maxTokens = 4000,
    responseFormat,
    model = AI_CONFIG.model,
    timeoutMs = AI_CONFIG.timeoutMs,
    maxRetries = AI_CONFIG.maxRetries,
  } = opts;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (responseFormat) body.response_format = responseFormat;

  let lastErr: unknown = null;
  // When Groq answers 429 we must wait for its Retry-After window (TPM/RPM
  // rate limits) instead of the generic backoff — otherwise every retry just
  // hits the same 429 again.
  let retryAfterMs: number | null = null;
  const maxAttempts = 1 + Math.max(0, maxRetries);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(AI_CONFIG.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_CONFIG.groqApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        // Do NOT let Next cache error responses.
        cache: "no-store",
      });

      if (res.ok) {
        const data = (await res.json().catch(() => null)) as any;
        const choice = data?.choices?.[0];
        const text: string =
          typeof choice?.message?.content === "string" ? choice.message.content : "";
        if (text && text.trim().length > 0) {
          const truncated = choice?.finish_reason === "length";
          if (truncated) {
            console.warn(
              "[groq] response truncated at max_tokens (finish_reason=length) — " +
                "answer is cut off, caller must not treat it as complete"
            );
          }
          return { ok: true, text, usedRemote: true, status: res.status, truncated };
        }
        // Empty response → treat as transient, retry.
        lastErr = new Error("empty response");
      } else {
        const text = await res.text().catch(() => "");
        lastErr = new Error(`groq ${res.status}: ${text.slice(0, 200)}`);
        // 429 (rate limit) is transient but only after Groq's Retry-After window.
        if (res.status === 429) {
          const ra = parseFloat(res.headers.get("retry-after") || "");
          retryAfterMs =
            Number.isFinite(ra) && ra > 0 ? Math.min(Math.ceil(ra) * 1000, 60_000) : null;
          console.warn("[groq] rate limited (429), retry-after:", ra);
        } else if (res.status >= 400 && res.status < 500) {
          // Fatal client errors → don't retry.
          console.warn("[groq] fatal client error", res.status, text.slice(0, 200));
          clearTimeout(timer);
          return { ok: false, text: "", usedRemote: false, status: res.status };
        }
      }
    } catch (e: any) {
      lastErr = e;
      if (e?.name === "AbortError") {
        lastErr = new Error("timeout");
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempt < maxAttempts - 1) {
      const delay = retryAfterMs ?? AI_CONFIG.retryBaseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.warn("[groq] failed after retries:", (lastErr as Error)?.message);
  return { ok: false, text: "", usedRemote: false };
}
