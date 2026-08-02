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
        const text: string = data?.choices?.[0]?.message?.content ?? "";
        if (text && text.trim().length > 0) {
          return { ok: true, text, usedRemote: true, status: res.status };
        }
        // Empty response → treat as transient, retry.
        lastErr = new Error("empty response");
      } else {
        const text = await res.text().catch(() => "");
        lastErr = new Error(`groq ${res.status}: ${text.slice(0, 200)}`);
        // Fatal client errors (other than 429) → don't retry.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
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
      const delay = AI_CONFIG.retryBaseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.warn("[groq] failed after retries:", (lastErr as Error)?.message);
  return { ok: false, text: "", usedRemote: false };
}
