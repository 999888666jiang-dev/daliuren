import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cast, castManual } from "../src/core";
import type { Interpretation } from "../src/core/types";
import { CORPUS_VERSION, selectEvidence } from "../src/data/evidence";
import { assessRules } from "../src/ai/assessments";
import { localIntent, resolveIntent } from "../src/ai/intent";
import {
  exportReport,
  normalizeReport,
  readReports,
  removeReport,
  saveReport,
  serializeReport,
  type Report,
} from "../src/lib/report";

const oldKey = "guanxiang.reports.v1";
const key = "guanxiang.reports.v2";
let stored: Map<string, string>;
let storage: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};
function report(createdAt = "2026-09-23T02:00:00.000Z"): Report {
  const chart = cast({
    datetime: "2026-09-23T10:00:00",
    timeBasis: "standard",
  });
  return {
    schemaVersion: 2,
    id: `report-${createdAt}`,
    categoryChoice: "auto",
    question: "我下周面试能通过吗？",
    category: "career",
    place: "未提供地点",
    createdAt,
    chart,
    evidenceSnapshot: selectEvidence(chart, "career"),
    corpusVersion: CORPUS_VERSION,
  };
}
function legacy() {
  const current = report();
  const { id: _id, categoryChoice: _choice, ...rest } = current;
  return { ...rest, schemaVersion: 1 };
}
function oldAi(): Interpretation {
  return {
    summary: "这是旧版现代解读。",
    observations: [
      { text: "先核实面试要求。", factIds: ["day"], evidenceIds: [] },
    ],
    advice: ["核实面试安排。"],
    missingInformation: [],
    limitations: ["不能据此保证结果。"],
  };
}
beforeEach(() => {
  stored = new Map();
  storage = {
    getItem: vi.fn((k: string) => stored.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      stored.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      stored.delete(k);
    }),
  };
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("versioned, defensively projected reports", () => {
  it("uses the same 500-character answer bound as the UI and model client", () => {
    const current = report();
    const value = "补".repeat(500);
    const accepted = normalizeReport({
      ...current,
      clarificationAnswers: { object: value },
    })!;
    expect(accepted.clarificationAnswers).toEqual({ object: value });
    const rejected = normalizeReport({
      ...current,
      clarificationAnswers: { object: value + "补" },
    })!;
    expect(rejected.clarificationAnswers).toBeUndefined();
    expect(rejected.chart).toEqual(current.chart);
    expect(rejected.warnings!.join("")).toContain("澄清答案格式损坏");
  });
  it("accepts the maximum question and two bounded answers within the combined source limit", () => {
    const current = report();
    current.question = "面试" + "问".repeat(1198);
    current.intent = localIntent(current.question, "auto");
    current.clarificationAnswers = {
      category: "事".repeat(500),
      object: "人".repeat(500),
    };
    const restored = normalizeReport(current)!;
    expect(restored.intent).toEqual(current.intent);
    expect(restored.clarificationAnswers).toEqual(current.clarificationAnswers);
  });
  it("saves v2 separately and preserves the exact original v1 storage", () => {
    const original = JSON.stringify([legacy()]);
    stored.set(oldKey, original);
    const current = report("2026-09-23T03:00:00.000Z");
    saveReport(current);
    expect(stored.get(oldKey)).toBe(original);
    expect(JSON.parse(stored.get(key)!)[0].schemaVersion).toBe(2);
    expect(readReports().map((r) => r.createdAt)).toEqual([
      current.createdAt,
      legacy().createdAt,
    ]);
  });
  it("normalizes legacy IDs and preserves historical chart values without recasting", () => {
    const old = legacy();
    old.chart.engineVersion = "historical-engine";
    old.chart.method.detail = "历史报告当时记录的取法说明";
    const result = normalizeReport(old)!;
    expect(result.schemaVersion).toBe(2);
    expect(result.id).toBe(`legacy-${old.chart.id}-${old.createdAt}`);
    expect(result.chart).toEqual(old.chart);
    expect(result.categoryChoice).toBe("career");
  });
  it("deduplicates by createdAt with valid v2 taking precedence and caps at thirty", () => {
    stored.set(oldKey, JSON.stringify([legacy()]));
    const replacement = { ...report(), question: "我下周的面试安排如何？" };
    stored.set(key, JSON.stringify([replacement]));
    expect(readReports()).toHaveLength(1);
    expect(readReports()[0].question).toBe(replacement.question);
    for (let i = 0; i < 34; i++)
      saveReport(report(new Date(Date.UTC(2026, 8, 24, 0, i)).toISOString()));
    expect(readReports()).toHaveLength(30);
  });
  it("isolates corrupt entries and corrupt storage versions", () => {
    stored.set(oldKey, "{broken");
    stored.set(
      key,
      JSON.stringify([
        null,
        { schemaVersion: 2 },
        report(),
        {
          ...report(),
          chart: { ...report().chart, transmissions: [{ branch: "假" }] },
        },
      ]),
    );
    expect(readReports()).toHaveLength(1);
  });
  it("rejects every malformed nested rendered chart field", () => {
    const base = report();
    const invalid = [
      { lessons: [null, null, null, null] },
      { transmissions: [null, null, null] },
      { heavenPlate: Array(12).fill("子") },
      { generals: Array(12).fill("贵人") },
      { voids: ["子", "假"] },
      { facts: [{ id: "day", label: {}, value: "甲子", sourceIds: [] }] },
      { trace: [{ id: "x", title: "x", detail: ["bad"], sourceIds: [] }] },
      { profileWarnings: [{}] },
      { method: { name: "未知取法", detail: "bad" } },
      { time: { ...base.chart.time, selected: "not a date" } },
      { input: { datetime: "2026-02-31T10:00", timeBasis: "standard" } },
    ];
    for (const patch of invalid)
      expect(
        normalizeReport({ ...base, chart: { ...base.chart, ...patch } }),
      ).toBeNull();
  });
  it("keeps a valid primary chart when optional comparison or source entries are damaged", () => {
    const base = report();
    const result = normalizeReport({
      ...base,
      comparison: { invalid: true },
      evidenceSnapshot: [...base.evidenceSnapshot!, { id: "bad", quote: [] }],
    })!;
    expect(result.chart).toEqual(base.chart);
    expect(result.comparison).toBeUndefined();
    expect(result.evidenceSnapshot).toEqual(base.evidenceSnapshot);
    expect(result.warnings!.length).toBeGreaterThanOrEqual(2);
  });
  it("preserves lack of old evidence snapshot instead of filling it from current corpus", () => {
    const old = {
      ...legacy(),
      evidenceSnapshot: undefined,
      corpusVersion: undefined,
    };
    const result = normalizeReport(old)!;
    expect(result.evidenceSnapshot).toBeUndefined();
    expect(result.corpusVersion).toBeUndefined();
    expect(result.warnings!.join("")).toContain("未保存引文快照");
  });
  it("keeps valid old AI in its legacy field and drops damaged old AI independently", () => {
    const result = normalizeReport({ ...legacy(), interpretation: oldAi() })!;
    expect(result.legacyInterpretation).toEqual(oldAi());
    expect(result.interpretation).toBeUndefined();
    const damaged = normalizeReport({
      ...legacy(),
      interpretation: {
        ...oldAi(),
        observations: [
          { text: "错误", factIds: ["invented"], evidenceIds: [] },
        ],
      },
    })!;
    expect(damaged.chart).toEqual(legacy().chart);
    expect(damaged.legacyInterpretation).toBeUndefined();
    expect(damaged.warnings!.join("")).toContain("旧版解读损坏");
  });
  it("cannot retrospectively authenticate old AI citations without its original snapshot", () => {
    const ai = oldAi();
    ai.observations[0].evidenceIds = ["daquan-jigong"];
    expect(
      normalizeReport({
        ...legacy(),
        evidenceSnapshot: undefined,
        interpretation: ai,
      })!.legacyInterpretation,
    ).toBeUndefined();
  });
  it("round-trips resolved intent and structurally validated v2 explanation", () => {
    const current = report();
    current.question = "能成功吗？";
    current.clarificationAnswers = { object: "我下周的面试" };
    current.intent = resolveIntent(
      localIntent(current.question, "auto"),
      current.clarificationAnswers,
    );
    current.assessments = assessRules(current.chart, current.category);
    current.interpretation = {
      summary: "请先核实面试安排。",
      observations: [
        {
          kind: "context",
          text: "盘面不能替代对面试要求的核查。",
          factIds: ["day"],
          evidenceIds: [],
          assessmentIds: [],
        },
      ],
      advice: ["确认时间与岗位要求。"],
      missingInformation: [],
      limitations: ["不能保证面试结果。"],
    };
    const restored = normalizeReport(JSON.parse(serializeReport(current)))!;
    expect(restored.intent).toEqual(current.intent);
    expect(restored.assessments).toEqual(current.assessments);
    expect(restored.interpretation).toEqual(current.interpretation);
  });
  it("drops bad v2 interpretation and assessment separately while keeping the chart", () => {
    const current = report();
    const result = normalizeReport({
      ...current,
      assessments: [{ id: "bad", factIds: ["invented"] }],
      interpretation: { summary: "bad" },
    })!;
    expect(result.chart).toEqual(current.chart);
    expect(result.assessments).toBeUndefined();
    expect(result.interpretation).toBeUndefined();
    expect(result.warnings!.length).toBeGreaterThanOrEqual(2);
  });
  it("removes extra credential fields at every known nesting level and masks key-like prose", () => {
    const current = report();
    const secret = "sk-report-regression-secret-only";
    const injected = {
      ...current,
      apiKey: secret,
      secret,
      question: `${current.question}${secret}`,
      chart: {
        ...current.chart,
        apiKey: secret,
        input: { ...current.chart.input, apiKey: secret },
        facts: current.chart.facts.map((f) => ({
          ...f,
          value: `${f.value} ${secret}`,
          secret,
        })),
      },
      aiMeta: {
        model: "test-model",
        promptVersion: "test",
        apiKey: secret,
        nested: { secret },
      },
      evidenceSnapshot: current.evidenceSnapshot!.map((e) => ({
        ...e,
        apiKey: secret,
        quote: `${e.quote} ${secret}`,
      })),
    };
    const normalized = normalizeReport(injected)!;
    const encoded = serializeReport(normalized);
    expect(encoded).not.toContain(secret);
    expect(encoded).not.toContain("apiKey");
    expect(encoded).not.toContain('"secret"');
    expect(encoded).toContain("[已移除密钥]");
    expect(normalized.aiMeta).toEqual({
      model: "test-model",
      promptVersion: "test",
    });
  });
  it("never accepts script URLs in stored references", () => {
    const current = report();
    const result = normalizeReport({
      ...current,
      evidenceSnapshot: [
        { ...current.evidenceSnapshot![0], sourceUrl: "javascript:alert(1)" },
      ],
    })!;
    expect(result.evidenceSnapshot).toEqual([]);
    expect(result.warnings!.join("")).toContain("引文快照损坏");
  });
  it("accepts manual historical charts without fabricating a UTC or computed time", () => {
    const current = report();
    current.chart = castManual({
      dayStem: "甲",
      dayBranch: "子",
      monthGeneral: "子",
      hourBranch: "子",
      daytime: true,
    });
    const restored = normalizeReport(current)!;
    expect(restored.chart).toEqual(current.chart);
    expect(restored.chart.time).toBeUndefined();
  });
});

describe("storage failures and export", () => {
  it("storage denial never mutates an unsaved report", () => {
    const current = report();
    const before = structuredClone(current);
    storage.getItem.mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(readReports()).toEqual([]);
    expect(() => saveReport(current)).toThrow();
    expect(current).toEqual(before);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("quota failure leaves existing storage and the current report untouched", () => {
    const previous = JSON.stringify([report()]);
    stored.set(key, previous);
    const current = report("2026-09-24T02:00:00.000Z");
    storage.setItem.mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveReport(current)).toThrow();
    expect(stored.get(key)).toBe(previous);
    expect(current.id).toBe(`report-${current.createdAt}`);
  });
  it("does not overwrite a corrupt current storage array during a save attempt", () => {
    stored.set(key, "broken");
    expect(() => saveReport(report())).toThrow();
    expect(stored.get(key)).toBe("broken");
  });
  it("removes a report from both versions and preserves unrelated records", () => {
    stored.set(oldKey, JSON.stringify([legacy()]));
    stored.set(
      key,
      JSON.stringify([report(), report("2026-09-24T02:00:00.000Z")]),
    );
    removeReport(report().createdAt);
    expect(JSON.parse(stored.get(oldKey)!)).toEqual([]);
    expect(readReports()).toHaveLength(1);
    expect(readReports()[0].createdAt).toBe("2026-09-24T02:00:00.000Z");
  });
  it("restores the first version if writing the second version fails during removal", () => {
    const previous = JSON.stringify([report()]);
    const old = JSON.stringify([legacy()]);
    stored.set(key, previous);
    stored.set(oldKey, old);
    storage.setItem.mockImplementation((k: string, value: string) => {
      if (k === oldKey) throw new DOMException("denied", "SecurityError");
      stored.set(k, value);
    });
    expect(() => removeReport(report().createdAt)).toThrow();
    expect(stored.get(key)).toBe(previous);
    expect(stored.get(oldKey)).toBe(old);
  });
  it("exports only the projected report contents", async () => {
    const current = report();
    let exported: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      exported = blob as Blob;
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.fn();
    vi.stubGlobal("document", {
      createElement: () => ({ click, href: "", download: "" }),
    });
    exportReport(current);
    expect(click).toHaveBeenCalledOnce();
    expect(JSON.parse(await exported!.text()).schemaVersion).toBe(2);
  });
});
