import {
  BRANCHES,
  ENGINE_VERSION,
  GENERAL_ORDER,
  RULE_VERSION,
  STEMS,
} from "../core/constants";
import type {
  Branch,
  CastInput,
  Category,
  ChartResult,
  EvidenceRecord,
  Interpretation,
  ManualInput,
  Stem,
  TimeContext,
} from "../core/types";
import type {
  CategoryChoice,
  IntentAssessment,
  InterpretationV2,
  RuleAssessment,
} from "../ai/types";
import {
  CATEGORIES,
  isRecord,
  validateIntent,
  validateInterpretation,
} from "../ai/validation";
import type { Report } from "./report";

export const redactReportSecrets = (value: string): string =>
  value.replace(/\bsk-[A-Za-z0-9_-]+/giu, "[已移除密钥]");
function fail(): never {
  throw new Error("报告内容格式无效。");
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) fail();
  return value;
}
function text(value: unknown, max = 2000, min = 0): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    value.trim().length < min ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  )
    fail();
  return redactReportSecrets(value);
}
function array(value: unknown, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length > max || value.length < min) fail();
  return value;
}
function strings(value: unknown, max = 24, length = 2000, min = 0): string[] {
  return array(value, max, min).map((item) => text(item, length, 1));
}
function oneOf<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) fail();
  return value as T;
}
function branch(value: unknown): Branch {
  return oneOf(value, BRANCHES);
}
function stem(value: unknown): Stem {
  return oneOf(value, STEMS);
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") fail();
  return value;
}
function number(value: unknown, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > maximum
  )
    fail();
  return value;
}
function unique<T>(values: T[]): T[] {
  if (new Set(values).size !== values.length) fail();
  return values;
}
function date(value: unknown, utc = false): string {
  const result = text(value, 32, 16);
  if (
    !(
      utc
        ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u
        : /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?$/u
    ).test(result)
  )
    fail();
  const parts = result.match(/\d+/gu)!.map(Number);
  const [year, month, day, hour, minute, second = 0] = parts;
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    fail();
  return result;
}
function ganZhi(value: unknown) {
  const v = record(value);
  const s = stem(v.stem);
  const b = branch(v.branch);
  if (STEMS.indexOf(s) % 2 !== BRANCHES.indexOf(b) % 2) fail();
  return { stem: s, branch: b };
}
function castInput(value: unknown): CastInput {
  const v = record(value);
  const result: CastInput = {
    datetime: date(v.datetime),
    timeBasis: oneOf(v.timeBasis, ["solar", "standard"]),
  };
  if (v.latitude !== undefined) result.latitude = number(v.latitude, 90);
  if (v.longitude !== undefined) result.longitude = number(v.longitude, 180);
  if (result.timeBasis === "solar" && result.longitude === undefined) fail();
  if (v.natalBranch !== undefined) result.natalBranch = branch(v.natalBranch);
  if (v.annualBranch !== undefined)
    result.annualBranch = branch(v.annualBranch);
  if (v.ruleVersion !== undefined)
    result.ruleVersion = text(v.ruleVersion, 100, 1);
  if (v.castMode !== undefined)
    result.castMode = oneOf(v.castMode, ["standard", "living"] as const);
  if (v.livingNumber !== undefined) {
    const n = number(v.livingNumber, 12);
    if (!Number.isInteger(n) || n < 1 || result.castMode !== "living") fail();
    result.livingNumber = n;
  }
  if (result.castMode === "living" && result.livingNumber === undefined) fail();
  return result;
}
function manualInput(value: unknown): ManualInput {
  const v = record(value);
  const day = ganZhi({ stem: v.dayStem, branch: v.dayBranch });
  const result: ManualInput = {
    dayStem: day.stem,
    dayBranch: day.branch,
    monthGeneral: branch(v.monthGeneral),
    hourBranch: branch(v.hourBranch),
    daytime: bool(v.daytime),
  };
  if (v.natalBranch !== undefined) result.natalBranch = branch(v.natalBranch);
  if (v.annualBranch !== undefined)
    result.annualBranch = branch(v.annualBranch);
  return result;
}
function time(value: unknown): TimeContext {
  const v = record(value);
  const nullableNumber = (key: string) =>
    v[key] === null ? null : number(v[key], 3000);
  return {
    utcIso: date(v.utcIso, true),
    beijing: date(v.beijing),
    solar: v.solar === null ? null : date(v.solar),
    selected: date(v.selected),
    timeBasis: oneOf(v.timeBasis, ["solar", "standard"]),
    longitudeCorrectionMinutes: nullableNumber("longitudeCorrectionMinutes"),
    equationOfTimeMinutes: nullableNumber("equationOfTimeMinutes"),
    offsetMinutes: nullableNumber("offsetMinutes"),
    nearBoundary: bool(v.nearBoundary),
  };
}

/** Validate saved provenance, never regenerate historical calendar/plate data. */
function checkChartMode(chart: ChartResult): void {
  if (chart.manualInput && (chart.input || chart.time || chart.casting)) fail();
  if (!chart.casting) return;
  if (!chart.input || !chart.time) fail();
  if ((chart.input.castMode ?? "standard") !== chart.casting.mode) fail();

  // Unknown historical engines may have used different clock/daylight rules.
  // Only this exact, known version is checked against its saved selected clock.
  if (
    chart.engineVersion !== ENGINE_VERSION ||
    chart.ruleVersion !== RULE_VERSION
  )
    return;
  if (chart.input.timeBasis !== chart.time.timeBasis) fail();
  const chosenClock =
    chart.time.timeBasis === "solar" ? chart.time.solar : chart.time.beijing;
  if (!chosenClock) fail();
  const civilMillis = (clock: string) =>
    Date.parse(`${clock.replace(" ", "T")}Z`);
  if (civilMillis(chosenClock) !== civilMillis(chart.time.selected)) fail();
  if (civilMillis(chart.input.datetime) !== civilMillis(chart.time.beijing))
    fail();
  const hourIndex =
    Math.floor((Number(chart.time.selected.slice(11, 13)) + 1) / 2) % 12;
  if (chart.casting.realHourBranch !== BRANCHES[hourIndex]) fail();
  if (chart.daytime !== (hourIndex >= 3 && hourIndex <= 8)) fail();
}

/** Structural preservation of a historical chart; never runs the current casting engine. */
export function projectChart(value: unknown): ChartResult {
  const v = record(value);
  const method = record(v.method);
  const result: ChartResult = {
    id: text(v.id, 200, 1),
    engineVersion: text(v.engineVersion, 100, 1),
    ruleVersion: text(v.ruleVersion, 100, 1),
    day: ganZhi(v.day),
    monthGeneral: branch(v.monthGeneral),
    hourBranch: branch(v.hourBranch),
    daytime: bool(v.daytime),
    heavenPlate: unique(array(v.heavenPlate, 12, 12).map(branch)),
    lessons: array(v.lessons, 4, 4).map((item) => {
      const l = record(item);
      const kind = oneOf(l.kind, ["stem", "branch"]);
      return {
        kind,
        lower: kind === "stem" ? stem(l.lower) : branch(l.lower),
        lowerBranch: branch(l.lowerBranch),
        upper: branch(l.upper),
      };
    }),
    transmissions: array(v.transmissions, 3, 3).map((item) => {
      const t = record(item);
      return {
        branch: branch(t.branch),
        hiddenStem: t.hiddenStem === null ? null : stem(t.hiddenStem),
        relative: oneOf(t.relative, ["兄弟", "父母", "子孙", "妻财", "官鬼"]),
        general: oneOf(t.general, GENERAL_ORDER),
        isVoid: bool(t.isVoid),
      };
    }),
    generals: unique(
      array(v.generals, 12, 12).map((item) => oneOf(item, GENERAL_ORDER)),
    ),
    voids: unique(array(v.voids, 2, 2).map(branch)),
    method: {
      name: oneOf(method.name, [
        "贼克",
        "比用",
        "涉害",
        "遥克",
        "昴星",
        "别责",
        "八专",
        "伏吟",
        "返吟",
      ]),
      detail: text(method.detail, 3000, 1),
    },
    trace: array(v.trace, 64, 1).map((item) => {
      const t = record(item);
      return {
        id: text(t.id, 100, 1),
        title: text(t.title, 200, 1),
        detail: text(t.detail, 8000, 1),
        sourceIds: unique(strings(t.sourceIds, 24, 100)),
      };
    }),
    facts: array(v.facts, 100, 1).map((item) => {
      const f = record(item);
      return {
        id: text(f.id, 100, 1),
        label: text(f.label, 200, 1),
        value: text(f.value, 4000, 1),
        sourceIds: unique(strings(f.sourceIds, 24, 100)),
      };
    }),
    profileWarnings: strings(v.profileWarnings, 32, 2000),
  };
  unique(result.trace.map((item) => item.id));
  unique(result.facts.map((item) => item.id));
  if (v.monthBranch !== undefined) result.monthBranch = branch(v.monthBranch);
  if (v.input !== undefined) result.input = castInput(v.input);
  if (v.manualInput !== undefined)
    result.manualInput = manualInput(v.manualInput);
  if (v.time !== undefined) result.time = time(v.time);
  if (v.casting !== undefined) {
    const c = record(v.casting);
    result.casting = {
      mode: oneOf(c.mode, ["standard", "living"]),
      realHourBranch: branch(c.realHourBranch),
      notice: text(c.notice, 3000, 1),
    };
    if (c.virtualHourBranch !== undefined)
      result.casting.virtualHourBranch = branch(c.virtualHourBranch);
    if (c.number !== undefined) {
      const n = number(c.number, 12);
      if (!Number.isInteger(n) || n < 1) fail();
      result.casting.number = n;
    }
    if (
      result.casting.mode === "living" &&
      (!result.casting.number ||
        result.casting.virtualHourBranch !== result.hourBranch ||
        BRANCHES[result.casting.number - 1] !== result.hourBranch ||
        result.input?.livingNumber !== result.casting.number ||
        result.input?.castMode !== "living")
    )
      fail();
    if (
      result.casting.mode === "standard" &&
      (result.input?.castMode === "living" ||
        result.casting.number !== undefined ||
        result.casting.virtualHourBranch !== undefined ||
        result.casting.realHourBranch !== result.hourBranch)
    )
      fail();
  }
  if (result.input?.castMode === "living" && result.casting?.mode !== "living")
    fail();
  checkChartMode(result);
  return result;
}
function evidenceRecord(value: unknown): EvidenceRecord {
  const v = record(value);
  const sourceUrl = text(v.sourceUrl, 2048, 1);
  const imageUrl = text(v.imageUrl, 300, 1);
  const url = new URL(sourceUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !/^sources\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/u.test(imageUrl)
  )
    fail();
  return {
    id: text(v.id, 100, 1),
    title: text(v.title, 300, 1),
    quote: text(v.quote, 8000, 1),
    work: text(v.work, 300, 1),
    edition: text(v.edition, 500, 1),
    volume: text(v.volume, 300, 1),
    page: text(v.page, 300, 1),
    sourceUrl,
    imageUrl,
    verification: oneOf(v.verification, ["verified", "pending"]),
    reviewNote: text(v.reviewNote, 5000, 1),
    ruleIds: unique(strings(v.ruleIds, 24, 100)),
  };
}
function answers(value: unknown): Record<string, string> {
  const v = record(value);
  const result: Record<string, string> = {};
  for (const id of ["scope", "category", "object"])
    if (v[id] !== undefined) result[id] = text(v[id], 500, 1);
  if (Object.keys(result).length > 2) fail();
  return result;
}
function projectIntent(value: unknown): IntentAssessment {
  const v = record(value);
  return {
    category: oneOf(v.category, CATEGORIES),
    coreQuestion: text(v.coreQuestion, 2400, 1),
    subject: v.subject === null ? null : text(v.subject, 1200, 1),
    object: v.object === null ? null : text(v.object, 1200, 1),
    goal: v.goal === null ? null : text(v.goal, 1200, 1),
    timeframe: v.timeframe === null ? null : text(v.timeframe, 1200, 1),
    background: strings(v.background, 4, 1200),
    missingInformation: strings(v.missingInformation, 4, 120),
    categoryReason: text(v.categoryReason, 300, 1),
    status: oneOf(v.status, ["ready", "needs_clarification"]),
    source: oneOf(v.source, ["local", "model"]),
    clarifications: array(v.clarifications, 2).map((item) => {
      const c = record(item);
      return {
        id: oneOf(c.id, ["scope", "category", "object"]),
        question: text(c.question, 120, 1),
        options: strings(c.options, 6, 1200),
      };
    }),
  };
}
function assessments(value: unknown, chart: ChartResult): RuleAssessment[] {
  const factIds = new Set(chart.facts.map((item) => item.id));
  const result = array(value, 100).map((item) => {
    const v = record(item);
    const ids = unique(strings(v.factIds, 24, 100));
    if (ids.some((id) => !factIds.has(id))) fail();
    return {
      id: text(v.id, 100, 1),
      title: text(v.title, 300, 1),
      kind: oneOf(v.kind, ["procedure", "judgement"]),
      status: oneOf(v.status, ["met", "not_met", "unknown", "not_applicable"]),
      statement: text(v.statement, 3000, 1),
      factIds: ids,
      evidenceIds: unique(strings(v.evidenceIds, 24, 100)),
      caveats: strings(v.caveats, 24, 2000),
      missingInputs: strings(v.missingInputs, 24, 1000),
    };
  });
  unique(result.map((item) => item.id));
  return result;
}
function interpretationShape(value: unknown, modern: boolean) {
  const v = record(value);
  const observations = array(v.observations, modern ? 5 : 8, 1).map((item) => {
    const o = record(item);
    const base = {
      text: text(o.text, modern ? 220 : 650, 1),
      factIds: unique(strings(o.factIds, 12, 100, modern ? 0 : 1)),
      evidenceIds: unique(strings(o.evidenceIds, modern ? 8 : 12, 100)),
    };
    return modern
      ? {
          ...base,
          kind: oneOf(o.kind, ["traditional", "context"]),
          assessmentIds: unique(strings(o.assessmentIds, 8, 100)),
        }
      : base;
  });
  return {
    summary: text(v.summary, modern ? 220 : 800, 1),
    observations,
    advice: strings(v.advice, modern ? 4 : 6, modern ? 120 : 400, 1),
    missingInformation: strings(
      v.missingInformation,
      modern ? 3 : 6,
      modern ? 100 : 300,
    ),
    limitations: strings(v.limitations, modern ? 3 : 6, modern ? 120 : 300, 1),
  };
}
function legacyInterpretation(
  value: unknown,
  chart: ChartResult,
  snapshot: EvidenceRecord[],
): Interpretation {
  const result = interpretationShape(value, false) as Interpretation;
  const factIds = new Set(chart.facts.map((item) => item.id));
  const evidenceIds = new Set(
    snapshot
      .filter((item) => item.verification === "verified")
      .map((item) => item.id),
  );
  for (const item of result.observations)
    if (
      item.factIds.some((id) => !factIds.has(id)) ||
      item.evidenceIds.some((id) => !evidenceIds.has(id))
    )
      fail();
  return result;
}
function aiMeta(value: unknown): Record<string, string> {
  const v = record(value);
  const result: Record<string, string> = {};
  for (const key of [
    "model",
    "promptVersion",
    "intentVersion",
    "engineVersion",
    "ruleVersion",
    "corpusVersion",
    "generatedAt",
  ])
    if (v[key] !== undefined)
      result[key] =
        key === "generatedAt" ? date(v[key], true) : text(v[key], 300, 1);
  return result;
}

/** Projects only known fields. Invalid optional AI data never destroys a valid chart. */
export function normalizeReport(value: unknown): Report | null {
  try {
    const v = record(value);
    if (v.schemaVersion !== 1 && v.schemaVersion !== 2) return null;
    const chart = projectChart(v.chart);
    const createdAt = date(v.createdAt, true);
    const category = oneOf(v.category, CATEGORIES);
    const warnings: string[] = [];
    if (v.warnings !== undefined) {
      try {
        warnings.push(...strings(v.warnings, 40, 2000));
      } catch {
        warnings.push("原报告提示字段损坏，已忽略。");
      }
    }
    const result: Report = {
      schemaVersion: 2,
      id:
        v.schemaVersion === 1
          ? `legacy-${chart.id}-${createdAt}`
          : text(v.id, 400, 1),
      categoryChoice:
        v.schemaVersion === 1
          ? category
          : (oneOf(v.categoryChoice, [
              "auto",
              ...CATEGORIES,
            ]) as CategoryChoice),
      question: text(v.question, 1200, 4),
      category,
      place: text(v.place, 300, 1),
      createdAt,
      chart,
    };
    if (v.consultation !== undefined) {
      const c = record(v.consultation);
      result.consultation = {
        mode: oneOf(c.mode, ["standard", "living", "reuse", "manual"]),
        matterId: text(c.matterId, 400, 1),
      };
      if (c.parentReportId !== undefined)
        result.consultation.parentReportId = text(c.parentReportId, 400, 1);
      if (c.sourceChartReportId !== undefined)
        result.consultation.sourceChartReportId = text(
          c.sourceChartReportId,
          400,
          1,
        );
      if (c.changeNote !== undefined)
        result.consultation.changeNote = text(c.changeNote, 500, 6);
      const mode = result.consultation.mode;
      // Continuation is a consultation mode, not a new casting operation.
      // It may preserve a real-time, reported-time, or manually entered chart.
      if (mode !== "reuse") {
        const originalMode = chart.manualInput
          ? "manual"
          : (chart.casting?.mode ?? chart.input?.castMode ?? "standard");
        if (mode !== originalMode) fail();
      }
    }
    if (v.comparison !== undefined) {
      try {
        result.comparison = projectChart(v.comparison);
      } catch {
        warnings.push("对照课盘损坏，已保留主课盘。");
      }
    }
    if (v.corpusVersion !== undefined)
      result.corpusVersion = text(v.corpusVersion, 100, 1);
    if (v.evidenceSnapshot === undefined)
      warnings.push("报告未保存引文快照；不使用当前引文冒充当时的原文记录。");
    else {
      result.evidenceSnapshot = [];
      try {
        for (const item of array(v.evidenceSnapshot, 100)) {
          try {
            const entry = evidenceRecord(item);
            if (result.evidenceSnapshot.some((e) => e.id === entry.id)) fail();
            result.evidenceSnapshot.push(entry);
          } catch {
            warnings.push("一条引文快照损坏，已忽略；其余课盘与原文保留。");
          }
        }
      } catch {
        warnings.push("引文快照格式损坏，已忽略。");
      }
    }
    if (v.clarificationAnswers !== undefined) {
      try {
        result.clarificationAnswers = answers(v.clarificationAnswers);
      } catch {
        warnings.push("澄清答案格式损坏，已忽略。");
      }
    }
    if (v.intent !== undefined) {
      try {
        const projected = projectIntent(v.intent);
        if (projected.category !== category) fail();
        const source = [
          result.question,
          ...Object.values(result.clarificationAnswers ?? {}),
        ].join("\n");
        if (source.length > 2400) fail();
        result.intent = validateIntent(projected, source, projected.category);
      } catch {
        warnings.push("问题整理结果未通过校验，已保留原问题。");
      }
    }
    if (v.assessments !== undefined) {
      try {
        result.assessments = assessments(v.assessments, chart);
      } catch {
        warnings.push("规则评估记录损坏，已忽略。");
      }
    }
    const oldAi =
      v.schemaVersion === 1 ? v.interpretation : v.legacyInterpretation;
    if (oldAi !== undefined) {
      try {
        result.legacyInterpretation = legacyInterpretation(
          oldAi,
          chart,
          result.evidenceSnapshot ?? [],
        );
        warnings.push("此为旧版解读，未冒称通过新版规则评估校验。");
      } catch {
        warnings.push("旧版解读损坏或引用无法复核，已移除解读并保留课盘。");
      }
    }
    if (v.schemaVersion === 2 && v.interpretation !== undefined) {
      try {
        result.interpretation = validateInterpretation(
          interpretationShape(v.interpretation, true),
          chart,
          result.evidenceSnapshot ?? [],
          result.assessments ?? [],
        );
      } catch {
        warnings.push("新版解读未通过结构或证据校验，已移除解读并保留课盘。");
      }
    }
    if (v.aiMeta !== undefined) {
      try {
        result.aiMeta = aiMeta(v.aiMeta);
      } catch {
        warnings.push("模型版本记录损坏，已忽略。");
      }
    }
    if (warnings.length) result.warnings = [...new Set(warnings)].slice(0, 40);
    return result;
  } catch {
    return null;
  }
}
