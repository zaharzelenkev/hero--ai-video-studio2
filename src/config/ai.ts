/**
 * AI Director runtime configuration.
 *
 * ПРОВАЙДЕРЫ (в порядке приоритета):
 *
 *   1) OpenRouter (primary, БЕСПЛАТНЫЕ модели `:free`)
 *      Ключ: OPENROUTER_API_KEY (сервер) или NEXT_PUBLIC_OPENROUTER_API_KEY
 *      (клиент). Бесплатные модели ротируются, поэтому в fallbackModels лежит
 *      целый список заведомо бесплатных моделей — клиент перебирает их и
 *      останавливается на первой рабочей. Единый лимит free-тира: 20 запросов
 *      в минуту и ~50 запросов в день на аккаунт (без пополнения баланса),
 *      поэтому клиент кэширует рабочую модель и не тратит лимит впустую.
 *
 *   2) Groq (fallback, если ключ GROQ_API_KEY всё ещё задан)
 *      Если OpenRouter недоступен (ключ невалиден/сеть/лимиты), callLLM
 *      автоматически пробует Groq как страховочный провайдер.
 *
 * NOTE: секреты не хардкодятся в исходниках (репозиторий публичный) — ключи
 * читаются из env. ВАЖНО: если приложение развёрнуто на Vercel, добавьте
 * OPENROUTER_API_KEY (и при необходимости NEXT_PUBLIC_OPENROUTER_API_KEY)
 * в настройки проекта — .env.local работает только локально.
 */

const resolveEnv = (...names: string[]): string => {
  if (typeof process === "undefined") return "";
  const env = (process as any).env || {};
  for (const n of names) {
    const v = env[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

export const AI_CONFIG = {
  // ------------------------------------------------------------------
  // OpenRouter — основной провайдер (все модели бесплатные, `:free`)
  // ------------------------------------------------------------------
  openRouterApiKey: resolveEnv("OPENROUTER_API_KEY", "NEXT_PUBLIC_OPENROUTER_API_KEY"),
  openRouterApiUrl: "https://openrouter.ai/api/v1/chat/completions",
  /**
   * Основная модель. `gpt-oss-120b:free` — самая мощная бесплатная модель
   * OpenRouter: 131K контекст, до 32K токенов ответа (все 12 разделов
   * препродакшена помещаются в один блок без обрезания), поддерживает
   * JSON-режим. Список ниже — страховка от ротации free-моделей: клиент
   * перебирает его и останавливается на первой работающей.
   */
  model: "openai/gpt-oss-120b:free",
  fallbackModels: [
    "openai/gpt-oss-120b:free",
    "openai/gpt-oss-20b:free",
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-coder:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "deepseek/deepseek-r1-distill-llama-70b:free",
    "nvidia/nemotron-3-ultra:free",
    "z-ai/glm-4.5-air:free",
    "google/gemma-4-31b-it:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
  ],

  // ------------------------------------------------------------------
  // Groq — страховочный провайдер (если ключ GROQ_API_KEY ещё задан)
  // ------------------------------------------------------------------
  groqApiKey: resolveEnv("GROQ_API_KEY", "NEXT_PUBLIC_GROQ_API_KEY"),
  groqApiUrl: "https://api.groq.com/openai/v1/chat/completions",
  groqFallbackModels: [
    "openai/gpt-oss-120b",
    "qwen/qwen3.6-27b",
    "llama-3.3-70b-versatile",
  ],

  // НЕ ограничиваем модель по времени: `0` означает «ждать ответ сколько нужно».
  // Единственный потолок — лимит платформы (Vercel maxDuration), его нельзя
  // обойти из кода, поэтому маршрут /api/director сам следит за своим бюджетом
  // времени и мягко деградирует (см. FULL_RUN_DEADLINE_MS в route.ts), а НЕ
  // обрывает запрос по нашему таймеру. Отдельные вызовы могут передать своё
  // timeoutMs, если для короткого запроса нужен жёсткий дедлайн.
  timeoutMs: 0,
  maxRetries: 4,
  retryBaseDelayMs: 600,
  streaming: false, // streaming disabled for now to keep JSON-mode reliable
};

/** Ключ OpenRouter на месте? (sk-or-v1-…) */
export const hasOpenRouterKey = (): boolean =>
  AI_CONFIG.openRouterApiKey.startsWith("sk-or-");

/** Ключ Groq на месте? (gsk_…) — только как страховочный провайдер. */
export const hasGroqKey = (): boolean => AI_CONFIG.groqApiKey.startsWith("gsk_");

/** Есть хотя бы один рабочий ключ — можно звать LLM. */
export const hasAIKey = (): boolean => hasOpenRouterKey() || hasGroqKey();
