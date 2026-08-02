/**
 * Единая точка вызова LLM для AI Director'а и связанных функций.
 *
 * Провайдеры (в порядке приоритета):
 *   1. OpenRouter — бесплатные модели (`:free`), ключ OPENROUTER_API_KEY.
 *   2. Groq — страховка, если OpenRouter не ответил (ключ GROQ_API_KEY всё
 *      ещё задан в .env.local).
 *
 * Никогда не бросает исключений: при полном отказе обоих провайдеров
 * возвращает { ok:false }, и вызывающий код молча переходит на локальный
 * эвристический движок — пользователь всегда получает результат.
 */

import { AI_CONFIG, hasGroqKey, hasOpenRouterKey } from "@/config/ai";
import { callGroq, type GroqOptions } from "./groqClient";
import {
  callOpenRouter,
  type LLMOptions,
  type LLMResult,
} from "./openRouterClient";

export type { LLMOptions, LLMResult, LLMMessage } from "./openRouterClient";

/** Совместимость типов: Groq-клиент принимает тот же набор опций. */
type CompatibleOptions = GroqOptions & LLMOptions;

export async function callLLM(opts: CompatibleOptions): Promise<LLMResult> {
  // 1. OpenRouter (primary, бесплатные модели)
  if (hasOpenRouterKey()) {
    const res = await callOpenRouter(opts);
    if (res.ok) return res;
    if (!hasGroqKey()) return res;
    console.warn("[llm] OpenRouter не ответил — пробую Groq как страховку");
    const groq = await callGroq({
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      responseFormat: opts.responseFormat,
      model: opts.model ?? undefined,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
    });
    if (groq.ok) {
      return {
        ok: true,
        text: groq.text,
        usedRemote: true,
        status: groq.status,
        truncated: groq.truncated,
      };
    }
    return res;
  }

  // 2. Groq (только если OpenRouter-ключа нет вовсе)
  if (hasGroqKey()) {
    const groq = await callGroq({
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      responseFormat: opts.responseFormat,
      model: opts.model ?? undefined,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
    });
    return {
      ok: groq.ok,
      text: groq.text,
      usedRemote: groq.usedRemote,
      status: groq.status,
      truncated: groq.truncated,
    };
  }

  console.warn("[llm] нет ни одного API-ключа (OpenRouter/Groq)");
  return { ok: false, text: "", usedRemote: false };
}

/** Для совместимости с кодом, который ссылался на конфиг напрямую. */
export { AI_CONFIG };
