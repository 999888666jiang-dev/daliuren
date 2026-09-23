import { describe, expect, it } from "vitest";
import { readingFixture } from "./reading-fixtures";
import {
  readingBoundaryNotes,
  validateReading,
  validateReadingContext,
} from "../src/ai/reading-validation";
import { AiClientError } from "../src/ai/validation";

describe("self-contained reading archive context", () => {
  it("projects a detached historical snapshot without consulting current corpus IDs", () => {
    const { context, chart } = readingFixture();
    const checked = validateReadingContext(context, chart);
    expect(checked).toEqual(context);
    expect(checked.facts[0]).not.toBe(context.facts[0]);
    checked.sources[0].clauses[0].text = "修改副本";
    expect(context.sources[0].clauses[0].text).toBe("测试原则甲");
  });

  it.each(["label", "value", "sourceIds"] as const)(
    "rejects changed original fact %s",
    (field) => {
      const { context, chart } = readingFixture();
      if (field === "sourceIds")
        context.facts[0].sourceIds.push("invented-source");
      else context.facts[0][field] = "已改写";
      expect(() => validateReadingContext(context, chart)).toThrow(
        AiClientError,
      );
    },
  );

  it.each([
    (c: ReturnType<typeof readingFixture>["context"]) => {
      c.sources[0].sourceUrl = "javascript:alert(1)";
    },
    (c: ReturnType<typeof readingFixture>["context"]) => {
      c.sources[0].sourceUrl = "https://user:password@example.org/";
    },
    (c: ReturnType<typeof readingFixture>["context"]) => {
      c.sources[0].imageUrl = "sources/../secret.jpg";
    },
    (c: ReturnType<typeof readingFixture>["context"]) => {
      c.sources[0].imageUrl = "https://example.org/track.jpg";
    },
    (c: ReturnType<typeof readingFixture>["context"]) => {
      c.sources[0].verification = "pending";
    },
    (c: ReturnType<typeof readingFixture>["context"]) => {
      c.sources[0].clauses[0].text = "未出现在原文中的句子";
    },
    (c: ReturnType<typeof readingFixture>["context"]) => {
      c.assessments[0].clauseIds = ["unknown-clause"];
    },
    (c: ReturnType<typeof readingFixture>["context"]) => {
      c.assessments[0].factIds = ["unknown-fact"];
    },
    (c: ReturnType<typeof readingFixture>["context"]) => {
      c.sources[0].clauses.push({ ...c.sources[0].clauses[0] });
    },
  ])("rejects unsafe or disconnected snapshot content %#", (change) => {
    const { context, chart } = readingFixture();
    change(context);
    expect(() => validateReadingContext(context, chart)).toThrow(AiClientError);
  });

  it("rejects extra fields at any snapshot level, including accidental credentials", () => {
    const { context, chart } = readingFixture();
    expect(() =>
      validateReadingContext({ ...context, apiKey: "do-not-persist" }, chart),
    ).toThrow();
    expect(() =>
      validateReadingContext(
        {
          ...context,
          sources: [{ ...context.sources[0], apiKey: "do-not-persist" }],
        },
        chart,
      ),
    ).toThrow();
  });
});

describe("traditional reasoning with closed references", () => {
  it("permits a principle-led qualitative judgement without requiring an old specific Bifa hit or generic advice", () => {
    const { interpretation, context, chart } = readingFixture();
    context.assessments = [context.assessments[0]];
    interpretation.reasoning = [interpretation.reasoning[0]];
    interpretation.tendency = "favorable";
    interpretation.synthesis.reasoningIds = ["support"];
    expect(validateReading(interpretation, context, chart)).toEqual(
      interpretation,
    );
    expect(validateReading(interpretation, context)).toEqual(interpretation);
  });

  it("keeps the original and snapshot intact on success and failure", () => {
    const { interpretation, context } = readingFixture();
    const before = JSON.stringify({ interpretation, context });
    validateReading(interpretation, context);
    expect(() =>
      validateReading(
        { ...interpretation, advice: ["not structured"] },
        context,
      ),
    ).toThrow();
    expect(JSON.stringify({ interpretation, context })).toBe(before);
  });

  it.each([
    (i: ReturnType<typeof readingFixture>["interpretation"]) => {
      i.reasoning[0].assessmentIds = ["unresolved"];
    },
    (i: ReturnType<typeof readingFixture>["interpretation"]) => {
      i.reasoning[0].factIds = ["voids"];
    },
    (i: ReturnType<typeof readingFixture>["interpretation"]) => {
      i.reasoning[0].clauseIds = ["test-limit"];
    },
    (i: ReturnType<typeof readingFixture>["interpretation"]) => {
      i.reasoning[0].id = i.focus[0].id;
    },
    (i: ReturnType<typeof readingFixture>["interpretation"]) => {
      i.reasoning.pop();
      i.synthesis.reasoningIds = ["support"];
    },
    (i: ReturnType<typeof readingFixture>["interpretation"]) => {
      i.synthesis.reasoningIds = ["support"];
    },
    (i: ReturnType<typeof readingFixture>["interpretation"]) => {
      i.advice = [
        {
          action: "确定今晚的安排。",
          purpose: "让安排与本次目标一致。",
          reasoningIds: ["focus"],
        },
      ];
    },
  ])("rejects missing or misapplied reasoning connections %#", (change) => {
    const { interpretation, context } = readingFixture();
    change(interpretation);
    expect(() => validateReading(interpretation, context)).toThrow(
      AiClientError,
    );
  });

  it("requires every clause of each cited assessment, including its conditional half", () => {
    const { interpretation, context } = readingFixture();
    context.assessments[0].clauseIds.push("test-limit");
    expect(() => validateReading(interpretation, context)).toThrow();
  });

  it("cannot hide an applicable judgement from synthesis by relabeling it as descriptive", () => {
    const { interpretation, context } = readingFixture();
    interpretation.reasoning[1].contribution = "describes";
    interpretation.synthesis.reasoningIds = ["support"];
    interpretation.tendency = "favorable";
    expect(() => validateReading(interpretation, context)).toThrow();
  });

  it("shows unknown and used caveats independently of model omissions", () => {
    const { context, interpretation } = readingFixture();
    expect(readingBoundaryNotes(context, interpretation)).toEqual([
      "一般象义不是结果保证。",
      "不能忽略此项限制。",
      "尚不能确认年命填实。",
    ]);
  });

  it.each([
    "有90%的机会",
    "这次必定成功",
    "这次很可能顺利",
    "古籍曰：测试原句",
    "《虚构典籍》认为本次可行",
    "本命已经填实",
    "对方正在欺骗你",
    "<script>bad</script>",
  ])("rejects unsupported model prose: %s", (text) => {
    const { interpretation, context } = readingFixture();
    interpretation.summary = text;
    expect(() => validateReading(interpretation, context)).toThrow(
      AiClientError,
    );
  });

  it("accepts an explicit limitation on probability and avoids treating it as a claim", () => {
    const { interpretation, context } = readingFixture();
    interpretation.limitations = ["不能把传统象义说成有90%的成功概率。"];
    expect(validateReading(interpretation, context).limitations).toEqual(
      interpretation.limitations,
    );
  });

  it("detects an invented transmission branch in both archive-only and live validation", () => {
    const { interpretation, context, chart } = readingFixture();
    const wrong = chart.transmissions[0].branch === "子" ? "午" : "子";
    interpretation.reasoning[0].application = `初传为${wrong}，说明本次安排有承接条件。`;
    expect(() => validateReading(interpretation, context)).toThrow();
    expect(() => validateReading(interpretation, context, chart)).toThrow();
  });

  it("does not let procedure-only material silently support a forecast", () => {
    const { interpretation, context } = readingFixture();
    context.assessments = [{ ...context.assessments[0], kind: "procedure" }];
    interpretation.focus = [];
    interpretation.reasoning = [
      {
        ...interpretation.reasoning[0],
        contribution: "describes",
        literalMeaning: "这条说明起盘的方法。",
        application: "本课据此确定取传次序。",
      },
    ];
    interpretation.synthesis = {
      text: "这些材料只能说明起盘方法。",
      reasoningIds: ["support"],
    };
    interpretation.summary = "现有条文只够解释起盘，无法形成吉凶倾向。";
    interpretation.tendency = "undetermined";
    expect(validateReading(interpretation, context)).toEqual(interpretation);
    interpretation.reasoning[0].literalMeaning =
      "该条说明取课顺序，不判断现实吉凶。";
    interpretation.reasoning[0].application =
      "本课据此排出三传，而非现实成败的断语。";
    expect(validateReading(interpretation, context)).toEqual(interpretation);
    interpretation.summary = "本次用餐偏顺。";
    expect(() => validateReading(interpretation, context)).toThrow();
    interpretation.summary = "现有条文只够解释起盘。";
    interpretation.tendency = "favorable";
    expect(() => validateReading(interpretation, context)).toThrow();
  });
});
