import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readingFixture } from "./reading-fixtures";
import { localIntent, resolveIntent } from "../src/ai/intent";
import { READING_VERSION } from "../src/ai/reading-validation";
import {
  appendReading,
  activeReading,
  canInterpretChart,
  type ReadingRevision,
} from "../src/lib/reading-report";
import {
  normalizeReport,
  readReports,
  saveReport,
  serializeReport,
  type Report,
} from "../src/lib/report";

const v2Key = "guanxiang.reports.v2";
const v3Key = "guanxiang.reports.v3";
let storage: Map<string, string>;

function baseReport(): Report {
  const { chart, request } = readingFixture();
  return {
    schemaVersion: 2,
    id: "stable-original-report",
    categoryChoice: "general",
    question: request.question,
    category: "general",
    createdAt: request.questionAskedAt,
    place: "未提供地点",
    chart,
    corpusVersion: "archived-corpus-before-v3",
    evidenceSnapshot: [],
    intent: request.intent,
  };
}

function revision(
  report = baseReport(),
  id = "reading-first",
  createdAt = "2026-09-23T06:00:00.000Z",
): ReadingRevision {
  const { context, interpretation } = readingFixture();
  return {
    id,
    createdAt,
    questionAskedAt: report.createdAt,
    intent: localIntent(report.question, report.categoryChoice),
    answers: {},
    context,
    interpretation,
    meta: {
      model: "fixture-model",
      promptVersion: "reading-v3-test",
      intentVersion: "meaning-v1-test",
      engineVersion: report.chart.engineVersion,
      ruleVersion: report.chart.ruleVersion,
      corpusVersion: context.version,
      generatedAt: createdAt,
      readingVersion: READING_VERSION,
      assessmentVersion: context.version,
      questionAskedAt: report.createdAt,
    },
  };
}

function append(report: Report, value: ReadingRevision): Report {
  return { ...report, ...appendReading(report, value) };
}

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reading revisions preserve the immutable original report", () => {
  it("saves a new schema-3 reading separately, preserving original chart, meaning and closed references on reload/export", () => {
    const original = baseReport();
    const frozen = structuredClone(original);
    saveReport(original);
    const oldStorage = storage.get(v2Key);
    const reading = revision(original);
    const current = append(original, reading);
    expect(original).toEqual(frozen);
    expect(current.schemaVersion).toBe(3);
    expect(current.chart).toBe(original.chart);
    expect(current.corpusVersion).toBe("archived-corpus-before-v3");
    expect(current.createdAt).toBe(original.createdAt);
    saveReport(current);
    expect(storage.get(v2Key)).toBe(oldStorage);
    expect(JSON.parse(storage.get(v3Key)!)[0].schemaVersion).toBe(3);
    const reports = readReports();
    expect(reports).toHaveLength(1);
    const restored = reports[0];
    expect(restored.chart).toEqual(frozen.chart);
    expect(restored.question).toBe(frozen.question);
    expect(restored.createdAt).toBe(frozen.createdAt);
    expect(activeReading(restored)).toEqual(reading);
    expect(activeReading(restored)!.intent.meaning!.goal.basis).toBe(
      "paraphrase",
    );
    expect(activeReading(restored)!.context.sources[0].clauses).toEqual(
      reading.context.sources[0].clauses,
    );
    const exported = JSON.parse(serializeReport(restored));
    expect(
      exported.readingRevisions[0].interpretation.reasoning[0].clauseIds,
    ).toEqual(["test-principle"]);
    expect(exported.readingRevisions[0].intent.meaning).toEqual(
      reading.intent.meaning,
    );
  });

  it("retains independent reports sharing one creation timestamp and only supersedes the same report ID", () => {
    const original = baseReport();
    const other = {
      ...baseReport(),
      id: "another-report-at-same-instant",
      question: "今晚出行顺利吗？",
      intent: undefined,
    };
    saveReport(original);
    saveReport(other);
    saveReport(append(original, revision(original)));
    expect(
      readReports()
        .map((r) => r.id)
        .sort(),
    ).toEqual([other.id, original.id].sort());
    expect(readReports().find((r) => r.id === original.id)!.schemaVersion).toBe(
      3,
    );
  });

  it("appends revisions without replacing earlier interpretations and uses the selected revision", () => {
    const original = baseReport();
    const first = revision(original);
    const withFirst = append(original, first);
    const second = revision(
      original,
      "reading-second",
      "2026-09-24T07:00:00.000Z",
    );
    second.interpretation.summary =
      "按本课已有支持与限制合看，保留有条件可行的判断。";
    const withSecond = append(withFirst, second);
    expect(withFirst.readingRevisions).toEqual([first]);
    expect(withSecond.readingRevisions).toEqual([first, second]);
    expect(activeReading(withSecond)).toEqual(second);
    expect(activeReading({ ...withSecond, activeReadingId: first.id })).toEqual(
      first,
    );
    expect(
      activeReading({ ...withSecond, activeReadingId: null }),
    ).toBeUndefined();
    const restored = normalizeReport(withSecond)!;
    expect(restored.readingRevisions).toEqual([first, second]);
  });

  it("refuses a revision beyond the archive bound instead of turning one hundred saved readings into an empty archive", () => {
    const original = baseReport();
    const first = revision(original);
    const full: Report = {
      ...original,
      schemaVersion: 3,
      readingRevisions: Array.from({ length: 100 }, (_, i) => ({
        ...first,
        id: `reading-${i}`,
      })),
      activeReadingId: "reading-99",
    };
    const last = revision(original, "reading-100");
    expect(() => appendReading(full, last)).toThrow();
    expect(full.readingRevisions).toHaveLength(100);
    expect(full.activeReadingId).toBe("reading-99");
  });

  it("isolates a damaged active revision, falls back to the prior readable version, and never rewrites the chart", () => {
    const original = baseReport();
    const first = revision(original);
    const second = revision(original, "reading-broken");
    second.interpretation.reasoning[0].clauseIds = ["nonexistent-clause"];
    const damaged = append(append(original, first), second);
    const restored = normalizeReport(damaged)!;
    expect(restored.chart).toEqual(original.chart);
    expect(restored.readingRevisions).toEqual([first]);
    expect(activeReading(restored)).toEqual(first);
    expect(restored.warnings!.join("")).toContain("已隔离");
    expect(restored.warnings!.join("")).toContain("最近可读版本");
  });

  it("an unknown active ID falls back to the last valid revision and a completely invalid revision list preserves the original", () => {
    const original = baseReport();
    const first = revision(original);
    const current = append(original, first);
    const selected = normalizeReport({
      ...current,
      activeReadingId: "missing-id",
    })!;
    expect(activeReading(selected)).toEqual(first);
    const broken = normalizeReport({
      ...current,
      readingRevisions: [{ bad: true }],
    })!;
    expect(broken.chart).toEqual(original.chart);
    expect(broken.readingRevisions).toEqual([]);
    expect(broken.activeReadingId).toBeNull();
  });

  it("a malformed active selector is optional archive damage, so the chart and readable revision remain recoverable", () => {
    const original = baseReport();
    const first = revision(original);
    const restored = normalizeReport({
      ...append(original, first),
      activeReadingId: { invalid: true },
    });
    expect(restored).not.toBeNull();
    expect(restored!.chart).toEqual(original.chart);
    expect(activeReading(restored!)).toEqual(first);
  });

  it("keeps relative-time anchoring at the original question time even when generation happens much later", () => {
    const original = baseReport();
    original.question = "今晚吃松林食堂怎么样？";
    original.intent = localIntent(original.question, "general");
    const value = revision(
      original,
      "later-reading",
      "2027-01-01T00:00:00.000Z",
    );
    const restored = normalizeReport(append(original, value))!;
    expect(activeReading(restored)!.createdAt).toBe("2027-01-01T00:00:00.000Z");
    expect(activeReading(restored)!.questionAskedAt).toBe(original.createdAt);
    expect(activeReading(restored)!.meta.questionAskedAt).toBe(
      original.createdAt,
    );
    expect(activeReading(restored)!.intent.meaning!.time).toMatchObject({
      value: "今晚",
      dateBasis: "relative",
    });
    const drifted = structuredClone(value);
    drifted.questionAskedAt = drifted.createdAt;
    drifted.meta.questionAskedAt = drifted.createdAt;
    const rejected = normalizeReport(append(original, drifted))!;
    expect(rejected.readingRevisions).toEqual([]);
    expect(rejected.chart).toEqual(original.chart);
  });

  it("redacts accidental credentials throughout V3 prose and snapshots before saving or exporting", () => {
    const original = baseReport();
    const reading = revision(original);
    const secret = "sk-fictional-audit-token-only";
    reading.interpretation.summary += ` 附注：${secret}`;
    reading.interpretation.reasoning[0].application += ` ${secret}`;
    reading.context.sources[0].reviewNote += ` ${secret}`;
    reading.context.sources[0].quote += ` ${secret}`;
    reading.context.assessments[0].caveats.push(`附注：${secret}`);
    reading.intent.meaning!.goal.value += ` ${secret}`;
    const restored = normalizeReport(append(original, reading))!;
    expect(activeReading(restored)).toBeDefined();
    const encoded = serializeReport(restored);
    expect(encoded.includes(secret)).toBe(false);
    expect(encoded).toContain("[已移除密钥]");
    expect(restored.chart).toEqual(original.chart);
  });

  it("redacts a credential mentioned in the original question consistently with its meaning references", () => {
    const original = baseReport();
    const secret = "sk-fictional-source-token-only";
    original.question += ` 备注：${secret}`;
    original.intent = localIntent(original.question, "general");
    const value = revision(original);
    const restored = normalizeReport(append(original, value))!;
    expect(restored.question).not.toContain(secret);
    expect(restored.intent).toBeDefined();
    expect(activeReading(restored)).toBeDefined();
    expect(serializeReport(restored)).not.toContain(secret);
    expect(
      activeReading(restored)!.intent.meaning!.focus.refs[0].quote,
    ).toContain("[已移除密钥]");
  });

  it("persists historical derived facts in the reading snapshot while preserving original chart facts exactly", () => {
    const original = baseReport();
    const reading = revision(original);
    const derived = {
      id: "historic-derived-state",
      label: "历史派生条件",
      value: "当时据原盘推得的条件",
      sourceIds: ["test-source"],
    };
    reading.context.facts.push(derived);
    reading.context.assessments[0].factIds.push(derived.id);
    reading.interpretation.reasoning[0].factIds = [derived.id];
    saveReport(append(original, reading));
    const restored = readReports()[0];
    expect(restored.chart).toEqual(original.chart);
    expect(restored.chart.facts.some((f) => f.id === derived.id)).toBe(false);
    expect(activeReading(restored)!.context.facts).toContainEqual(derived);
    expect(
      activeReading(restored)!.interpretation.reasoning[0].factIds,
    ).toEqual([derived.id]);
  });

  it("preserves V2 clarification answers while a revision independently records its own sourced correction", () => {
    const original = baseReport();
    original.question = "这个安排合适吗？";
    original.clarificationAnswers = { object: "晚上吃松林食堂怎么样？" };
    original.intent = resolveIntent(
      localIntent(original.question, "general"),
      original.clarificationAnswers,
      original.question,
    );
    saveReport(original);
    const reading = revision(original);
    reading.answers = { object: "下午吃松林食堂怎么样？" };
    reading.intent = resolveIntent(
      localIntent(original.question, "general"),
      reading.answers,
      original.question,
    );
    const current = append(original, reading);
    saveReport(current);
    const restored = readReports()[0];
    expect(restored.clarificationAnswers).toEqual(
      original.clarificationAnswers,
    );
    expect(restored.intent).toEqual(original.intent);
    expect(activeReading(restored)!.answers).toEqual(reading.answers);
    expect(activeReading(restored)!.intent.meaning!.time).toMatchObject({
      value: "下午",
      refs: [{ source: "answer:object", quote: "下午" }],
    });
    expect(restored.question).toBe("这个安排合适吗？");
  });

  it("accepts only explicitly compatible engine/rule pairs for an updated interpretation without changing historical charts", () => {
    const original = baseReport();
    expect(canInterpretChart(original)).toBe(true);
    const oldEngine = structuredClone(original);
    oldEngine.chart.engineVersion = "unrecognized-engine";
    expect(canInterpretChart(oldEngine)).toBe(false);
    expect(normalizeReport(oldEngine)!.chart).toEqual(oldEngine.chart);
    const oldRule = structuredClone(original);
    oldRule.chart.ruleVersion = "different-school-rule";
    expect(canInterpretChart(oldRule)).toBe(false);
  });

  it.each(["corpusVersion", "assessmentVersion", "generatedAt"] as const)(
    "isolates a revision whose %s metadata disagrees with its archived snapshot",
    (key) => {
      const original = baseReport();
      const value = revision(original);
      value.meta[key] =
        key === "generatedAt"
          ? "2027-01-01T00:00:00.000Z"
          : "different-snapshot-version";
      const restored = normalizeReport(append(original, value))!;
      expect(restored.chart).toEqual(original.chart);
      expect(restored.readingRevisions).toEqual([]);
      expect(restored.warnings!.join("")).toContain("已隔离");
    },
  );
});
