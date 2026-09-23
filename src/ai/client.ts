import { CORPUS_VERSION } from "../data/evidence";
import {
  normalizeIntentExtraction,
  normalizeIntentV3Extraction,
} from "./intent-normalization";
import {
  createIntentMessagesV3,
  INTENT_PROMPT_VERSION_V3,
} from "./prompts-intent";
import { INTENT_VERSION } from "./intent";
import {
  createReadingMessages,
  READING_PROMPT_VERSION,
} from "./prompts-reading";
import {
  READING_VERSION,
  normalizeReadingResponse,
  validateReading,
  validateReadingContext,
} from "./reading-validation";
import type {
  InterpretationV3,
  ReadingMeta,
  ReadingRequest,
} from "./reading-types";
import type {
  AiMeta,
  IntentAssessment,
  IntentRequest,
  InterpretationRequest,
  InterpretationV2,
} from "./types";
import {
  AiClientError,
  CLARIFICATION_IDS,
  isRecord,
  validText,
  validateIntent,
  validateInterpretation,
  validateQuestion,
} from "./validation";
import {
  createIntentMessages,
  createInterpretationMessages,
  INTENT_PROMPT_VERSION,
  INTERPRETATION_PROMPT_VERSION,
} from "./prompts";

export { AiClientError } from "./validation";
export const AI_MODEL = "deepseek-flash";
export const AI_ENDPOINT = "https://api.deepseek.com/chat/completions";
const RESPONSE_LIMIT = 64_000;

function checkedKey(key: string) {
  if (
    typeof key !== "string" ||
    !/^sk-[A-Za-z0-9_-]{12,256}$/u.test(key.trim())
  ) {
    throw new AiClientError(
      "INVALID_KEY",
      "请输入有效格式的 DeepSeek API Key。",
    );
  }
  return key.trim();
}

async function boundedJson(
  response: Response,
  signal: AbortSignal,
  responseLimit = RESPONSE_LIMIT,
): Promise<unknown> {
  const declared = response.headers.get("Content-Length");
  if (declared && Number(declared) > responseLimit) {
    void response.body?.cancel().catch(() => undefined);
    throw new AiClientError(
      "RESPONSE_TOO_LARGE",
      "接口返回内容过长，已停止读取。",
    );
  }
  if (!response.body)
    throw new AiClientError("INVALID_JSON", "接口未返回有效 JSON 内容。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw new AiClientError("ABORTED", "已取消本次请求。");
    while (true) {
      const chunk = await reader.read();
      if (signal.aborted)
        throw new AiClientError("ABORTED", "已取消本次请求。");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > responseLimit) {
        cancel();
        throw new AiClientError(
          "RESPONSE_TOO_LARGE",
          "接口返回内容过长，已停止读取。",
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof AiClientError) throw error;
    throw new AiClientError(
      "INVALID_JSON",
      "接口返回的 JSON 无法读取，未生成解读。",
    );
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function httpError(status: number): AiClientError {
  if (status === 401 || status === 403)
    return new AiClientError(
      "AUTH",
      "密钥无效或当前账户没有调用权限，请检查 DeepSeek 账户。",
    );
  if (status === 402)
    return new AiClientError(
      "BALANCE",
      "DeepSeek 账户余额不足，请在官方控制台查看。",
    );
  if (status === 429)
    return new AiClientError(
      "RATE_LIMIT",
      "DeepSeek 调用频率或额度受限，请稍后手动重试。",
    );
  if (status >= 500)
    return new AiClientError(
      "SERVICE",
      "DeepSeek 服务暂时不可用，课盘和古籍仍可查看。",
    );
  return new AiClientError("HTTP", "接口拒绝了本次请求，未自动重试。");
}

async function completion(
  apiKey: string,
  messages: { role: string; content: string }[],
  timeout: number,
  maxTokens: number,
  signal?: AbortSignal,
  options?: { reasoningEffort?: "low"; responseLimit?: number },
): Promise<unknown> {
  const key = checkedKey(apiKey);
  if (signal?.aborted) throw new AiClientError("ABORTED", "已取消本次请求。");
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    rejectAbort = () =>
      reject(
        new AiClientError(
          timedOut ? "TIMEOUT" : "ABORTED",
          timedOut
            ? "请求等待超时；可能已产生调用费用，未自动重试。"
            : "已取消本次请求；已发出的调用仍可能产生费用。",
        ),
      );
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
  });
  const work = async () => {
    const response = await fetch(AI_ENDPOINT, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        response_format: { type: "json_object" },
        thinking: { type: options?.reasoningEffort ? "enabled" : "disabled" },
        ...(options?.reasoningEffort
          ? { reasoning_effort: options.reasoningEffort }
          : {}),
        max_tokens: maxTokens,
        temperature: 0.2,
        stream: false,
      }),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw httpError(response.status);
    }
    const envelope = await boundedJson(
      response,
      controller.signal,
      options?.responseLimit,
    );
    if (
      !isRecord(envelope) ||
      !Array.isArray(envelope.choices) ||
      envelope.choices.length !== 1 ||
      !isRecord(envelope.choices[0])
    )
      throw new AiClientError(
        "INVALID_RESPONSE",
        "接口返回结构不完整，未生成解读。",
      );
    const choice = envelope.choices[0];
    if (choice.finish_reason === "length")
      throw new AiClientError(
        "TRUNCATED",
        "答案超过输出上限而被截断，未当作完整解读展示。",
      );
    if (
      choice.finish_reason !== "stop" ||
      !isRecord(choice.message) ||
      choice.message.role !== "assistant" ||
      typeof choice.message.content !== "string" ||
      choice.message.refusal ||
      (choice.message.tool_calls != null &&
        (!Array.isArray(choice.message.tool_calls) ||
          choice.message.tool_calls.length > 0))
    )
      throw new AiClientError(
        "INVALID_RESPONSE",
        "接口未返回完整文本答案，未生成解读。",
      );
    try {
      return JSON.parse(choice.message.content) as unknown;
    } catch {
      throw new AiClientError(
        "INVALID_JSON",
        "模型答案不是完整 JSON，未自动修补或重试。",
      );
    }
  };
  try {
    const value = await Promise.race([work(), stopped]);
    if (controller.signal.aborted)
      throw new AiClientError(
        timedOut ? "TIMEOUT" : "ABORTED",
        "请求已结束，未展示迟到的回答。",
      );
    return value;
  } catch (error) {
    if (timedOut)
      throw new AiClientError(
        "TIMEOUT",
        "请求等待超时；可能已产生调用费用，未自动重试。",
      );
    if (signal?.aborted)
      throw new AiClientError(
        "ABORTED",
        "已取消本次请求；已发出的调用仍可能产生费用。",
      );
    if (error instanceof AiClientError) throw error;
    throw new AiClientError(
      "NETWORK",
      "未能连接 DeepSeek，请检查网络或浏览器跨域限制；未自动重试。",
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (rejectAbort)
      controller.signal.removeEventListener("abort", rejectAbort);
    signal?.removeEventListener("abort", abort);
  }
}

export async function requestIntent(
  request: IntentRequest,
): Promise<IntentAssessment> {
  validateQuestion(request.question, request.categoryChoice);
  const value = await completion(
    request.apiKey,
    createIntentMessages(request),
    15_000,
    1200,
    request.signal,
  );
  const result = normalizeIntentExtraction(
    value,
    request.question,
    request.categoryChoice,
  );
  if (result.source !== "model")
    throw new AiClientError(
      "INVALID_INTENT",
      "问题整理来源不符合预期，请手动确认。",
    );
  return result;
}

export async function requestInterpretation(
  request: InterpretationRequest,
): Promise<{ interpretation: InterpretationV2; meta: AiMeta }> {
  validateQuestion(request.question, request.intent.category);
  if (
    !isRecord(request.answers) ||
    Object.keys(request.answers).length > 2 ||
    Object.entries(request.answers).some(
      ([id, answer]) =>
        !CLARIFICATION_IDS.includes(id as (typeof CLARIFICATION_IDS)[number]) ||
        !validText(answer, 1, 500),
    )
  )
    throw new AiClientError(
      "INVALID_REQUEST",
      "问题澄清信息无效，请检查填写内容。",
    );
  validateIntent(
    request.intent,
    [request.question, ...Object.values(request.answers)].join("\n"),
    request.intent.category,
  );
  const value = await completion(
    request.apiKey,
    createInterpretationMessages(request),
    35_000,
    4096,
    request.signal,
  );
  return {
    interpretation: validateInterpretation(
      value,
      request.chart,
      request.evidence,
      request.assessments,
    ),
    meta: {
      model: AI_MODEL,
      promptVersion: INTERPRETATION_PROMPT_VERSION,
      intentVersion:
        request.intent.source === "local"
          ? "local-intent-v1.0.0"
          : INTENT_PROMPT_VERSION,
      engineVersion: request.chart.engineVersion,
      ruleVersion: request.chart.ruleVersion,
      corpusVersion: CORPUS_VERSION,
      generatedAt: new Date().toISOString(),
    },
  };
}

function checkedAnswers(value: unknown): Record<string, string> {
  if (
    !isRecord(value) ||
    Object.keys(value).length > 3 ||
    Object.entries(value).some(
      ([id, answer]) =>
        !CLARIFICATION_IDS.includes(id as (typeof CLARIFICATION_IDS)[number]) ||
        !validText(answer, 1, 500),
    )
  ) {
    throw new AiClientError(
      "INVALID_REQUEST",
      "问题澄清信息无效，请检查填写内容。",
    );
  }
  return Object.fromEntries(Object.entries(value)) as Record<string, string>;
}

/** One understanding request. Optional corrections retain their own answer provenance. */
export async function requestIntentV3(
  request: IntentRequest & { answers?: Record<string, string> },
): Promise<IntentAssessment> {
  validateQuestion(request.question, request.categoryChoice);
  const answers = checkedAnswers(request.answers ?? {});
  const value = await completion(
    request.apiKey,
    createIntentMessagesV3({ ...request, answers }),
    25_000,
    3500,
    request.signal,
  );
  const result = normalizeIntentV3Extraction(
    value,
    request.question,
    request.categoryChoice,
    answers,
  );
  if (result.source !== "model")
    throw new AiClientError(
      "INVALID_INTENT",
      "问题整理来源不符合预期，请手动确认。",
    );
  return result;
}

/** One reading request; failures never mutate the caller's stored report or trigger a retry. */
export async function requestReading(
  request: ReadingRequest,
): Promise<{ interpretation: InterpretationV3; meta: ReadingMeta }> {
  validateQuestion(request.question, request.intent.category);
  const answers = checkedAnswers(request.answers);
  if (
    typeof request.questionAskedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      request.questionAskedAt,
    ) ||
    !Number.isFinite(Date.parse(request.questionAskedAt)) ||
    (request.consultationMode !== undefined &&
      !["standard", "living", "reuse", "manual"].includes(
        request.consultationMode,
      ))
  ) {
    throw new AiClientError(
      "INVALID_REQUEST",
      "原问时间或续占方式无效，未开始解读。",
    );
  }
  const intent = validateIntent(
    request.intent,
    [request.question, ...Object.values(answers)].join("\n"),
    request.intent.category,
    { question: request.question, answers },
  );
  if (intent.status !== "ready")
    throw new AiClientError(
      "INVALID_INTENT",
      "请先确认当前所问事项，再生成解读。",
    );
  const context = validateReadingContext(request.context, request.chart);
  const value = await completion(
    request.apiKey,
    createReadingMessages({ ...request, intent, answers, context }),
    120_000,
    24_000,
    request.signal,
    { reasoningEffort: "low", responseLimit: 192_000 },
  );
  return {
    interpretation: validateReading(
      normalizeReadingResponse(value),
      context,
      request.chart,
    ),
    meta: {
      model: AI_MODEL,
      promptVersion: READING_PROMPT_VERSION,
      intentVersion:
        intent.source === "local" ? INTENT_VERSION : INTENT_PROMPT_VERSION_V3,
      engineVersion: request.chart.engineVersion,
      ruleVersion: request.chart.ruleVersion,
      corpusVersion: context.version,
      generatedAt: new Date().toISOString(),
      readingVersion: READING_VERSION,
      assessmentVersion: context.version,
      questionAskedAt: request.questionAskedAt,
    },
  };
}
