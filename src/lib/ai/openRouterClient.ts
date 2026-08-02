/**
 * Robust OpenRouter client (бесплатные модели `:free`) — используется AI
 * Director'ом как ОСНОВНОЙ провайдер вместо Groq.
 *
 * Отличия от Groq-клиента, которые делают его надёжным:
 *   - перебирает список БЕСПЛАТНЫХ моделей (`:free`) и останавливается на
 *     первой работающей (free-ротация на OpenRouter — обычное дело);
 *   - кэширует рабочую модель в рамках процесса, чтобы не жечь дневной лимит
 *     free-тира (20 req/min, ~50 req/day) повторными переборами;
 *   - помнит модели, которые «отвалились» (404/402/нет эндпоинтов), и больше
 *     их не дёргает;
 *   - если модель не поддерживает response_format / reasoning / большой
 *     max_tokens — перезапрашивает БЕЗ этого параметра, а не падает;
 *   - 429 ждёт окно Retry-After (до 120с), 5xx/сеть ретраит с backoff;
 *   - на обрезанном ответе (finish_reason=length) пробует СЛЕДУЮЩУЮ модель с
 *     бОльшим потолком вывода, а не сдаётся;
 *   - никогда не бросает исключение — всегда возвращает { ok:false },
 *     чтобы вызвавший код молча перешёл на локальный движок.
 */

import { AI_CONFIG, hasOpenRouterKey } from "@/config/ai";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" | "text" };
  model?: string;
  /** Override the global request timeout (ms). 0 / undefined = no timeout. */
  timeoutMs?: number;
  /** Override the number of retry attempts for transient failures. */
  maxRetries?: number;
}

export interface LLMResult {
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

/** Модель, которая уже успешно отвечала в этом процессе (кэш лимита). */
let preferredModel: string | null = null;
/** Модели, которые точно не работают (404/402/нет free-эндпоинта). */
const blockedModels = new Set<string>();

function candidatesFor(requested: string | undefined): string[] {
  const list: string[] = [];
  const first = preferredModel || requested || AI_CONFIG.model;
  for (const m of [first, ...(AI_CONFIG.fallbackModels || [])]) {
    if (m && !list.includes(m)) list.push(m);
  }
  return list.filter((m) => !blockedModels.has(m));
}

export async function callOpenRouter(opts: LLMOptions): Promise<LLMResult> {
  if (!hasOpenRouterKey()) {
    return { ok: false, text: "", usedRemote: false };
  }

  const {
    messages,
    temperature = 0.7,
    maxTokens = 4000,
    responseFormat,
    model,
    timeoutMs = AI_CONFIG.timeoutMs,
    maxRetries = AI_CONFIG.maxRetries,
  } = opts;

  const candidates = candidatesFor(model);
  if (candidates.length === 0) {
    console.warn("[openrouter] нет ни одной рабочей модели (все заблокированы)");
    return { ok: false, text: "", usedRemote: false };
  }

  /** Лучший (самый длинный) обрезанный ответ — вернём его, если всё обрежется. */
  let bestTruncated: LLMResult | null = null;
  let lastHardFailure: LLMResult = { ok: false, text: "", usedRemote: false };

  for (const activeModel of candidates) {
    const res = await tryModel(activeModel, {
      messages,
      temperature,
      maxTokens,
      responseFormat,
      timeoutMs,
      maxRetries,
    });

    if (!res) {
      // Модель бесполезна (декомисшн/нет free-эндпоинта/402) — больше не пробуем.
      blockedModels.add(activeModel);
      if (preferredModel === activeModel) preferredModel = null;
      console.warn(`[openrouter] модель "${activeModel}" недоступна, пробую следующую`);
      continue;
    }
    if (res.ok) {
      if (!res.truncated) {
        preferredModel = activeModel;
        return res;
      }
      // Обрезанный ответ: запоминаем лучший и пробуем модель с бОльшим потолком.
      if (!bestTruncated || res.text.length > bestTruncated.text.length) {
        bestTruncated = res;
      }
      console.warn(
        `[openrouter] модель "${activeModel}" обрезала ответ (${res.text.length} симв.), пробую следующую`
      );
      continue;
    }
    // Жёсткая ошибка ключа — нет смысла перебирать модели дальше.
    if (res.status === 401 || res.status === 403) {
      console.warn(`[openrouter] ошибка авторизации (${res.status}) — ключ невалиден`);
      return res;
    }
    // Остальные ошибки: запоминаем и пробуем следующую модель.
    lastHardFailure = res;
    console.warn(
      `[openrouter] модель "${activeModel}" вернула ошибку ${res.status}, пробую следующую`
    );
  }

  if (bestTruncated) return bestTruncated;
  return lastHardFailure;
}

/**
 * Пытает одну модель с ретраями. Возвращает:
 *   - LLMResult c ok:true (полный или обрезанный ответ);
 *   - LLMResult c ok:false (жёсткая ошибка: 401/403/400-не-модельная);
 *   - null, когда модель сама по себе негодна (404/402/декомисшн) — вызывающий
 *     код переходит к следующему кандидату.
 */
async function tryModel(
  activeModel: string,
  opts: {
    messages: LLMMessage[];
    temperature: number;
    maxTokens: number;
    responseFormat?: { type: "json_object" | "text" };
    timeoutMs: number;
    maxRetries: number;
  }
): Promise<LLMResult | null> {
  const { messages, temperature, responseFormat, timeoutMs, maxRetries } = opts;
  let maxTokens = opts.maxTokens;

  // Параметры, которые модель может не поддержать: при 400 снимаем их по одному
  // и перезапрашиваем ТУ ЖЕ модель, а не теряем её из-за одного параметра.
  let useResponseFormat = Boolean(responseFormat);
  let useReasoningOff = activeModel.startsWith("openai/gpt-oss");

  const maxAttempts = 1 + Math.max(0, maxRetries);
  let retryAfterMs: number | null = null;
  /** Сколько раз уже ждали окно Retry-After: после 1-го раза при повторном 429
   *  сдаёмся и переходим к следующей модели — лимит free-тира общий для всех
   *  моделей аккаунта, ждать по 2 минуты на каждую бессмысленно. */
  let waited429 = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer: ReturnType<typeof setTimeout> | undefined =
      timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    const body: Record<string, unknown> = {
      model: activeModel,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (useResponseFormat) body.response_format = responseFormat;
    // У gpt-oss по умолчанию включён reasoning — для генерации JSON он не нужен
    // и съедает бюджет токенов ответа. Отключаем, если модель это умеет.
    if (useReasoningOff) body.reasoning = { enabled: false };

    try {
      const res = await fetch(AI_CONFIG.openRouterApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_CONFIG.openRouterApiKey}`,
          // OpenRouter просит идентифицировать приложение (необязательно, но
          // некоторые free-эндпоинты без этого ведут себя хуже).
          "HTTP-Referer": "https://github.com/zaharzelenkev/moontiq--ai-video-studio",
          "X-Title": "MONTIQ AI Video Studio",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
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
              `[openrouter] "${activeModel}" обрезан на max_tokens=${maxTokens} (finish_reason=length)`
            );
          }
          return { ok: true, text, usedRemote: true, status: res.status, truncated };
        }
        console.warn(`[openrouter] "${activeModel}" вернул пустой ответ, ретрай`);
      } else {
        const errText = await res.text().catch(() => "");
        const low = errText.toLowerCase();

        // 429 — лимиты free-тира; ждём окно Retry-After и ретраим.
        if (res.status === 429) {
          if (waited429) {
            console.warn(
              `[openrouter] "${activeModel}" повторно 429 — переходим к следующей модели`
            );
            clearTimeout(timer);
            return null;
          }
          waited429 = true;
          const ra = parseFloat(res.headers.get("retry-after") || "");
          retryAfterMs =
            Number.isFinite(ra) && ra > 0 ? Math.min(Math.ceil(ra) * 1000, 120_000) : null;
          console.warn(`[openrouter] rate limited (429), retry-after: ${ra}`);
        }
        // 402 — нет кредитов / эндпоинт не бесплатный: модель негодна.
        else if (res.status === 402) {
          clearTimeout(timer);
          return null;
        }
        // 404 и «модель не найдена» — модель негодна, переходим дальше.
        else if (isModelUnavailableError(res.status, errText)) {
          clearTimeout(timer);
          return null;
        }
        // 400 — возможно, параметр не поддерживается: снимаем и перезапрашиваем.
        else if (res.status === 400) {
          if (useResponseFormat && /response_format|response format|json|json_object/i.test(low)) {
            console.warn(`[openrouter] "${activeModel}" не принял response_format — повторяю без него`);
            useResponseFormat = false;
            clearTimeout(timer);
            continue;
          }
          if (useReasoningOff && /reasoning|thinking/i.test(low)) {
            console.warn(`[openrouter] "${activeModel}" не принял reasoning — повторяю без него`);
            useReasoningOff = false;
            clearTimeout(timer);
            continue;
          }
          if (/max_tokens|maximum context|context length|too long|exceeds/i.test(low)) {
            const next = Math.floor(maxTokens / 2);
            if (next >= 512) {
              console.warn(
                `[openrouter] "${activeModel}" не принял max_tokens=${maxTokens} — снижаю до ${next}`
              );
              maxTokens = next;
              clearTimeout(timer);
              continue;
            }
          }
          // Прочая 400-ошибка — модель негодна (например, депрекейтнутый слаг).
          if (/model|not found|not supported|no endpoints/i.test(low)) {
            clearTimeout(timer);
            return null;
          }
          console.warn(`[openrouter] fatal client error ${res.status}: ${errText.slice(0, 200)}`);
          clearTimeout(timer);
          return { ok: false, text: "", usedRemote: false, status: res.status };
        }
        // 401/403 — невалидный ключ, перебирать модели бессмысленно.
        else if (res.status === 401 || res.status === 403) {
          console.warn(`[openrouter] auth error ${res.status}: ${errText.slice(0, 200)}`);
          clearTimeout(timer);
          return { ok: false, text: "", usedRemote: false, status: res.status };
        }
        // Прочие 4xx — жёсткая ошибка.
        else if (res.status >= 400 && res.status < 500) {
          console.warn(`[openrouter] fatal client error ${res.status}: ${errText.slice(0, 200)}`);
          clearTimeout(timer);
          return { ok: false, text: "", usedRemote: false, status: res.status };
        }
        // 5xx — транзиентная, ретрай с backoff.
        else {
          console.warn(`[openrouter] server error ${res.status}, ретрай`);
        }
      }
    } catch (e: any) {
      console.warn(
        `[openrouter] request error: ${e?.name === "AbortError" ? "timeout" : e?.message}`
      );
    } finally {
      clearTimeout(timer);
    }

    if (attempt < maxAttempts - 1) {
      const delay = retryAfterMs ?? AI_CONFIG.retryBaseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Ретраи исчерпаны — для этой модели считаем «негодна» и идём дальше.
  return null;
}

/**
 * True when a fatal 4xx means the model itself is not usable (deprecated,
 * decommissioned, inactive or simply not found) — i.e. no retry on the same
 * model will ever succeed and the client must switch to a fallback model.
 */
function isModelUnavailableError(status: number, body: string): boolean {
  const low = body.toLowerCase();
  if (status === 404 && /model|endpoint/i.test(low)) return true;
  return /model_not_found|model_decommissioned|model_inactive|decommissioned|does not exist|not found|not supported|no endpoints/i.test(
    low
  );
}
