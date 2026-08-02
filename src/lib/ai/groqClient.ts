/**
 * Thin, robust Groq client used by the AI Director.
 *
 * Responsibilities:
 *   - honor AI_CONFIG.timeoutMs (AbortController); 0 / undefined = NO timeout,
 *     i.e. wait for the model as long as it takes (the platform's own
 *     maxDuration is the only real ceiling — see /api/director route)
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
    model = AI_CONFIG.groqFallbackModels[0],
    timeoutMs = AI_CONFIG.timeoutMs,
    maxRetries = AI_CONFIG.maxRetries,
  } = opts;

  // Build the ordered list of models to try. Start with the explicitly requested
  // one (or the configured primary), then every fallback that differs. If a model
  // is deprecated/decommissioned Groq answers with a fatal 4xx model error and we
  // advance to the next one instead of failing the whole request.
  const candidates: string[] = [];
  for (const m of [model, ...(AI_CONFIG.groqFallbackModels || [])]) {
    if (m && !candidates.includes(m)) candidates.push(m);
  }

  const maxAttempts = 1 + Math.max(0, maxRetries);

  for (const activeModel of candidates) {
    const res = await tryModel(activeModel, {
      messages,
      temperature,
      maxTokens,
      responseFormat,
      timeoutMs,
      maxAttempts,
    });
    if (res) return res;
    console.warn(`[groq] model "${activeModel}" unusable, trying next candidate`);
  }

  console.warn("[groq] failed after all retries across every candidate model");
  return { ok: false, text: "", usedRemote: false };
}

/**
 * Attempts a single model with retries. Returns a successful GroqResult, or
 * `null` when the model itself is unusable (deprecated / decommissioned / not
 * found) and the caller should advance to the next candidate.
 */
async function tryModel(
  activeModel: string,
  opts: {
    messages: GroqMessage[];
    temperature: number;
    maxTokens: number;
    responseFormat?: { type: "json_object" | "text" };
    timeoutMs: number;
    maxAttempts: number;
  }
): Promise<GroqResult | null> {
  const { messages, temperature, maxTokens, responseFormat, timeoutMs, maxAttempts } =
    opts;

  const body: Record<string, unknown> = {
    model: activeModel,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (responseFormat) body.response_format = responseFormat;

  // When Groq answers 429 we must wait for its Retry-After window (TPM/RPM
  // rate limits) instead of the generic backoff — otherwise every retry just
  // hits the same 429 again. Groq can ask to wait several minutes on TPM
  // limits, so we cap the wait generously (2 min per retry); the caller's own
  // deadline guards the overall budget.
  let retryAfterMs: number | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // timeoutMs <= 0 → без таймера: ждём ответ Groq сколько потребуется.
    // Платформенный maxDuration всё равно обрежет запрос сверху.
    const controller = new AbortController();
    const timer: ReturnType<typeof setTimeout> | undefined =
      timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    try {
      const res = await fetch(AI_CONFIG.groqApiUrl, {
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
        console.warn("[groq] empty response, retrying");
      } else {
        const text = await res.text().catch(() => "");
        // 429 (rate limit) is transient but only after Groq's Retry-After window.
        if (res.status === 429) {
          const ra = parseFloat(res.headers.get("retry-after") || "");
          retryAfterMs =
            Number.isFinite(ra) && ra > 0 ? Math.min(Math.ceil(ra) * 1000, 120_000) : null;
          console.warn("[groq] rate limited (429), retry-after:", ra);
        } else if (res.status >= 400 && res.status < 500) {
          // Fatal client errors. If the model itself is deprecated / decommissioned /
          // not found, bail out of THIS model and let callGroq advance to the next
          // candidate. Any other fatal 4xx is returned as a hard failure.
          if (isModelUnavailableError(res.status, text)) {
            console.warn(
              `[groq] model "${activeModel}" unavailable (${res.status}), advancing to next candidate`
            );
            clearTimeout(timer);
            return null;
          }
          console.warn("[groq] fatal client error", res.status, text.slice(0, 200));
          clearTimeout(timer);
          return { ok: false, text: "", usedRemote: false, status: res.status };
        }
      }
    } catch (e: any) {
      console.warn("[groq] request error:", e?.name === "AbortError" ? "timeout" : e?.message);
    } finally {
      clearTimeout(timer);
    }

    if (attempt < maxAttempts - 1) {
      const delay = retryAfterMs ?? AI_CONFIG.retryBaseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Exhausted retries for this model — let the caller advance to the next one.
  return null;
}

/**
 * True when a fatal 4xx means the model itself is not usable (deprecated,
 * decommissioned, inactive or simply not found) — i.e. no retry on the same
 * model will ever succeed and the client must switch to a fallback model.
 */
function isModelUnavailableError(status: number, body: string): boolean {
  const low = body.toLowerCase();
  if (status === 404 && /model/i.test(low)) return true;
  return /model_not_found|model_decommissioned|model_inactive|decommissioned|does not exist|not found|not supported/i.test(
    low
  );
}
