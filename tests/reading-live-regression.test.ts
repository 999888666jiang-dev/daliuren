import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { castManual } from "../src/core";
import type { ManualInput } from "../src/core/types";
import type { InterpretationV3 } from "../src/ai/reading-types";
import type { Category } from "../src/core/types";
import { buildReadingContext } from "../src/ai/reading-assessments";
import {
  normalizeReadingResponse,
  readingProseReviewNotes,
  validateReading,
} from "../src/ai/reading-validation";
import {
  READING_PROMPT_VERSION,
  READING_SYSTEM_PROMPT,
} from "../src/ai/prompts-reading";
import { readingFixture } from "./reading-fixtures";

// A recorded model response that was rejected on 2026-09-23. Only the answer and
// five manual plate inputs are retained; no request, credentials or location data.
const recorded = JSON.parse(
  readFileSync(
    new URL("./reading-live-rejected.fixture.json", import.meta.url),
    "utf8",
  ),
) as { manualInput: ManualInput; interpretation: InterpretationV3 };
const chart = castManual(recorded.manualInput);
const completed = JSON.parse(
  readFileSync(
    new URL("./reading-live-completed.fixture.json", import.meta.url),
    "utf8",
  ),
) as {
  manualInput: ManualInput;
  category: Category;
  interpretation: unknown;
}[];

describe("recorded live response and unsupported traditional shortcuts", () => {
  it.each(completed.map((example, index) => ({ ...example, index })))(
    "accepts complete recorded reading $index through the client normalization and strict validator",
    ({ manualInput, category, interpretation }) => {
      const savedChart = castManual(manualInput);
      const context = buildReadingContext(savedChart, category);
      const normalized = normalizeReadingResponse(interpretation);
      expect(validateReading(normalized, context, savedChart)).toEqual(
        normalized,
      );
    },
  );

  it("retains only final answers and minimal manual plate inputs in completed-response fixtures", () => {
    expect(JSON.stringify(completed)).not.toMatch(
      /sk-[A-Za-z0-9_-]{12,}|apiKey|Authorization|latitude|longitude|reasoning_content|prompt_tokens|completion_tokens/u,
    );
  });

  it.each(["不直接判定", "不直接说明", "不据此判断"])(
    "accepts the procedure boundary %s without admitting a positive fortune claim",
    (negation) => {
      const example = completed[2];
      const savedChart = castManual(example.manualInput);
      const context = buildReadingContext(savedChart, example.category);
      const reading = structuredClone(
        normalizeReadingResponse(example.interpretation),
      ) as InterpretationV3;
      const procedure = reading.reasoning[0];
      expect(procedure.application).toContain("不直接判定面试吉凶");
      procedure.application = procedure.application.replace(
        "不直接判定",
        negation,
      );
      expect(validateReading(reading, context, savedChart)).toEqual(reading);
      procedure.application = procedure.application.replace(
        negation,
        negation.slice(1),
      );
      expect(() => validateReading(reading, context, savedChart)).toThrow();
    },
  );

  it.each([
    "比和只是本次已算出的五行关系，不据此推延迟或动力不足。",
    "比和本身不能在没有额外适用条文和现实条件的情形下独立解释为延迟或动力不足。",
    "年命未填实未判：资料未提供年命及其填实情况，不能据此加强或削弱结论。",
    "年命未填实与否待核，不把它当作成立条件。",
  ])(
    "uses clause scope and unresolved propositions without a fixed character window: %s",
    (text) => {
      const { context, interpretation } = readingFixture();
      interpretation.limitations = [text];
      expect(validateReading(interpretation, context)).toEqual(interpretation);
    },
  );

  it.each([
    "比和不能单断好坏，但比和说明动力不足。",
    "年命填实尚未核定；年命未填实，所以本次延期。",
    "不能用空泛原则判断，然而比和表示推动不足。",
  ])(
    "ends a negation at a contrast or new clause instead of excusing a positive misuse: %s",
    (text) => {
      const { context, interpretation } = readingFixture();
      interpretation.limitations = [text];
      expect(() => validateReading(interpretation, context)).toThrow();
    },
  );

  it("keeps coordinated attribution for review without rejecting its valid references", () => {
    const example = completed[4];
    const savedChart = castManual(example.manualInput);
    const context = buildReadingContext(savedChart, example.category);
    const reading = normalizeReadingResponse(
      example.interpretation,
    ) as InterpretationV3;
    expect(validateReading(reading, context, savedChart)).toEqual(reading);
    expect(readingProseReviewNotes(reading).join(" ")).toContain("并列语句");
  });
  it("diagnoses the original broken reference: hour is outside the combined-condition assessment", () => {
    const context = buildReadingContext(chart, "business");
    const line = recorded.interpretation.reasoning.find(
      (item) => item.id === "reason-7",
    )!;
    const allowed = new Set(
      context.assessments
        .filter((item) => line.assessmentIds.includes(item.id))
        .flatMap((item) => item.factIds),
    );
    expect(line.factIds.filter((id) => !allowed.has(id))).toEqual(["hour"]);
    expect(() =>
      validateReading(recorded.interpretation, context, chart),
    ).toThrow();
  });

  it("a stage framework alone cannot contribute a delay or obstacle", () => {
    const context = buildReadingContext(chart, "business");
    context.assessments = context.assessments.filter(
      (item) => item.id === "principle-three-stages",
    );
    const stage = structuredClone(recorded.interpretation.reasoning[0]);
    const reading: InterpretationV3 = {
      summary: "这里仅按三传次序组织本问分析。",
      tendency: "undetermined",
      focus: [],
      reasoning: [stage],
      synthesis: {
        text: "所引条句说明分析次序，不能独立形成方向或应期。",
        reasoningIds: [stage.id],
      },
      advice: [],
      limitations: [],
    };
    expect(stage.contribution).toBe("limits");
    expect(() => validateReading(reading, context, chart)).toThrow();
    stage.contribution = "describes";
    expect(() => validateReading(reading, context, chart)).toThrow();
    stage.title = "三传的分析次序";
    stage.application =
      "本次按初、中、末传组织发端、转移和收束的分析；该排列不判断具体进度。";
    expect(validateReading(reading, context, chart)).toEqual(reading);
  });

  it.each(["reason-3", "reason-7"])(
    "still rejects %s's unsupported prose after replacing its citations with valid ones",
    (id) => {
      const line = structuredClone(
        recorded.interpretation.reasoning.find((item) => item.id === id)!,
      );
      const context = buildReadingContext(chart, "business");
      context.assessments = context.assessments.filter((item) =>
        line.assessmentIds.includes(item.id),
      );
      const allowed = new Set(
        context.assessments.flatMap((item) => item.factIds),
      );
      line.factIds = line.factIds.filter((fact) => allowed.has(fact));
      const reading: InterpretationV3 = {
        summary: "按所引条目检查本次问题。",
        tendency: "undetermined",
        focus: [],
        reasoning: [line],
        synthesis: {
          text: "合看所列材料并保留适用条件。",
          reasoningIds: [line.id],
        },
        advice: [],
        limitations: [],
      };
      expect(() => validateReading(reading, context, chart)).toThrow();
    },
  );

  it.each([
    "比和表示推动不足，因此本问延迟。",
    "中末同五行，所以力量转为平缓。",
    "三传由生转比，后段推动力减弱。",
    "没有支持证据，所以本问偏阻。",
    "不见生扶，因此本次难成。",
    "占时巳属旬空，故今天的事项落空。",
    "年命未填实，不能据本课断定具体到账日。",
  ])(
    "rejects unsupported inference even with an intact reference graph: %s",
    (text) => {
      const { context, interpretation } = readingFixture();
      interpretation.reasoning[0].application = text;
      expect(() => validateReading(interpretation, context)).toThrow();
    },
  );

  it.each([
    "比和本身不意味着推动不足，不能据此推出延迟。",
    "缺少支持证据并不等于不利。",
    "不能将占时时支旬空解读为今天落空。",
    "年命填实尚未核定，保留为未判条件。",
    "占时巳时属旬空，但本轮没有针对占时的断法，不能用来判断当天结果。",
    "占时巳虽属旬空，但未提供针对占时的已核断法，本解读不据此推断今日落空或不到账。",
  ])("accepts an accurately phrased limit: %s", (text) => {
    const { context, interpretation } = readingFixture();
    interpretation.limitations = [text];
    expect(validateReading(interpretation, context).limitations).toEqual([
      text,
    ]);
  });

  it("records the prompt change without changing the response schema or giving the model made-up quotations", () => {
    expect(READING_PROMPT_VERSION).toBe("traditional-reading-v3.0.5");
    for (const principle of [
      "单独引用时contribution必须describes",
      "证据不足只能限定能判断的范围",
      "先删掉hour引用",
      "现实承诺有事实根据",
      "年命填实未判",
      "原始课盘是冻结记录",
    ])
      expect(READING_SYSTEM_PROMPT).toContain(principle);
    expect(JSON.stringify(recorded)).not.toMatch(
      /sk-[A-Za-z0-9_-]{12,}|apiKey|Authorization|latitude|longitude/u,
    );
  });

  it.each([
    "中传酉金与日干庚金同五行，末传申金与日干庚金同五行，均为比和关系。",
    "旬空为辰、巳；本次实际分析的三传戌、酉、申均不属旬空。",
  ])(
    "keeps specific plate facts out of the original-clause translation: %s",
    (text) => {
      const { context, interpretation } = readingFixture();
      interpretation.reasoning[0].literalMeaning = text;
      expect(() => validateReading(interpretation, context)).toThrow();
    },
  );

  it("does not transfer the contract image from Tiankong to Xuanwu", () => {
    const context = buildReadingContext(chart, "business");
    const assessment = context.assessments.find(
      (item) => item.id === "principle-cuiyan-general-xuanwu",
    )!;
    context.assessments = [assessment];
    const reading: InterpretationV3 = {
      summary: "按所引条句整理所问。",
      tendency: "undetermined",
      focus: [],
      reasoning: [
        {
          id: "reason-1",
          stage: "generals",
          title: "初传玄武提示约契虚诈之象",
          literalMeaning: "玄武的摘句涉及亡失与争执等类象。",
          application: "按其所指范围核对本问的象义联系。",
          contribution: "describes",
          factIds: [assessment.factIds[0]],
          assessmentIds: [assessment.id],
          clauseIds: assessment.clauseIds,
        },
      ],
      synthesis: {
        text: "这类象不指认现实人物的行为。",
        reasoningIds: ["reason-1"],
      },
      advice: [],
      limitations: [],
    };
    expect(() => validateReading(reading, context, chart)).toThrow();
    reading.reasoning[0].title = "玄武条句的取象范围";
    reading.limitations = ["玄武原文没有约契，不能串用其他天将的原句。"];
    expect(validateReading(reading, context, chart)).toEqual(reading);
  });

  it.each([
    "天空、玄武类象提示约契与款项信息可能有虚而不实或暗昧之处。",
    "玄武与天空涉及约契和暗昧。",
  ])(
    "allows a joint paraphrase only when the supplied Tiankong clause contains the contract image: %s",
    (text) => {
      const context = buildReadingContext(chart, "business");
      const reading = structuredClone(
        normalizeReadingResponse(completed[0].interpretation),
      ) as InterpretationV3;
      reading.advice[0].purpose = text;
      expect(validateReading(reading, context, chart)).toEqual(reading);
      context.sources.find(
        (source) => source.id === "cuiyan-general-tiankong",
      )!.quote = "没有合约类象的测试原文";
      // A source cannot claim clauses outside its quote; replacing both gives a
      // structurally valid snapshot that genuinely lacks the licensed image.
      context.sources.find(
        (source) => source.id === "cuiyan-general-tiankong",
      )!.clauses[0].text = "没有合约类象的测试原文";
      expect(() => validateReading(reading, context, chart)).toThrow();
    },
  );

  it("archive validation stays strict even when the client recognizes a lossless provider variant", () => {
    const { context, interpretation } = readingFixture();
    const flattened = {
      ...interpretation,
      synthesis: interpretation.synthesis.text,
      reasoningIds: interpretation.synthesis.reasoningIds,
    };
    expect(() => validateReading(flattened, context)).toThrow();
    expect(
      validateReading(normalizeReadingResponse(flattened), context),
    ).toEqual(interpretation);
  });

  it("does not reject ordinary framing words in an otherwise valid clause translation", () => {
    const { context, interpretation } = readingFixture();
    interpretation.reasoning[0].literalMeaning =
      "本次引用的原则要求将支持因素和限制条件一并考虑。";
    expect(validateReading(interpretation, context)).toEqual(interpretation);
  });
});
