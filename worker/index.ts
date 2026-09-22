import { cast, ENGINE_VERSION, RULE_VERSION } from "../src/core/index";
import { CORPUS_VERSION, selectEvidence } from "../src/data/evidence";
import { authenticate, finish, reserve } from "./quota";
import { createMessages, PROMPT_VERSION } from "./prompt";
import {
  ApiError,
  type Env,
  type InterpretResponse,
  type Versions,
} from "./types";
import {
  isRecord,
  readBoundedJson,
  validateInterpretation,
  validateRequest,
} from "./validation";

const DEFAULT_MODEL = "deepseek-flash";
const UPSTREAM_TIMEOUT_MS = 25_000;

export function versions(env: Env): Versions {
  return {
    engineVersion: ENGINE_VERSION,
    ruleVersion: RULE_VERSION,
    corpusVersion: CORPUS_VERSION,
    promptVersion: PROMPT_VERSION,
    model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL,
  };
}

function originAllowed(
  origin: string | null,
  env: Env,
  requestUrl: URL,
): boolean {
  if (
    origin &&
    origin === env.ALLOWED_ORIGIN &&
    /^https:\/\/[^/]+$/u.test(origin)
  )
    return true;
  // Local browser origins are accepted only by a local Worker, never by a deployed endpoint.
  return (
    env.ALLOW_LOCAL_DEV === "true" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(requestUrl.hostname) &&
    !!origin &&
    /^http:\/\/(?:localhost|127\.0\.0\.1):(?:5173|4173)$/u.test(origin)
  );
}

function respond(
  value: unknown,
  status: number,
  origin: string | null,
  allowed: boolean,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
  if (origin && allowed) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(value), { status, headers });
}

function configured(env: Env): boolean {
  return (
    !!env.DB && !!env.DEEPSEEK_API_KEY?.trim() && env.AI_ENABLED !== "false"
  );
}

export async function handleRequest(
  request: Request,
  env: Env,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const allowed = originAllowed(origin, env, url);
  const meta = versions(env);
  const json = (value: unknown, status = 200) =>
    respond(value, status, origin, allowed);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      let status = configured(env) ? "ready" : "not_configured";
      if (configured(env)) {
        try {
          await env
            .DB!.prepare(
              "SELECT (SELECT COUNT(*) FROM invitations) AS invites, (SELECT COUNT(*) FROM ai_requests) AS requests",
            )
            .first();
        } catch {
          status = "storage_unavailable";
        }
      }
      return json({ configured: configured(env), status, versions: meta });
    }
    if (url.pathname !== "/api/interpret")
      throw new ApiError(404, "NOT_FOUND", "接口不存在。");
    if (!allowed)
      throw new ApiError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "此来源未获准调用解读服务。",
      );
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin!,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      });
    }
    if (request.method !== "POST")
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "请使用 POST 请求。");
    if (!configured(env))
      throw new ApiError(
        503,
        "NOT_CONFIGURED",
        "AI 解读服务尚未配置；课盘与古籍原文可继续使用。",
      );
    if (
      !/^application\/json(?:\s*;|$)/iu.test(
        request.headers.get("Content-Type") || "",
      )
    ) {
      throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "请发送 JSON 请求。");
    }
    const db = env.DB!;
    const inviteHash = await authenticate(
      db,
      request.headers.get("Authorization"),
    );
    let raw: unknown;
    try {
      raw = await readBoundedJson(request.body, 8192);
    } catch {
      throw new ApiError(400, "INVALID_REQUEST", "请求无效或超过 8 KB 限制。");
    }
    const input = validateRequest(raw);
    if (
      input.ruleVersion !== RULE_VERSION ||
      input.corpusVersion !== CORPUS_VERSION
    ) {
      throw new ApiError(
        409,
        "VERSION_MISMATCH",
        "页面与服务端规则版本不同，请刷新页面后重新起课。",
      );
    }
    let chart;
    try {
      chart = cast(input.input);
    } catch {
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "起课信息不符合当前规则，请检查时间和经纬度。",
      );
    }
    const evidence = selectEvidence(chart, input.category).filter(
      (item) => item.verification === "verified",
    );
    const reservation = await reserve(db, inviteHash);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      let result: Response;
      try {
        result = await upstream("https://api.deepseek.com/chat/completions", {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.DEEPSEEK_API_KEY!.trim()}`,
          },
          body: JSON.stringify({
            model: meta.model,
            messages: createMessages(input, chart, evidence),
            response_format: { type: "json_object" },
            thinking: { type: "disabled" },
            max_tokens: 2600,
            temperature: 0.2,
            stream: false,
          }),
        });
      } catch {
        if (controller.signal.aborted)
          throw new ApiError(
            504,
            "AI_TIMEOUT",
            "解读等待超时，请先查看课盘与古籍原文。",
          );
        throw new ApiError(
          502,
          "AI_UNAVAILABLE",
          "解读服务暂时不可用，请先查看课盘与古籍原文。",
        );
      }
      if (!result.ok) {
        await result.body?.cancel();
        throw new ApiError(
          502,
          "AI_UNAVAILABLE",
          "解读服务暂时不可用，请先查看课盘与古籍原文。",
        );
      }
      let envelope: unknown;
      try {
        envelope = await readBoundedJson(result.body, 48_000);
      } catch {
        if (controller.signal.aborted)
          throw new ApiError(
            504,
            "AI_TIMEOUT",
            "解读等待超时，请先查看课盘与古籍原文。",
          );
        throw new ApiError(
          502,
          "INVALID_AI_RESPONSE",
          "解读格式未通过校验，请以课盘与古籍原文为准。",
        );
      }
      const choice =
        isRecord(envelope) && Array.isArray(envelope.choices)
          ? envelope.choices[0]
          : null;
      if (
        !isRecord(choice) ||
        choice.finish_reason !== "stop" ||
        !isRecord(choice.message) ||
        choice.message.role !== "assistant" ||
        typeof choice.message.content !== "string" ||
        (choice.message.tool_calls != null &&
          (!Array.isArray(choice.message.tool_calls) ||
            choice.message.tool_calls.length > 0))
      ) {
        throw new ApiError(
          502,
          "INVALID_AI_RESPONSE",
          "解读未完整返回，请以课盘与古籍原文为准。",
        );
      }
      let generated: unknown;
      try {
        generated = JSON.parse(choice.message.content);
      } catch {
        throw new ApiError(
          502,
          "INVALID_AI_RESPONSE",
          "解读格式未通过校验，请以课盘与古籍原文为准。",
        );
      }
      const interpretation = validateInterpretation(generated, chart, evidence);
      const response: InterpretResponse = {
        chartId: chart.id,
        interpretation,
        meta,
      };
      return json(response);
    } finally {
      clearTimeout(timer);
      // Failure remains charged to the daily call limit; do not retry a possibly billed request.
      // If release fails, the short lease expires without storing any private content.
      await finish(db, reservation).catch(() => undefined);
    }
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(
            503,
            "SERVICE_UNAVAILABLE",
            "解读服务暂时不可用，课盘与古籍原文不受影响。",
          );
    // Never log incoming requests, authorizations, user questions or upstream response bodies.
    return json(
      { error: { code: apiError.code, message: apiError.message }, meta },
      apiError.status,
    );
  }
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
};
