import { describe, expect, it } from "vitest";
import { cast, castManual } from "../src/core";
import { selectEvidence } from "../src/data/evidence";
import type {
  IntentAssessment,
  InterpretationV2,
  RuleAssessment,
} from "../src/ai/types";
import {
  AiClientError,
  CATEGORIES,
  validateIntent,
  validateInterpretation,
} from "../src/ai/validation";
import { localIntent, resolveIntent } from "../src/ai/intent";
import { assessRules } from "../src/ai/assessments";
import liveFailure from "./fixtures/live-interpretation-failure-2.json";
import uncitedContext from "./fixtures/live-interpretation-uncited-context.json";
import unsupportedProbability from "./fixtures/live-interpretation-unsupported-probability.json";

const question = "我想在下个月核查新的工作机会，如何确认岗位条件？";
const chart = cast({
  datetime: "2026-01-02T20:30",
  timeBasis: "solar",
  longitude: 116.407395,
});
const evidence = selectEvidence(chart, "career");
const ruleEvidence = evidence.find((item) =>
  item.ruleIds.includes(chart.method.name),
)!;
const assessments: RuleAssessment[] = [
  {
    id: "procedure-transmissions",
    title: "取传",
    kind: "procedure",
    status: "met",
    statement: chart.method.detail,
    factIds: ["method", "transmission-1", "transmission-2", "transmission-3"],
    evidenceIds: [ruleEvidence.id],
    caveats: ["排盘不等于判断"],
    missingInputs: [],
  },
  {
    id: "bifa-031-void",
    title: "递生遇空",
    kind: "judgement",
    status: "met",
    statement: "相生链遇旬空；年命填实未判",
    factIds: ["transmission-1", "transmission-2", "transmission-3", "voids"],
    evidenceIds: ["bifa-031-void"],
    caveats: ["不能断必败"],
    missingInputs: ["年命填实未判"],
  },
];
function intent(): IntentAssessment {
  return {
    category: "career",
    coreQuestion: "如何核查新岗位条件？",
    subject: "我",
    object: "新的工作机会",
    goal: "核查新的工作机会",
    timeframe: "下个月",
    background: [],
    missingInformation: [],
    clarifications: [],
    categoryReason: "问题关于新的工作机会",
    status: "ready",
    source: "model",
  };
}
function answer(): InterpretationV2 {
  return {
    summary: "可先核查岗位条件，传统结构不能保证现实结果。",
    observations: [
      {
        kind: "traditional",
        text: "三传递生遇空，落实程度仍需核查，不能据此断定事情必败。",
        factIds: ["transmission-1", "voids"],
        evidenceIds: ["bifa-031-void"],
        assessmentIds: ["bifa-031-void"],
      },
    ],
    advice: ["向对方索取岗位职责和书面条件。"],
    missingInformation: ["目前是否已有正式邀约？"],
    limitations: ["年命填实未判；实际结果仍取决于现实条件。"],
  };
}
const clone = <T>(item: T): T => structuredClone(item);

describe("intent extraction validation", () => {
  it.each(CATEGORIES)(
    "accepts explicit %s without inventing dates or people",
    (category) => {
      expect(
        validateIntent({ ...intent(), category }, question, category).category,
      ).toBe(category);
    },
  );
  it("allows ordinary Chinese quotation marks, null unknowns and local source", () => {
    expect(
      validateIntent(
        {
          ...intent(),
          subject: null,
          coreQuestion: "如何判断“机会”的实际条件？",
          source: "local",
        },
        question,
        "auto",
      ).source,
    ).toBe("local");
  });
  it("accepts at most two real clarification questions", () => {
    const item = {
      ...intent(),
      status: "needs_clarification",
      clarifications: [
        {
          id: "scope",
          question: "主要想核查哪方面？",
          options: ["岗位职责", "待遇条件"],
        },
      ],
    };
    expect(validateIntent(item, question, "auto").clarifications).toHaveLength(
      1,
    );
  });
  it.each([
    "我下个月能否找到新工作？",
    "我们关系怎么样？",
    "工作会顺利吗？感情会复合吗？明天出行顺利吗？钱包能找到吗？",
    "我想核查这个岗位的信息，" + "现有背景。".repeat(55),
    "请帮我看看这件事情？",
  ])("accepts the actual local fallback: %s", (text) => {
    const actual = localIntent(text, "auto");
    expect(validateIntent(actual, text, "auto")).toEqual(actual);
  });
  it("accepts actual resolved object information supplied by the user", () => {
    const text = "请帮我看看这件事情？";
    const answers = { object: "下个月面试的新岗位是否适合我？" };
    const actual = resolveIntent(localIntent(text, "auto"), answers);
    expect(
      validateIntent(
        actual,
        [text, ...Object.values(answers)].join("\n"),
        "auto",
      ),
    ).toEqual(actual);
  });
  it.each([
    ["made-up person", { subject: "王先生" }],
    ["made-up timeframe", { timeframe: "2027年春节" }],
    ["made-up background", { background: ["已经签约"] }],
    ["silent category change", { category: "relationship" }],
    [
      "ready with questions",
      { clarifications: [{ id: "q", question: "确认？", options: [] }] },
    ],
    ["needs clarification without question", { status: "needs_clarification" }],
    ["extra field", { apiKey: "do-not-accept" }],
    ["invalid source", { source: "verified" }],
    [
      "duplicate question ids",
      {
        status: "needs_clarification",
        clarifications: [
          { id: "x", question: "问题一？", options: [] },
          { id: "x", question: "问题二？", options: [] },
        ],
      },
    ],
    [
      "single non-choice option",
      {
        status: "needs_clarification",
        clarifications: [{ id: "q", question: "确认？", options: ["确定"] }],
      },
    ],
  ])("rejects %s", (_, patch) => {
    expect(() =>
      validateIntent({ ...intent(), ...(patch as object) }, question, "career"),
    ).toThrow(AiClientError);
  });
});

describe("V2 interpretation proof and prose validation", () => {
  it("accepts actual matched evidence with scope caveats and Chinese punctuation", () => {
    const item = answer();
    item.advice = ["请对方说明“岗位条件”的具体含义。"];
    expect(validateInterpretation(item, chart, evidence, assessments)).toEqual(
      item,
    );
  });
  it("allows modern context without pretending to cite ancient evidence", () => {
    const item = answer();
    item.observations = [
      {
        kind: "context",
        text: "可以先核查书面条件，避免仅凭口头表态做决定。",
        factIds: ["method"],
        evidenceIds: [],
        assessmentIds: [],
      },
    ];
    expect(
      validateInterpretation(item, chart, evidence, assessments).observations[0]
        .kind,
    ).toBe("context");
  });
  it("allows grounded modern context with all three ID arrays explicitly empty", () => {
    const item = answer();
    item.observations = [
      {
        kind: "context",
        text: "已有面试邀请是现实中的初步反馈，下一步可核查岗位要求。",
        factIds: [],
        evidenceIds: [],
        assessmentIds: [],
      },
    ];
    expect(
      validateInterpretation(item, chart, evidence, assessments).observations[0]
        .factIds,
    ).toEqual([]);
  });
  it("allows a procedure only to describe the actual calculation", () => {
    const item = answer();
    item.observations = [
      {
        kind: "traditional",
        text: `本课以${chart.method.name}取传，初传为${chart.transmissions[0].branch}。`,
        factIds: ["method", "transmission-1"],
        evidenceIds: [ruleEvidence.id],
        assessmentIds: ["procedure-transmissions"],
      },
    ];
    expect(
      validateInterpretation(item, chart, evidence, assessments).observations,
    ).toHaveLength(1);
  });
  const invalidCases: [string, (item: any) => void][] = [
    ["invented fact", (a) => (a.observations[0].factIds = ["made-up"])],
    [
      "invented evidence",
      (a) => (a.observations[0].evidenceIds = ["bifa-999"]),
    ],
    [
      "invented assessment",
      (a) => (a.observations[0].assessmentIds = ["made-up"]),
    ],
    ["missing fact", (a) => (a.observations[0].factIds = [])],
    ["missing assessment", (a) => (a.observations[0].assessmentIds = [])],
    ["missing evidence", (a) => (a.observations[0].evidenceIds = [])],
    ["duplicate fact", (a) => (a.observations[0].factIds = ["voids", "voids"])],
    [
      "legal but unrelated fact",
      (a) => (a.observations[0].factIds = ["month-general"]),
    ],
    [
      "legal but unrelated reference",
      (a) => (a.observations[0].evidenceIds = [ruleEvidence.id]),
    ],
    [
      "known but wrong assessment",
      (a) => (a.observations[0].assessmentIds = ["procedure-transmissions"]),
    ],
    ["made-up quote field", (a) => (a.observations[0].quote = "伪造原文")],
    ["top-level extra field", (a) => (a.sourceUrl = "fake")],
    ["definite failure", (a) => (a.observations[0].text = "此事必败。")],
    ["definite success in summary", (a) => (a.summary = "你一定成功。")],
    [
      "false promise after negation",
      (a) => (a.summary = "不能保证失败，但一定成功。"),
    ],
    ["invented quote in prose", (a) => (a.summary = "古籍曰：今日必成。")],
    ["HTML", (a) => (a.advice = ["<script>alert(1)</script>"])],
    ["URL", (a) => (a.advice = ["前往https://example.invalid输入信息"])],
    ["bad list member", (a) => (a.advice = [{ text: "not a string" }])],
    ["empty limitations", (a) => (a.limitations = [])],
    [
      "too many observations",
      (a) =>
        (a.observations = Array.from({ length: 6 }, () =>
          clone(a.observations[0]),
        )),
    ],
    ["overlong summary", (a) => (a.summary = "长".repeat(221))],
    [
      "unproved natal fill",
      (a) => (a.observations[0].text = "年命已经填实，所以不必考虑空亡。"),
    ],
    [
      "wrong transmission",
      (a) =>
        (a.observations[0].text = `初传为${chart.transmissions[0].branch === "子" ? "丑" : "子"}。`),
    ],
    [
      "wrong day",
      (a) =>
        (a.summary = `日柱为${chart.day.stem + chart.day.branch === "甲子" ? "乙丑" : "甲子"}。`),
    ],
    [
      "wrong method",
      (a) =>
        (a.summary = `本课采用${chart.method.name === "伏吟" ? "返吟" : "伏吟"}。`),
    ],
    [
      "wrong judgement with legal IDs",
      (a) => (a.observations[0].text = "三传互克，形成连环克。"),
    ],
    [
      "unsupported judgement hidden in summary",
      (a) => (a.summary = "三传互克的条件成立。"),
    ],
    [
      "unsupported judgement hidden in advice",
      (a) => (a.advice = ["因空上乘空，请放弃机会。"]),
    ],
    ["context carrying citations", (a) => (a.observations[0].kind = "context")],
    ["null observation", (a) => (a.observations[0] = null)],
    ["bad ID array", (a) => (a.observations[0].factIds = "voids")],
  ];
  it.each(invalidCases)("rejects %s", (_, mutate) => {
    const item = answer();
    mutate(item);
    expect(() =>
      validateInterpretation(item, chart, evidence, assessments),
    ).toThrow(AiClientError);
  });
  it.each(["unknown", "not_met", "not_applicable"] as const)(
    "rejects positive reliance on %s even with existing IDs",
    (status) => {
      const changed = assessments.map((item) =>
        item.id === "bifa-031-void" ? { ...item, status } : item,
      );
      expect(() =>
        validateInterpretation(answer(), chart, evidence, changed),
      ).toThrow(AiClientError);
    },
  );
  it("rejects procedure used as fortune judgement", () => {
    const item = answer();
    item.observations = [
      {
        kind: "traditional",
        text: "此取传过程预示事业顺利。",
        factIds: ["method"],
        evidenceIds: [ruleEvidence.id],
        assessmentIds: ["procedure-transmissions"],
      },
    ];
    expect(() =>
      validateInterpretation(item, chart, evidence, assessments),
    ).toThrow(AiClientError);
  });
  it.each([
    "取传法不能推出成功，但预示事业顺利。",
    "寄宫不能推断吉凶，因此能说明感情会成功。",
  ])(
    "does not let a preceding disclaimer conceal a positive procedural judgement: %s",
    (text) => {
      const item = answer();
      item.observations = [
        {
          kind: "traditional",
          text,
          factIds: ["method"],
          evidenceIds: [ruleEvidence.id],
          assessmentIds: ["procedure-transmissions"],
        },
      ];
      expect(() =>
        validateInterpretation(item, chart, evidence, assessments),
      ).toThrow(AiClientError);
    },
  );
  it("rejects pending references regardless of matching ids", () => {
    expect(() =>
      validateInterpretation(
        answer(),
        chart,
        evidence.map((item) => ({ ...item, verification: "pending" as const })),
        assessments,
      ),
    ).toThrow(AiClientError);
  });
  it("validates with actual deterministic rule assessments, not just fixture flags", () => {
    const real = assessRules(chart, "career");
    expect(real.find((item) => item.id === "bifa-031-void")?.status).toBe(
      "met",
    );
    expect(validateInterpretation(answer(), chart, evidence, real)).toEqual(
      answer(),
    );
  });
  it("enforces a total prose budget, not just independent section lengths", () => {
    const item = answer();
    item.summary = "概".repeat(220);
    item.observations = Array.from({ length: 5 }, () => ({
      ...clone(item.observations[0]),
      text: "观".repeat(220),
    }));
    item.advice = [
      "甲".repeat(120),
      "乙".repeat(120),
      "丙".repeat(120),
      "丁".repeat(120),
    ];
    expect(() =>
      validateInterpretation(item, chart, evidence, assessments),
    ).toThrow(AiClientError);
  });
});

describe("regressions from a sanitized real response to a synthetic career question", () => {
  const realChart = castManual({
    dayStem: "庚",
    dayBranch: "子",
    monthGeneral: "子",
    hourBranch: "丑",
    daytime: true,
  });
  const realEvidence = selectEvidence(realChart, "career");
  const realAssessments = assessRules(realChart, "career");
  it("reconstructs the same plate and keeps the original bad response rejected", () => {
    expect(realChart.method.name).toBe("贼克");
    expect(realChart.transmissions.map((item) => item.branch)).toEqual([
      "戌",
      "酉",
      "申",
    ]);
    expect(() =>
      validateInterpretation(
        liveFailure,
        realChart,
        realEvidence,
        realAssessments,
      ),
    ).toThrow(AiClientError);
  });
  it.each([0, 1])(
    "accepts actual correct procedure %s including its negative scope statement",
    (index) => {
      const item = {
        ...liveFailure,
        observations: [liveFailure.observations[index]],
      };
      expect(
        validateInterpretation(item, realChart, realEvidence, realAssessments)
          .observations,
      ).toHaveLength(1);
    },
  );
  it.each([2, 3])(
    "still rejects actual not-met rule citation %s even when stated negatively",
    (index) => {
      const item = {
        ...liveFailure,
        observations: [liveFailure.observations[index]],
      };
      expect(() =>
        validateInterpretation(item, realChart, realEvidence, realAssessments),
      ).toThrow(AiClientError);
    },
  );
  it("does not silently fill the missing context arrays", () => {
    const item = {
      ...liveFailure,
      observations: [liveFailure.observations[4]],
    };
    expect(() =>
      validateInterpretation(item, realChart, realEvidence, realAssessments),
    ).toThrow(AiClientError);
  });
  it("accepts the independently corrected response, without attaching unrelated chart facts to career advice", () => {
    const item = {
      ...liveFailure,
      observations: [
        liveFailure.observations[0],
        liveFailure.observations[1],
        {
          ...liveFailure.observations[4],
          factIds: [],
          evidenceIds: [],
          assessmentIds: [],
        },
      ],
    };
    expect(
      validateInterpretation(item, realChart, realEvidence, realAssessments)
        .observations,
    ).toHaveLength(3);
  });
});

describe("scope assertions remain checked outside traditional observations", () => {
  const proseLocations = [
    "summary",
    "context",
    "advice",
    "missingInformation",
    "limitations",
  ] as const;
  function withProse(location: (typeof proseLocations)[number], text: string) {
    const value = answer();
    value.observations = [
      {
        kind: "context",
        text: "请先核实岗位条件。",
        factIds: [],
        evidenceIds: [],
        assessmentIds: [],
      },
    ];
    if (location === "context") value.observations[0].text = text;
    else if (location === "summary") value.summary = text;
    else value[location] = [text];
    return value;
  }
  it.each(proseLocations)(
    "rejects unproved natal filling in %s",
    (location) => {
      expect(() =>
        validateInterpretation(
          withProse(location, "年命已经填实，所以不必考虑空亡。"),
          chart,
          evidence,
          assessments,
        ),
      ).toThrow(AiClientError);
    },
  );
  it.each(proseLocations)(
    "rejects ancient attribution in %s without banning ordinary quotation marks",
    (location) => {
      expect(() =>
        validateInterpretation(
          withProse(location, "《六壬大全》有言：逢此课求职皆得贵人。"),
          chart,
          evidence,
          assessments,
        ),
      ).toThrow(AiClientError);
      expect(() =>
        validateInterpretation(
          withProse(location, "应先核实“岗位条件”的具体含义。"),
          chart,
          evidence,
          assessments,
        ),
      ).not.toThrow();
    },
  );
  it.each(proseLocations)(
    "rejects an accusation in %s even with no explicit ancient reference",
    (location) => {
      expect(() =>
        validateInterpretation(
          withProse(location, "你的直属领导在欺骗你。"),
          chart,
          evidence,
          assessments,
        ),
      ).toThrow(AiClientError);
    },
  );
  it("rejects identifying a deceiver despite valid met bifa-032 citations", () => {
    const actualChart = castManual({
      dayStem: "丙",
      dayBranch: "寅",
      monthGeneral: "未",
      hourBranch: "子",
      daytime: true,
    });
    const actualAssessments = assessRules(actualChart, "career");
    const actualRule = actualAssessments.find((a) => a.id === "bifa-032")!;
    expect(actualRule.status).toBe("met");
    const value = answer();
    value.observations = [
      {
        kind: "traditional",
        text: "三传互克表明你的直属领导在欺骗你。",
        factIds: actualRule.factIds,
        evidenceIds: actualRule.evidenceIds,
        assessmentIds: [actualRule.id],
      },
    ];
    expect(() =>
      validateInterpretation(
        value,
        actualChart,
        selectEvidence(actualChart, "career"),
        actualAssessments,
      ),
    ).toThrow(AiClientError);
  });
  it.each([
    "不能认定年命已经填实。",
    "无法确认年命填实成立。",
    "提供本命不代表年命已经填实。",
    "不能由课盘断定你的直属领导在欺骗你。",
    "无法证明对方在欺骗你。",
    "互克不代表有人欺骗你。",
    "请核实对方是否欺骗你。",
    "若对方欺骗你，应先核查书面记录。",
  ])("preserves a negative or explicitly conditional statement: %s", (text) => {
    expect(() =>
      validateInterpretation(
        withProse("summary", text),
        chart,
        evidence,
        assessments,
      ),
    ).not.toThrow();
  });
  it.each([
    "不能确认结果但年命已经填实。",
    "不能断定结果但你的直属领导在欺骗你。",
    "不能认定对方欺骗然而你的同事在骗你。",
  ])("does not carry a negation across an affirmative contrast: %s", (text) => {
    expect(() =>
      validateInterpretation(
        withProse("summary", text),
        chart,
        evidence,
        assessments,
      ),
    ).toThrow(AiClientError);
  });
});

describe("real evaluation response 64 cannot disguise traditional inference as modern context", () => {
  const actualChart = castManual({
    dayStem: "甲",
    dayBranch: "子",
    monthGeneral: "辰",
    hourBranch: "子",
    daytime: true,
  });
  const actualEvidence = selectEvidence(actualChart, "career");
  const actualAssessments = assessRules(actualChart, "career");
  it("rejects the complete unchanged response despite valid procedure and judgement observations", () => {
    expect(actualChart.transmissions.map((t) => t.branch)).toEqual([
      "辰",
      "申",
      "子",
    ]);
    expect(uncitedContext.observations.at(-1)?.text).toContain("递生结构");
    expect(() =>
      validateInterpretation(
        uncitedContext,
        actualChart,
        actualEvidence,
        actualAssessments,
      ),
    ).toThrow(AiClientError);
  });
  it("accepts the same prose only when the traditional inference carries its actual matched citations", () => {
    const corrected = structuredClone(uncitedContext);
    const final = corrected.observations.at(-1)!;
    final.kind = "traditional";
    final.factIds = [...corrected.observations[0].factIds];
    final.evidenceIds = [...corrected.observations[0].evidenceIds];
    final.assessmentIds = [...corrected.observations[0].assessmentIds];
    expect(
      validateInterpretation(
        corrected,
        actualChart,
        actualEvidence,
        actualAssessments,
      ).observations,
    ).toHaveLength(uncitedContext.observations.length);
  });
  it.each([
    "递生结构",
    "递生链",
    "三传相生",
    "连环相克",
    "空上逢空",
    "旬空",
    "坐空",
    "初传",
    "取传",
    "寄宫",
  ])("rejects an uncited %s inference in context", (concept) => {
    const value = answer();
    value.observations = [
      {
        kind: "context",
        text: `${concept}可对应现实中的推进过程。`,
        factIds: [],
        evidenceIds: [],
        assessmentIds: [],
      },
    ];
    expect(() =>
      validateInterpretation(
        value,
        actualChart,
        actualEvidence,
        actualAssessments,
      ),
    ).toThrow(AiClientError);
  });
});

describe("unsupported event probability cannot be presented as verified analysis", () => {
  const actualChart = castManual({
    dayStem: "壬",
    dayBranch: "申",
    monthGeneral: "子",
    hourBranch: "子",
    daytime: true,
  });
  it("rejects complete real response 85 rather than silently deleting its probability claim", () => {
    expect(unsupportedProbability.observations.at(-1)?.text).toContain(
      "大概率难以追回",
    );
    expect(() =>
      validateInterpretation(
        unsupportedProbability,
        actualChart,
        selectEvidence(actualChart, "lost"),
        assessRules(actualChart, "lost"),
      ),
    ).toThrow(AiClientError);
  });
  it.each([
    "summary",
    "context",
    "advice",
    "missingInformation",
    "limitations",
  ] as const)("rejects ungrounded odds in %s", (location) => {
    const value = answer();
    if (location === "context")
      value.observations = [
        {
          kind: "context",
          text: "这次录用大概率会成功。",
          factIds: [],
          evidenceIds: [],
          assessmentIds: [],
        },
      ];
    else if (location === "summary") value.summary = "这次录用大概率会成功。";
    else value[location] = ["这次录用大概率会成功。"];
    expect(() =>
      validateInterpretation(value, chart, evidence, assessments),
    ).toThrow(AiClientError);
  });
  it.each([
    "录用概率80。",
    "找回概率较低。",
    "有80%的机会录用。",
    "有百分之七十的可能成功。",
    "这次有八成把握。",
    "不能保证结果但大概率会成功。",
  ])("rejects unsupported estimate: %s", (text) => {
    expect(() =>
      validateInterpretation(
        { ...answer(), summary: text },
        chart,
        evidence,
        assessments,
      ),
    ).toThrow(AiClientError);
  });
  it.each([
    "不能估算录用概率。",
    "不能说大概率能够找回。",
    "无法认定有80%的机会。",
    "结构成立不代表概率很高。",
    "先提高准备充分程度，再核实岗位条件。",
  ])("preserves uncertainty or non-probabilistic advice: %s", (text) => {
    expect(() =>
      validateInterpretation(
        { ...answer(), summary: text },
        chart,
        evidence,
        assessments,
      ),
    ).not.toThrow();
  });
});
