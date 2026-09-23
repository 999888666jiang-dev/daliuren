import type { Route } from "@playwright/test";
import { localIntent } from "../../src/ai/intent";
import type { ReadingAssessment } from "../../src/ai/reading-types";
export type Body = {
  messages: { role: string; content: string }[];
  max_tokens: number;
};
export const payload = (body: Body) =>
  JSON.parse(body.messages.at(-1)!.content);
export const isIntent = (body: Body) =>
  Object.hasOwn(payload(body), "categoryChoice");
export function intent(body: Body, clarify = false) {
  const data = payload(body);
  const understood = localIntent(data.question, data.categoryChoice);
  return {
    ...understood,
    coreQuestion: data.question.slice(0, 120),
    categoryReason: "隔离测试：问题涉及岗位信息。",
    clarifications: clarify
      ? [
          {
            id: "scope",
            question: "这次先核查哪一件事？",
            options: ["如何核查新岗位条件？", "如何安排出行？"],
          },
        ]
      : [],
    status: clarify ? "needs_clarification" : "ready",
    source: "model",
  };
}
export function interpretation(
  body: Body,
  summary = "隔离测试回答：按所引传统原则合看支持与限制。",
) {
  const data = payload(body);
  const met: ReadingAssessment[] = data.readingContext.assessments.filter(
    (item: ReadingAssessment) => item.status === "met",
  );
  const selected = [
    met.find((item) => item.kind === "principle") ?? met[0],
    ...met.filter((item) => item.kind === "judgement"),
  ].filter(
    (item, index, items) =>
      item && items.findIndex((other) => other?.id === item.id) === index,
  );
  // A fixture proves the reference graph and UI flow, not an actual model's interpretation.
  // Use supplied facts/clauses and retain every applicable judgement, including limits.
  const reasoning = selected.map((assessment, index) => ({
    id: `reason-${index + 1}`,
    stage: "conditions",
    title: `隔离测试推演 ${index + 1}`,
    literalMeaning: "测试仅说明所引条句的适用条件，原句由页面按引用展示。",
    application: "将已提供的盘面条件对应本次所问，并保留条文自身的适用限制。",
    contribution: "describes",
    factIds: [assessment.factIds[0]],
    assessmentIds: [assessment.id],
    clauseIds: assessment.clauseIds,
  }));
  return {
    summary,
    tendency: "undetermined",
    focus: [],
    reasoning,
    synthesis: {
      text: "隔离测试将全部已核条件合看，答案保持条件边界。",
      reasoningIds: reasoning.map((item) => item.id),
    },
    advice: [],
    limitations: ["隔离测试数据仅用于验证界面与引用关系。"],
  };
}
export async function reply(route: Route, answer: unknown) {
  await route
    .fulfill({
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization,content-type",
      },
      body: JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: JSON.stringify(answer) },
          },
        ],
      }),
    })
    .catch(() => undefined); // A deliberately cancelled browser request can no longer be fulfilled.
}
