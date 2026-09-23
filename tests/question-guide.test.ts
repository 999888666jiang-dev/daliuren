import { describe, expect, it } from "vitest";
import { cast, castManual } from "../src/core";
import { buildQuestionGuide } from "../src/components/QuestionGuide";
import { createInterpretationMessages } from "../src/ai/prompts";
import { localIntent } from "../src/ai/intent";
import { assessRules } from "../src/ai/assessments";
import { CORPUS_VERSION, selectEvidence } from "../src/data/evidence";
import {
  normalizeReport,
  serializeReport,
  type Report,
} from "../src/lib/report";
import type { InterpretationV2 } from "../src/ai/types";

const chart = cast({ datetime: "2026-01-02T20:30", timeBasis: "standard" });

describe("local question guide grounded in existing chart and reviewed rules", () => {
  it("gives different useful questions for different matters without recasting the shared chart", () => {
    const original = structuredClone(chart);
    const payment = buildQuestionGuide(chart, "月底能收到货款吗？", "business");
    const relationship = buildQuestionGuide(
      chart,
      "我和女友接下来如何沟通？",
      "relationship",
    );
    expect(payment.profile.title).toBe("货款与欠款");
    expect(payment.timeframe).toBe("月底");
    expect(payment.profile.actions.join(" ")).toContain("实际到账记录");
    expect(relationship.profile.actions.join(" ")).toContain("可拒绝");
    expect(relationship.profile.boundary).toContain("不能读取他人内心");
    expect(payment.facts).toEqual(relationship.facts);
    expect(chart).toEqual(original);
  });

  it("does not fabricate a deadline and separates pet searches from static lost objects", () => {
    const pet = buildQuestionGuide(
      chart,
      "我的猫走丢了，接下来怎样寻找？",
      "lost",
    );
    expect(pet.timeframe).toBeNull();
    expect(pet.profile.title).toBe("走失宠物");
    expect(pet.profile.boundary).toContain("不能定位宠物");
    expect(pet.profile.actions.join(" ")).toContain("最后目击点");
  });

  it.each([
    "我的猫项圈丢了，怎么寻找？",
    "我的宠物狗玩具不见了，能找回吗？",
    "我遛狗时手机丢了，应该怎么办？",
    "我找不到猫的牵引绳，怎么寻找？",
  ])(
    "does not infer a missing animal from a pet-related object: %s",
    (question) => {
      const guide = buildQuestionGuide(chart, question, "lost");
      expect(guide.profile.title).toBe("失物寻找");
      expect(guide.profile.actions.join(" ")).not.toContain("动物救助");
    },
  );

  it.each([
    "我的猫昨天晚上不见了，该怎么办？",
    "我想找回走丢的宠物狗。",
    "找不到我家的猫了。",
    "我家猫戴着项圈走丢了。",
  ])("still recognizes an explicitly missing pet: %s", (question) => {
    expect(buildQuestionGuide(chart, question, "lost").profile.title).toBe(
      "走失宠物",
    );
  });

  it("only treats explicitly asked exam topics as exams within the appropriate category", () => {
    expect(
      buildQuestionGuide(chart, "这次考编能通过吗？", "career").profile.title,
    ).toBe("考试与招录");
    expect(
      buildQuestionGuide(
        chart,
        "不问考试，只问这次面试后的新岗位安排",
        "career",
      ).profile.title,
    ).toBe("求职与事业");
    expect(
      buildQuestionGuide(chart, "我下周的期末考试怎么样？", "general").profile
        .title,
    ).toBe("考试与招录");
    expect(
      buildQuestionGuide(chart, "那件事会怎样？", "general").needsScope,
    ).toBe(true);
  });

  it("does not upgrade calculation procedures or unmet rules into judgements", () => {
    const procedural = castManual({
      dayStem: "庚",
      dayBranch: "子",
      monthGeneral: "子",
      hourBranch: "丑",
      daytime: true,
    });
    const guide = buildQuestionGuide(
      procedural,
      "新岗位条件如何核实？",
      "career",
    );
    expect(guide.matched).toEqual([]);
    expect(guide.evidence.some((record) => record.id === "daquan-zeike")).toBe(
      true,
    );
    expect(guide.facts.every((fact) => procedural.facts.includes(fact))).toBe(
      true,
    );
  });

  it("cites only met judgements backed by the actual selected verified evidence and retains filling limits", () => {
    const guide = buildQuestionGuide(chart, "新的工作机会如何确认？", "career");
    expect(guide.matched.some((item) => item.id === "bifa-031-void")).toBe(
      true,
    );
    for (const item of guide.matched) {
      expect(item.status).toBe("met");
      expect(item.kind).toBe("judgement");
      expect(
        item.evidenceIds.every((id) =>
          guide.evidence.some(
            (record) => record.id === id && record.verification === "verified",
          ),
        ),
      ).toBe(true);
    }
    expect(guide.matched.flatMap((item) => item.caveats).join(" ")).toContain(
      "年命填实未判",
    );
  });
});

describe("casting context in a question-specific AI request", () => {
  it("distinguishes the reused consultation from its original virtual hour without sending raw chart input", () => {
    const virtual = cast({
      datetime: "2026-01-02T20:30",
      timeBasis: "solar",
      longitude: 116.407395,
      latitude: 39.904211,
      castMode: "living",
      livingNumber: 1,
    });
    const question = "月底能收到货款吗？";
    const request = {
      question,
      chart: virtual,
      intent: localIntent(question, "business"),
      answers: {},
      evidence: selectEvidence(virtual, "business"),
      assessments: assessRules(virtual, "business"),
      consultationMode: "reuse" as const,
    };
    const messages = createInterpretationMessages(request);
    const payload = JSON.parse(messages[1].content);
    expect(payload.castingContext).toMatchObject({
      consultationMode: "reuse",
      originalCastMode: "living",
      realHourBranch: "戌",
      virtualHourBranch: "子",
      selectedHourBranch: "子",
      number: 1,
      daytime: false,
    });
    expect(payload.castingContext.dayNightBasis).toContain("不随报数改变");
    expect(messages[1].content).not.toContain("116.407395");
    expect(messages[1].content).not.toContain("39.904211");
    expect(payload).not.toHaveProperty("input");
    expect(messages[0].content).toContain("没有另起新课");
    expect(messages[0].content).toContain("实际到账");
  });
});

describe("honest modern analysis survives report persistence", () => {
  it("preserves explicitly empty citation arrays after serialization and restoration", () => {
    const interpretation: InterpretationV2 = {
      summary: "实际到账情况尚未确认，请先核对付款条件与双方记录。",
      observations: [
        {
          kind: "context",
          text: "付款承诺与到账记录需要分别核实。",
          factIds: [],
          evidenceIds: [],
          assessmentIds: [],
        },
      ],
      advice: ["先完成书面对账，再确认付款安排。"],
      missingInformation: ["约定的付款条件是什么？"],
      limitations: ["当前信息不足以判断精确到账日期。"],
    };
    const report: Report = {
      schemaVersion: 2,
      id: "empty-context-regression",
      categoryChoice: "business",
      question: "月底能收到货款吗？",
      category: "business",
      place: "未提供地点",
      createdAt: "2026-09-23T00:00:00.000Z",
      chart,
      evidenceSnapshot: selectEvidence(chart, "business"),
      corpusVersion: CORPUS_VERSION,
      assessments: assessRules(chart, "business"),
      interpretation,
    };
    const restored = normalizeReport(JSON.parse(serializeReport(report)))!;
    expect(restored.interpretation).toEqual(interpretation);
    expect(restored.warnings ?? []).not.toContain("解读内容未通过校验");
  });
});
