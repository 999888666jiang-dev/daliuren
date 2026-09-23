import type { Category, ChartResult, EvidenceRecord } from "../core/types";
import { validateMeaning, type MeaningSources } from "./meaning";
import type {
  CategoryChoice,
  IntentAssessment,
  InterpretationV2,
  RuleAssessment,
} from "./types";

export type AiErrorCode =
  | "INVALID_KEY"
  | "INVALID_REQUEST"
  | "ABORTED"
  | "TIMEOUT"
  | "NETWORK"
  | "AUTH"
  | "BALANCE"
  | "RATE_LIMIT"
  | "SERVICE"
  | "HTTP"
  | "INVALID_JSON"
  | "INVALID_RESPONSE"
  | "TRUNCATED"
  | "RESPONSE_TOO_LARGE"
  | "INVALID_INTENT"
  | "INVALID_INTERPRETATION";

/** Fixed messages only: never attach provider bodies, request objects or credentials. */
export class AiClientError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiClientError";
  }
}

export const CATEGORIES: readonly Category[] = [
  "career",
  "business",
  "relationship",
  "travel",
  "lost",
  "general",
];
export const CLARIFICATION_IDS = ["scope", "category", "object"] as const;
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
export const validText = (
  value: unknown,
  min: number,
  max: number,
): value is string =>
  typeof value === "string" &&
  value.trim().length >= min &&
  value.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const plain = (value: unknown, maximum: number): value is string =>
  validText(value, 1, maximum) &&
  !/[<>]/u.test(value) &&
  !/(?:https?:\/\/|www\.|javascript:|data:|```|\[[^\]]+\]\()/iu.test(value);
const strings = (
  items: unknown,
  min: number,
  max: number,
  length: number,
): items is string[] =>
  Array.isArray(items) &&
  items.length >= min &&
  items.length <= max &&
  items.every((item) => plain(item, length)) &&
  new Set(items).size === items.length;

export function validateQuestion(
  question: unknown,
  categoryChoice: unknown,
): asserts question is string {
  if (
    !validText(question, 4, 1200) ||
    (categoryChoice !== "auto" &&
      !CATEGORIES.includes(categoryChoice as Category))
  ) {
    throw new AiClientError(
      "INVALID_REQUEST",
      "请填写 4 至 1200 字的问题，并选择有效类别。",
    );
  }
}

export function validateIntent(
  value: unknown,
  question: string,
  categoryChoice: CategoryChoice,
  meaningSources?: MeaningSources,
): IntentAssessment {
  // Saved/resolved intents may retain all three bounded answer sources, even
  // though a single understanding round asks at most two new clarifications.
  if (
    !validText(question, 4, 3000) ||
    (categoryChoice !== "auto" &&
      !CATEGORIES.includes(categoryChoice as Category))
  )
    throw new AiClientError("INVALID_REQUEST", "问题或类别无效。");
  function fail(): never {
    throw new AiClientError(
      "INVALID_INTENT",
      "问题整理未通过校验，请手动确认所问事项或重新整理。",
    );
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "category",
      "coreQuestion",
      "subject",
      "object",
      "goal",
      "timeframe",
      "background",
      "missingInformation",
      "clarifications",
      "categoryReason",
      "status",
      "source",
      ...(Object.hasOwn(value, "meaning") ? ["meaning"] : []),
    ])
  )
    fail();
  const local = value.source === "local";
  const extractedText = (text: unknown, max: number): text is string =>
    local ? validText(text, 1, max) : plain(text, max);
  if (
    !CATEGORIES.includes(value.category as Category) ||
    !extractedText(value.coreQuestion, local ? 2400 : 240) ||
    !plain(value.categoryReason, 180) ||
    !["ready", "needs_clarification"].includes(String(value.status)) ||
    !["model", "local"].includes(String(value.source))
  )
    fail();
  if (categoryChoice !== "auto" && value.category !== categoryChoice) fail();
  // Named entities and dates are extracted spans, never invented completions.
  const compact = (text: string) => text.replace(/\s+/gu, "");
  for (const field of ["subject", "object", "goal", "timeframe"] as const) {
    if (
      value[field] !== null &&
      (!extractedText(value[field], local ? 1200 : 180) ||
        !compact(question).includes(compact(value[field])))
    )
      fail();
  }
  if (
    !strings(value.background, 0, 4, 180) ||
    !strings(value.missingInformation, 0, 4, 120)
  )
    fail();
  if (
    value.background.some((item) => !compact(question).includes(compact(item)))
  )
    fail();
  if (!Array.isArray(value.clarifications) || value.clarifications.length > 2)
    fail();
  const seen = new Set<string>();
  const clarifications: IntentAssessment["clarifications"] = [];
  for (const item of value.clarifications) {
    if (
      !isRecord(item) ||
      !exactKeys(item, ["id", "question", "options"]) ||
      typeof item.id !== "string" ||
      !CLARIFICATION_IDS.includes(
        item.id as (typeof CLARIFICATION_IDS)[number],
      ) ||
      seen.has(item.id) ||
      !plain(item.question, 120) ||
      !Array.isArray(item.options) ||
      item.options.length > (local ? 6 : 3) ||
      item.options.some(
        (option) => !extractedText(option, local ? 1200 : 60),
      ) ||
      new Set(item.options).size !== item.options.length ||
      (!local && item.options.length === 1)
    )
      fail();
    seen.add(item.id);
    clarifications.push({
      id: item.id,
      question: item.question,
      options: item.options,
    });
  }
  if (
    (value.status === "ready" && clarifications.length !== 0) ||
    (value.status === "needs_clarification" && clarifications.length === 0)
  )
    fail();
  let meaning: IntentAssessment["meaning"];
  if (value.meaning !== undefined) {
    try {
      meaning = validateMeaning(value.meaning, meaningSources ?? question);
    } catch {
      fail();
    }
  }
  return {
    category: value.category as Category,
    coreQuestion: value.coreQuestion,
    subject: value.subject as string | null,
    object: value.object as string | null,
    goal: value.goal as string | null,
    timeframe: value.timeframe as string | null,
    background: value.background,
    missingInformation: value.missingInformation,
    clarifications,
    categoryReason: value.categoryReason,
    status: value.status as IntentAssessment["status"],
    source: value.source as IntentAssessment["source"],
    ...(meaning ? { meaning } : {}),
  };
}

const dangerousClaim = (text: string) =>
  text.split(/[，,。！？；;\n]/u).some((clause) => {
    const claims = clause.matchAll(
      /必败|必中|必定|一定(?:会|成功|失败)|百分之百|100\s*%|保证(?:成功|失败|收益|盈利)|注定|必有(?:灾|祸)|准确预测/gu,
    );
    for (const match of claims) {
      const before = clause.slice(0, match.index);
      if (
        !/(?:不能|不可|无法|不应|不宜|不足以|不代表|不等于|不保证|并非|未必|不一定|避免|勿|不要)[^，,。；;]{0,18}$/u.test(
          before,
        )
      )
        return true;
    }
    return false;
  });
const fabricatedQuote = (text: string) =>
  /《[^》]+》|(?:原文|古籍|经典|古书|古人)\s*(?:曰|云|说|有言|记载|指出|[：:])|(?:有言|原文(?:为|是)|书中记载)\s*[：:“「『]/u.test(
    text,
  );

function negatedAssertion(before: string) {
  const tail = before.split(/但是|然而|不过|可是|却|但|而是/u).at(-1) ?? "";
  return /(?:不能|不可|不得|不应|不宜|不代表|不等于|无法|不足以|不是|并非|尚未|未能|未确认|没有证据|不证明|不意味着)[^，,。；;]{0,24}$/u.test(
    tail,
  );
}

function unsupportedFilling(text: string) {
  return text.split(/[，,。！？；;\n]/u).some((clause) => {
    for (const claim of clause.matchAll(
      /(?:年命|本命|行年)(?:已|已经)填实|(?:年命|本命|行年)填实(?:成立|已成立|已满足|完成)|(?:排除|没有|不存在)(?:年命|本命|行年)填实/gu,
    )) {
      if (!negatedAssertion(clause.slice(0, claim.index))) return true;
    }
    return false;
  });
}

function unsupportedProbability(text: string) {
  return text.split(/[，,。！？；;\n]/u).some((clause) => {
    for (const claim of clause.matchAll(
      /(?:大|小|高|低)概率|概率(?:很|较|偏|更|极|非常|十分|相当)?(?:高|低|大|小)|概率(?:约为|为|是|约|有|达到|达|超过|低于|高于)?\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*[%％]|百分之[零〇一二三四五六七八九十百两\d.]+|(?:有|约|达|为|是)[一二三四五六七八九十两]成(?:概率|把握|可能|机会)/gu,
    )) {
      if (!negatedAssertion(clause.slice(0, claim.index))) return true;
    }
    return false;
  });
}

function unsupportedAccusation(text: string) {
  return text.split(/[，,。！？；;\n]/u).some((clause) => {
    for (const claim of clause.matchAll(
      /欺骗|欺诈|诈骗|骗你|骗您|骗子|骗钱/gu,
    )) {
      const before = clause.slice(0, claim.index);
      if (negatedAssertion(before)) continue;
      // Questions, conditions and verification advice do not assert a person's guilt.
      const tail = before.split(/但是|然而|不过|可是|却|但|而是/u).at(-1) ?? "";
      if (
        /(?:是否|有无|有没有|可能|或许|假如|如果|若|警惕|避免|防范|防止)[^，,。；;]{0,24}$/u.test(
          tail,
        )
      )
        continue;
      if (
        /(?:对方|某人|有人|某位|上司|领导|同事|朋友|伴侣|对象|合作方|合伙人|家人|亲友|丈夫|妻子|男友|女友|他|她)[^，,。；;]{0,24}$/u.test(
          before,
        ) ||
        /(?:本课|课盘|此格|互克|结构|传统).*(?:说明|表明|意味着|预示|证明|可见)/u.test(
          before,
        )
      )
        return true;
    }
    return false;
  });
}

function contradictsChart(text: string, chart: ChartResult) {
  const branches = "子丑寅卯辰巳午未申酉戌亥";
  for (const [index, name] of ["初传", "中传", "末传"].entries()) {
    const claims = text.matchAll(
      new RegExp(`${name}(?:为|是|：|:|取)?\\s*([${branches}])`, "gu"),
    );
    for (const claim of claims)
      if (claim[1] !== chart.transmissions[index].branch) return true;
  }
  for (const claim of text.matchAll(
    /(?:日柱|日干支)(?:为|是|：|:)?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/gu,
  )) {
    if (claim[1] !== chart.day.stem + chart.day.branch) return true;
  }
  for (const claim of text.matchAll(
    /本课(?:采用|以|为|属于|按)?\s*(贼克|比用|涉害|遥克|昴星|别责|八专|伏吟|返吟)/gu,
  )) {
    if (claim[1] !== chart.method.name) return true;
  }
  return false;
}

function unsupportedJudgement(
  text: string,
  assessments: RuleAssessment[],
  verified: Set<string>,
) {
  const supported = (prefix: string) =>
    assessments.some(
      (item) =>
        item.kind === "judgement" &&
        item.status === "met" &&
        item.evidenceIds.some(
          (id) =>
            verified.has(id) && (id === prefix || id.startsWith(prefix + "-")),
        ),
    );
  const concepts: [RegExp, string][] = [
    [/三传递生|递生格|递生链|举荐格/u, "bifa-031"],
    [/三传互克|连环克|众人欺/u, "bifa-032"],
    [/空上乘空|空上逢空/u, "bifa-016"],
  ];
  return text
    .split(/[，,。！？；;\n]/u)
    .some((clause) =>
      concepts.some(
        ([pattern, id]) =>
          pattern.test(clause) &&
          !supported(id) &&
          !/(?:未满足|不满足|不符合|不能认定|尚不能|尚未判断|未判|无法判断)/u.test(
            clause,
          ),
      ),
    );
}

function procedureMakesJudgement(text: string) {
  return text.split(/[，,。！？；;\n]/u).some((clause) => {
    for (const match of clause.matchAll(
      /吉凶|吉利|凶险|成功|失败|举荐|欺骗|财运|感情|婚姻|事业顺|将会|意味着|预示|象征/gu,
    )) {
      const before = clause.slice(0, match.index);
      // A rule may explain its own limits. Negation cannot cross a clause boundary.
      if (
        !/(?:不能|不可|不得|不应|不宜|不代表|不等于|无法|不足以|不是|并非|不用于|不判断|不讨论|不涉及|不作|不保证)[^，,。；;]{0,24}$/u.test(
          before,
        )
      )
        return true;
    }
    return false;
  });
}

/** Checks structure and executable evidence relationships, not the truth of unrestricted prose. */
export function validateInterpretation(
  value: unknown,
  chart: ChartResult,
  evidence: EvidenceRecord[],
  assessments: RuleAssessment[],
): InterpretationV2 {
  function fail(): never {
    throw new AiClientError(
      "INVALID_INTERPRETATION",
      "解读未通过结构或证据校验，请保留课盘与原文后重试。",
    );
  }
  const verified = new Set(
    evidence
      .filter((record) => record.verification === "verified")
      .map((record) => record.id),
  );
  const prose = (text: unknown, max: number): text is string =>
    plain(text, max) &&
    !fabricatedQuote(text) &&
    !dangerousClaim(text) &&
    !unsupportedProbability(text) &&
    !unsupportedFilling(text) &&
    !unsupportedAccusation(text) &&
    !contradictsChart(text, chart) &&
    !unsupportedJudgement(text, assessments, verified);
  const list = (
    items: unknown,
    min: number,
    max: number,
    length: number,
  ): items is string[] =>
    strings(items, min, max, length) &&
    items.every((item) => prose(item, length));
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "summary",
      "observations",
      "advice",
      "missingInformation",
      "limitations",
    ]) ||
    !prose(value.summary, 220) ||
    !list(value.advice, 1, 4, 120) ||
    !list(value.missingInformation, 0, 3, 100) ||
    !list(value.limitations, 1, 3, 120) ||
    !Array.isArray(value.observations) ||
    value.observations.length < 1 ||
    value.observations.length > 5
  )
    fail();
  const facts = new Set(chart.facts.map((fact) => fact.id));
  const assessmentMap = new Map(assessments.map((item) => [item.id, item]));
  const ids = (
    items: unknown,
    allowed: Set<string>,
    min = 0,
    max = 8,
  ): items is string[] =>
    Array.isArray(items) &&
    items.length >= min &&
    items.length <= max &&
    items.every((id) => typeof id === "string" && allowed.has(id)) &&
    new Set(items).size === items.length;
  const observations: InterpretationV2["observations"] = [];
  for (const item of value.observations) {
    if (
      !isRecord(item) ||
      !exactKeys(item, [
        "kind",
        "text",
        "factIds",
        "evidenceIds",
        "assessmentIds",
      ]) ||
      !["traditional", "context"].includes(String(item.kind)) ||
      !prose(item.text, 220) ||
      !ids(item.factIds, facts, item.kind === "traditional" ? 1 : 0, 12) ||
      !ids(item.evidenceIds, verified) ||
      !ids(item.assessmentIds, new Set(assessmentMap.keys()))
    )
      fail();
    if (item.kind === "context") {
      if (item.evidenceIds.length || item.assessmentIds.length) fail();
      if (
        /三传|四课|初传|中传|末传|取传|寄宫|递生|互克|连环(?:相)?克|众人欺|空上(?:乘|逢)空|旬空|坐空|年命填实|必有贵人|按古法|古法认为/u.test(
          item.text,
        )
      )
        fail();
    } else {
      if (!item.assessmentIds.length || !item.evidenceIds.length) fail();
      const selected = item.assessmentIds.map((id) => assessmentMap.get(id)!);
      if (
        selected.some(
          (a) =>
            a.status !== "met" ||
            !a.evidenceIds.length ||
            a.evidenceIds.some((id) => !verified.has(id)) ||
            a.factIds.some((id) => !facts.has(id)),
        )
      )
        fail();
      const linkedFacts = new Set(selected.flatMap((a) => a.factIds));
      const linkedEvidence = new Set(selected.flatMap((a) => a.evidenceIds));
      const citedFacts = item.factIds;
      const citedEvidence = item.evidenceIds;
      if (
        citedFacts.some((id) => !linkedFacts.has(id)) ||
        citedEvidence.some((id) => !linkedEvidence.has(id)) ||
        selected.some(
          (a) =>
            !a.factIds.some((id) => citedFacts.includes(id)) ||
            !a.evidenceIds.every((id) => citedEvidence.includes(id)),
        )
      )
        fail();
      // A procedure reference establishes calculation, never a judgement about the event.
      if (
        selected.every((a) => a.kind === "procedure") &&
        procedureMakesJudgement(item.text)
      )
        fail();
      const supports = (prefix: string) =>
        selected.some(
          (a) =>
            a.kind === "judgement" &&
            a.evidenceIds.some(
              (id) => id === prefix || id.startsWith(prefix + "-"),
            ),
        );
      if (
        /三传递生|递生格|递生链|举荐格/u.test(item.text) &&
        !supports("bifa-031")
      )
        fail();
      if (/三传互克|连环克|众人欺/u.test(item.text) && !supports("bifa-032"))
        fail();
      if (/空上乘空|空上逢空/u.test(item.text) && !supports("bifa-016")) fail();
    }
    observations.push({
      kind: item.kind as "traditional" | "context",
      text: item.text,
      factIds: item.factIds,
      evidenceIds: item.evidenceIds,
      assessmentIds: item.assessmentIds,
    });
  }
  const total =
    value.summary.length +
    observations.reduce((n, item) => n + item.text.length, 0) +
    [...value.advice, ...value.missingInformation, ...value.limitations].reduce(
      (n, text) => n + text.length,
      0,
    );
  if (total > 1700) fail();
  return {
    summary: value.summary,
    observations,
    advice: value.advice,
    missingInformation: value.missingInformation,
    limitations: value.limitations,
  };
}
