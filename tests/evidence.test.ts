import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { castManual, BRANCHES, STEMS } from "../src/core";
import type { Branch, ChartResult, Stem } from "../src/core/types";
import { bifaIndex } from "../src/data/bifa-index";
import { evidence, matchBifa, selectEvidence } from "../src/data/evidence";

// These are deliberately predicate fixtures, not ancient golden-chart cases.
function predicateFixture(
  stem: Stem,
  transmissions: Branch[],
  voids: Branch[] = [],
): ChartResult {
  const chart = castManual({
    dayStem: "甲",
    dayBranch: "子",
    monthGeneral: "子",
    hourBranch: "子",
    daytime: true,
  });
  return {
    ...chart,
    day: { stem, branch: "子" },
    voids,
    heavenPlate: [...BRANCHES],
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
const ids = (chart: ChartResult) => matchBifa(chart).map((m) => m.evidenceId);

describe("reviewed evidence and applicability", () => {
  it("requires the generating chain to reach the day stem", () => {
    expect(ids(predicateFixture("甲", ["辰", "申", "子"]))).toContain(
      "bifa-031",
    );
    expect(ids(predicateFixture("甲", ["子", "申", "辰"]))).toContain(
      "bifa-031",
    );
    expect(ids(predicateFixture("丙", ["辰", "申", "子"]))).not.toContain(
      "bifa-031",
    );
  });
  it("quotes the exception, not an unconditional recommendation, when the chain is void", () => {
    const chart = predicateFixture("甲", ["辰", "申", "子"], ["子", "丑"]);
    expect(ids(chart)).toContain("bifa-031-void");
    expect(ids(chart)).not.toContain("bifa-031");
    const seated = predicateFixture("甲", ["辰", "申", "子"], ["亥"]);
    seated.heavenPlate = [...BRANCHES.slice(1), BRANCHES[0]];
    expect(ids(seated)).toContain("bifa-031-void");
  });
  it("does not apply the recommendation clause to an unrelated question category", () => {
    const chart = predicateFixture("甲", ["辰", "申", "子"]);
    expect(matchBifa(chart, "career").map((m) => m.evidenceId)).toContain(
      "bifa-031",
    );
    expect(matchBifa(chart, "lost").map((m) => m.evidenceId)).not.toContain(
      "bifa-031",
    );
  });
  it("requires the controlling chain to reach the day stem in either direction", () => {
    expect(ids(predicateFixture("丙", ["寅", "辰", "子"]))).toContain(
      "bifa-032",
    );
    expect(ids(predicateFixture("丙", ["子", "辰", "寅"]))).toContain(
      "bifa-032",
    );
    expect(ids(predicateFixture("甲", ["寅", "辰", "子"]))).not.toContain(
      "bifa-032",
    );
  });
  it("distinguishes a void branch from void plus Sky general and indexes generals by earth", () => {
    const chart = predicateFixture("甲", ["寅", "巳", "申"], ["卯", "辰"]);
    chart.heavenPlate = [...BRANCHES.slice(1), BRANCHES[0]];
    chart.lessons[0].upper = "卯";
    chart.generals[3] = "天空";
    expect(ids(chart)).not.toContain("bifa-016");
    chart.generals[2] = "天空";
    expect(ids(chart)).toContain("bifa-016");
  });
  it("maintains all 100 index entries without declaring pending commentary verified", () => {
    expect(bifaIndex.map((r) => r.number)).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
    expect(bifaIndex.filter((r) => r.verification === "pending")).toHaveLength(
      97,
    );
    expect(
      bifaIndex
        .filter((r) => r.titleVerification === "pending")
        .map((r) => r.number),
    ).toEqual([42, 52, 66, 84]);
    for (const item of bifaIndex)
      for (const id of item.evidenceIds)
        expect(evidence.some((r) => r.id === id)).toBe(true);
  });
  it("all 720 charts select only verified existing quotations and all trace citations resolve", () => {
    for (let day = 0; day < 60; day++)
      for (const monthGeneral of BRANCHES) {
        const chart = castManual({
          dayStem: STEMS[day % 10],
          dayBranch: BRANCHES[day % 12],
          monthGeneral,
          hourBranch: "子",
          daytime: true,
        });
        for (const item of selectEvidence(chart))
          expect(item.verification).toBe("verified");
        for (const step of chart.trace)
          for (const id of step.sourceIds)
            expect(
              evidence.some((r) => r.id === id),
              id,
            ).toBe(true);
      }
  });
  it("ships the actual reviewed page for every quotation and every heading", () => {
    for (const record of [...evidence, ...bifaIndex])
      expect(existsSync(`public/${record.imageUrl}`), record.imageUrl).toBe(
        true,
      );
    expect(new Set(evidence.map((r) => r.id)).size).toBe(evidence.length);
  });
  it("keeps shipped source page hashes aligned with the editorial manifest", () => {
    const manifest = JSON.parse(
      readFileSync("library/verified-pages.json", "utf8"),
    );
    for (const page of manifest.pages) {
      const buffer = readFileSync(page.path);
      expect(createHash("sha256").update(buffer).digest("hex"), page.path).toBe(
        page.sha256,
      );
    }
  });
});
