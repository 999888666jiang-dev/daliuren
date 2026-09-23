import { describe, expect, it } from "vitest";
import { normalizeIntentExtraction } from "../src/ai/intent-normalization";
import { AiClientError, validateIntent } from "../src/ai/validation";
import { createIntentMessages, INTENT_SYSTEM_PROMPT } from "../src/ai/prompts";
import type { IntentAssessment } from "../src/ai/types";

const question = "我想问月底能收到货款吗？已经寄出合同。";
function example(): IntentAssessment {
  return {
    category: "business",
    coreQuestion: "月底收款是否能落实？",
    subject: "我",
    object: "货款",
    goal: "能收到货款吗",
    timeframe: "月底",
    background: ["已经寄出合同"],
    missingInformation: [],
    clarifications: [],
    categoryReason: "问题涉及收款。",
    status: "ready",
    source: "model",
  };
}

describe("conservative removal of model-generated non-verbatim spans", () => {
  it("keeps a fully literal extraction and never mutates the source object", () => {
    const raw = example();
    const original = structuredClone(raw);
    expect(normalizeIntentExtraction(raw, question, "auto")).toEqual(raw);
    expect(raw).toEqual(original);
  });
  it("removes unverified model information instead of replacing it with guessed details", () => {
    const raw = {
      ...example(),
      subject: "提问者",
      object: "客户的应收款",
      goal: "货款回收",
      timeframe: "2026年9月30日",
      background: ["已经寄出合同", "客户承诺按时打款"],
    };
    expect(() => validateIntent(raw, question, "auto")).toThrow(AiClientError);
    const result = normalizeIntentExtraction(raw, question, "auto");
    expect([
      result.subject,
      result.object,
      result.goal,
      result.timeframe,
    ]).toEqual([null, null, null, null]);
    expect(result.background).toEqual(["已经寄出合同"]);
    expect(result.missingInformation.join("")).toContain(
      "主体、对象、目标、时间范围、背景未能逐字对应",
    );
    expect(result.status).toBe("ready");
    expect(result.category).toBe("business");
    expect(result.coreQuestion).toBe(raw.coreQuestion);
    expect(JSON.stringify(result)).not.toContain("客户承诺按时打款");
    expect(validateIntent(result, question, "auto")).toEqual(result);
  });
  it("does not turn loosely spaced or reordered text into a verbatim quotation", () => {
    const result = normalizeIntentExtraction(
      { ...example(), goal: "收到 货款", timeframe: "本月底" },
      question,
      "business",
    );
    expect(result.goal).toBeNull();
    expect(result.timeframe).toBeNull();
  });
  it("keeps existing uncertainty and does not manufacture ready when one field is removed", () => {
    const raw: IntentAssessment = {
      ...example(),
      status: "needs_clarification",
      subject: "对方",
      clarifications: [
        { id: "object", question: "问哪一笔货款？", options: [] },
      ],
      missingInformation: ["尚未说明哪一笔货款。"],
    };
    const result = normalizeIntentExtraction(raw, question, "auto");
    expect(result.status).toBe("needs_clarification");
    expect(result.clarifications).toEqual(raw.clarifications);
    expect(result.missingInformation).toContain("尚未说明哪一笔货款。");
  });
  it.each([
    ["missing schema", { category: "business" }],
    ["extra field", { ...example(), debug: true }],
    ["object value", { ...example(), subject: { name: "我" } }],
    ["array value", { ...example(), goal: ["收款"] }],
    ["empty string", { ...example(), timeframe: "" }],
    ["too-long span", { ...example(), subject: "不".repeat(181) }],
    ["script markup", { ...example(), subject: "<script>" }],
    ["URL span", { ...example(), object: "https://example.com" }],
    ["wrong background type", { ...example(), background: "合同" }],
    ["background object", { ...example(), background: [{}] }],
    ["duplicate background", { ...example(), background: ["合同", "合同"] }],
    [
      "too many background entries",
      { ...example(), background: ["一", "二", "三", "四", "五"] },
    ],
    ["wrong source", { ...example(), source: "invented" }],
    ["wrong category", { ...example(), category: "unknown" }],
    ["wrong status", { ...example(), status: "done" }],
    [
      "missing uncertainty questions",
      { ...example(), status: "needs_clarification" },
    ],
    [
      "invalid clarification ID",
      {
        ...example(),
        status: "needs_clarification",
        clarifications: [{ id: "other", question: "问什么？", options: [] }],
      },
    ],
    [
      "unknown nested key",
      {
        ...example(),
        status: "needs_clarification",
        clarifications: [
          { id: "scope", question: "问什么？", options: [], secret: "x" },
        ],
      },
    ],
  ])("still rejects %s instead of repairing schema", (_, value) => {
    expect(() => normalizeIntentExtraction(value, question, "auto")).toThrow(
      AiClientError,
    );
  });
  it.each(["subject", "object", "goal", "timeframe", "background"])(
    "does not synthesize a missing %s schema key",
    (key) => {
      const value: Record<string, unknown> = { ...example() };
      delete value[key];
      expect(() => normalizeIntentExtraction(value, question, "auto")).toThrow(
        AiClientError,
      );
    },
  );
  it("preserves the explicit manual category contract", () => {
    expect(() =>
      normalizeIntentExtraction(
        { ...example(), goal: "收款成功" },
        question,
        "career",
      ),
    ).toThrow(AiClientError);
  });
  it("records a removal without silently dropping existing limitations", () => {
    const existing = ["事项一未知", "事项二未知", "事项三未知", "事项四未知"];
    const result = normalizeIntentExtraction(
      { ...example(), timeframe: "今年底", missingInformation: existing },
      question,
      "auto",
    );
    expect(result.missingInformation).toHaveLength(4);
    for (const note of existing)
      expect(result.missingInformation.join(" ")).toContain(note);
    expect(result.missingInformation.join(" ")).toContain("已保留为未知");
  });
  it("refuses a repair if its notice cannot fit without losing an existing limitation", () => {
    const missingInformation = ["甲", "乙", "丙", "丁"].map((s) =>
      s.repeat(120),
    );
    expect(() =>
      normalizeIntentExtraction(
        { ...example(), goal: "收款成功", missingInformation },
        question,
        "auto",
      ),
    ).toThrow(AiClientError);
  });
});

describe("intent-only prompt taxonomy and local hints", () => {
  it.each([
    ["我想了解实习的安排。", "career"],
    ["这次采购有什么需要核实的？", "business"],
    ["我在考虑卖房。", "business"],
    ["这个月搬家是否合适？", "travel"],
    ["猫走丢了能找回吗？", "lost"],
    ["我想问下周考试。", "general"],
  ])(
    "provides a local candidate for %s without declaring it model truth",
    (question, category) => {
      const messages = createIntentMessages({
        question,
        categoryChoice: "auto",
      });
      const data = JSON.parse(messages[1].content);
      expect(data.localCandidate.category).toBe(category);
      expect(data.question).toBe(question);
      expect(messages[0].content).toContain("仅供参考");
    },
  );
  it("distinguishes missing detail from an unclear topic and preserves manual choices", () => {
    expect(INTENT_SYSTEM_PROMPT).toContain("不能因此退回general");
    expect(INTENT_SYSTEM_PROMPT).toContain("直接ready且clarifications=[]");
    expect(INTENT_SYSTEM_PROMPT).toContain("不擅自换类");
  });
});
