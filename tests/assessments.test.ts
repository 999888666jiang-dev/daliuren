import { describe, expect, it } from "vitest";
import { assessRules } from "../src/ai/assessments";
import { BRANCHES, STEMS, castManual } from "../src/core";
import type { Branch, Category, ChartResult, Stem } from "../src/core/types";
import { evidence } from "../src/data/evidence";

// Predicate fixtures, not classical golden charts. Expectations are stated independently.
function fixture(
  stem: Stem,
  transmissions: Branch[],
  voids: Branch[] = [],
): ChartResult {
  const base = castManual({
    dayStem: "甲",
    dayBranch: "子",
    monthGeneral: "子",
    hourBranch: "子",
    daytime: true,
  });
  return {
    ...base,
    day: { stem, branch: "子" },
    heavenPlate: [...BRANCHES],
    voids,
    transmissions: transmissions.map((branch) => ({
      branch,
      isVoid: voids.includes(branch),
      hiddenStem: null,
      relative: "",
      general: "",
    })),
    generals: Array(12).fill("贵人"),
  };
}
const rule = (chart: ChartResult, id: string, category: Category = "career") =>
  assessRules(chart, category).find((a) => a.id === id)!;

describe("auditable reviewed-rule assessments", () => {
  it("missing procedure facts remain unknown and name the missing requirement", () => {
    const chart = fixture("甲", ["寅", "巳", "申"]);
    chart.facts = chart.facts.filter(
      (f) => f.id !== "lesson-4" && f.id !== "transmission-3",
    );
    for (const id of ["procedure-jigong", "procedure-transmissions"]) {
      expect(rule(chart, id).status).toBe("unknown");
      expect(rule(chart, id).missingInputs.length).toBeGreaterThan(0);
    }
  });
  it("keeps procedure explanations distinct from judgements", () => {
    const result = assessRules(fixture("甲", ["寅", "巳", "申"]), "career");
    expect(
      result.filter((a) => a.kind === "procedure").map((a) => a.id),
    ).toEqual(["procedure-jigong", "procedure-transmissions"]);
    expect(
      result
        .filter((a) => a.kind === "procedure")
        .every(
          (a) =>
            a.status === "met" && a.caveats.some((c) => c.includes("吉凶")),
        ),
    ).toBe(true);
  });
  it("requires both void day-upper and Sky general, using the correct ground seat", () => {
    const chart = fixture("甲", ["辰", "申", "子"], ["卯"]);
    chart.lessons[0].upper = "卯";
    chart.heavenPlate = [...BRANCHES.slice(1), BRANCHES[0]];
    chart.generals[3] = "天空";
    expect(rule(chart, "bifa-016").status).toBe("not_met");
    chart.generals[2] = "天空";
    expect(rule(chart, "bifa-016").status).toBe("met");
    chart.voids = [];
    expect(rule(chart, "bifa-016").status).toBe("not_met");
    chart.generals = [];
    expect(rule(chart, "bifa-016").status).toBe("unknown");
  });
  it("requires a complete generating chain reaching the day stem in either direction", () => {
    expect(rule(fixture("甲", ["辰", "申", "子"]), "bifa-031").status).toBe(
      "met",
    );
    expect(rule(fixture("甲", ["子", "申", "辰"]), "bifa-031").status).toBe(
      "met",
    );
    expect(rule(fixture("丙", ["辰", "申", "子"]), "bifa-031").status).toBe(
      "not_met",
    );
    expect(rule(fixture("甲", ["辰", "申"]), "bifa-031").status).toBe(
      "unknown",
    );
  });
  it("limits recommendation rules to the reviewed category scope", () => {
    for (const category of ["relationship", "travel", "lost"] as const) {
      const chart = fixture("甲", ["辰", "申", "子"], ["子"]);
      expect(rule(chart, "bifa-031", category).status).toBe("not_applicable");
      expect(rule(chart, "bifa-031-void", category).status).toBe(
        "not_applicable",
      );
    }
  });
  it("void makes the recommendation unknown, while only the exception's structural trigger is met", () => {
    const chart = fixture("甲", ["辰", "申", "子"], ["子", "丑"]);
    expect(rule(chart, "bifa-031").status).toBe("unknown");
    const condition = rule(chart, "bifa-031-void");
    expect(condition.status).toBe("met");
    expect(condition.caveats.join("")).toContain("不能依据本条断定必败");
    expect(condition.missingInputs).toContain("年命填实规则未实现");
    chart.manualInput!.natalBranch = "子";
    chart.manualInput!.annualBranch = "子";
    expect(rule(chart, "bifa-031").status).toBe("unknown");
    expect(rule(chart, "bifa-031-void").caveats.join("")).toContain(
      "年命填实未判",
    );
  });
  it("distinguishes a branch void from a void ground seat", () => {
    const chart = fixture("甲", ["辰", "申", "子"], ["亥"]);
    expect(rule(chart, "bifa-031").status).toBe("met");
    chart.heavenPlate = [...BRANCHES.slice(1), BRANCHES[0]];
    expect(rule(chart, "bifa-031").status).toBe("unknown");
    expect(rule(chart, "bifa-031-void").status).toBe("met");
  });
  it("never claims an empty condition without both a life chain and calculable voids", () => {
    expect(
      rule(fixture("丙", ["辰", "申", "子"], ["子"]), "bifa-031-void").status,
    ).toBe("not_met");
    const unknown = fixture("甲", ["辰", "申", "子"]);
    unknown.facts = unknown.facts.filter((f) => f.id !== "voids");
    expect(rule(unknown, "bifa-031").status).toBe("unknown");
    expect(rule(unknown, "bifa-031-void").status).toBe("unknown");
  });
  it("requires both directions of a full controlling chain reaching the day", () => {
    expect(rule(fixture("丙", ["寅", "辰", "子"]), "bifa-032").status).toBe(
      "met",
    );
    expect(rule(fixture("丙", ["子", "辰", "寅"]), "bifa-032").status).toBe(
      "met",
    );
    expect(rule(fixture("甲", ["寅", "辰", "子"]), "bifa-032").status).toBe(
      "not_met",
    );
    const unknown = fixture("丙", ["寅", "辰", "子"]);
    unknown.facts = unknown.facts.filter((f) => f.id !== "day");
    expect(rule(unknown, "bifa-032").status).toBe("unknown");
    expect(rule(unknown, "bifa-032").caveats.join("")).toContain(
      "不能指认具体人物",
    );
  });
  it("all 720 charts use existing facts and verified evidence, with no unsupported met judgement", () => {
    const reviewed = new Set(
      evidence.filter((e) => e.verification === "verified").map((e) => e.id),
    );
    for (let day = 0; day < 60; day++)
      for (const monthGeneral of BRANCHES) {
        const chart = castManual({
          dayStem: STEMS[day % 10],
          dayBranch: BRANCHES[day % 12],
          monthGeneral,
          hourBranch: "子",
          daytime: true,
        });
        const before = JSON.stringify(chart);
        const result = assessRules(chart, "career");
        expect(new Set(result.map((a) => a.id)).size).toBe(result.length);
        for (const item of result) {
          for (const id of item.factIds)
            expect(chart.facts.some((f) => f.id === id)).toBe(true);
          for (const id of item.evidenceIds)
            expect(reviewed.has(id)).toBe(true);
          if (item.status === "met") {
            expect(item.factIds.length).toBeGreaterThan(0);
            expect(item.evidenceIds.length).toBeGreaterThan(0);
          }
        }
        expect(JSON.stringify(chart)).toBe(before);
      }
  });
});
