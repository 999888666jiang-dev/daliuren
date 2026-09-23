import { cast } from "../src/core";
import { localIntent } from "../src/ai/intent";
import type {
  InterpretationV3,
  ReadingContext,
  ReadingRequest,
} from "../src/ai/reading-types";

// Synthetic source language tests reference integrity, not the historical truth of an aphorism.
export function readingFixture() {
  const chart = cast({ datetime: "2026-01-02T20:30", timeBasis: "standard" });
  const context: ReadingContext = {
    version: "test-snapshot-v3",
    facts: structuredClone(chart.facts),
    sources: [
      {
        id: "test-source",
        title: "测试条文",
        quote: "测试原则甲；测试限制乙。",
        work: "测试资料",
        edition: "测试版本",
        volume: "测试卷",
        page: "测试页",
        sourceUrl: "https://example.org/source",
        imageUrl: "sources/test-source.jpg",
        verification: "verified",
        reviewNote: "仅作结构测试。",
        ruleIds: [],
        clauses: [
          { id: "test-principle", text: "测试原则甲" },
          { id: "test-limit", text: "测试限制乙" },
        ],
      },
    ],
    assessments: [
      {
        id: "principle",
        title: "测试一般原则",
        kind: "principle",
        status: "met",
        statement: "一般原则可以应用于已有盘面。",
        factIds: ["day", "transmission-1"],
        clauseIds: ["test-principle"],
        caveats: ["一般象义不是结果保证。"],
      },
      {
        id: "limit",
        title: "测试限制条件",
        kind: "judgement",
        status: "met",
        statement: "本次存在限制条件。",
        factIds: ["voids"],
        clauseIds: ["test-limit"],
        caveats: ["不能忽略此项限制。"],
      },
      {
        id: "unresolved",
        title: "测试未判条件",
        kind: "judgement",
        status: "unknown",
        statement: "未提供的条件无法确认。",
        factIds: [],
        clauseIds: [],
        caveats: ["尚不能确认年命填实。"],
      },
    ],
  };
  const interpretation: InterpretationV3 = {
    summary: "按本课所据传统象义，本次用餐安排有可取之处，也有需要保留的限制。",
    tendency: "mixed",
    focus: [
      {
        id: "focus",
        title: "本次取用",
        explanation: "本次按用餐安排取用，主体暂按本人理解。",
        factIds: ["day"],
        assessmentIds: ["principle"],
        clauseIds: ["test-principle"],
      },
    ],
    reasoning: [
      {
        id: "support",
        stage: "transmissions",
        title: "支持本次安排的因素",
        literalMeaning: "该原则解释已有条件间的支持关系。",
        application: "应用到用餐安排上，可理解为实施时有承接条件。",
        contribution: "supports",
        factIds: ["transmission-1"],
        assessmentIds: ["principle"],
        clauseIds: ["test-principle"],
      },
      {
        id: "condition",
        stage: "conditions",
        title: "需要保留的条件",
        literalMeaning: "该条要求把限制条件与支持因素合看。",
        application: "不能只凭有承接条件就把这次用餐断为全程顺利。",
        contribution: "limits",
        factIds: ["voids"],
        assessmentIds: ["limit"],
        clauseIds: ["test-limit"],
      },
    ],
    synthesis: {
      text: "支持和限制同时存在，因此把本次安排理解为有条件可行，并保留尚未判定的部分。",
      reasoningIds: ["support", "condition"],
    },
    advice: [],
    limitations: ["没有把传统象义当作实际结果保证。"],
  };
  const question = "晚上吃松林食堂怎么样？";
  const request: ReadingRequest = {
    apiKey: "sk-test-only-not-a-real-credential",
    question,
    questionAskedAt: "2026-01-02T12:30:00.000Z",
    chart,
    intent: localIntent(question, "general"),
    answers: {},
    context,
  };
  return { chart, context, interpretation, request };
}
