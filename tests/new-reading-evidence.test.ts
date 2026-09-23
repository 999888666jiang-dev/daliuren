import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { castManual } from "../src/core";
import { BRANCHES, STEMS } from "../src/core/constants";
import { assessRules } from "../src/ai/assessments";
import { buildReadingContext } from "../src/ai/reading-assessments";
import { validateReadingContext } from "../src/ai/reading-validation";
import {
  generalReadingSourceIds,
  readingEvidence,
} from "../src/data/reading-evidence";
import verifiedPages from "../library/verified-pages.json";

describe("V3 scanned sources and derived reading facts", () => {
  it("covers all twelve heavenly generals with reviewed clauses", () => {
    expect(Object.keys(generalReadingSourceIds).sort()).toEqual(
      [
        "贵人",
        "螣蛇",
        "朱雀",
        "六合",
        "勾陈",
        "青龙",
        "天空",
        "白虎",
        "太常",
        "玄武",
        "太阴",
        "天后",
      ].sort(),
    );
    for (const sourceId of Object.values(generalReadingSourceIds)) {
      expect(
        readingEvidence.find((source) => source.id === sourceId)?.verification,
      ).toBe("verified");
    }
  });
  it("uses exact client-owned clauses from recorded scan images", () => {
    for (const source of readingEvidence) {
      expect(source.verification).toBe("verified");
      expect(
        source.clauses.every((clause) => source.quote.includes(clause.text)),
      ).toBe(true);
      const path = `public/${source.imageUrl}`;
      const page = verifiedPages.pages.find((item) => item.path === path);
      expect(page, source.id).toBeDefined();
      expect(
        createHash("sha256").update(readFileSync(path)).digest("hex"),
        source.id,
      ).toBe(page!.sha256);
    }
  });
  it("preserves chart facts and snapshots through the entire 720-chart date/rotation sample", () => {
    for (let day = 0; day < 60; day++) {
      for (const hourBranch of BRANCHES) {
        const chart = castManual({
          dayStem: STEMS[day % 10],
          dayBranch: BRANCHES[day % 12],
          monthGeneral: "子",
          hourBranch,
          daytime: true,
        });
        const frozen = JSON.stringify(chart);
        const context = buildReadingContext(chart, "general");
        expect(validateReadingContext(context, chart)).toEqual(context);
        expect(JSON.stringify(chart)).toBe(frozen);
        expect(context.facts.slice(0, chart.facts.length)).toEqual(chart.facts);
        expect(
          context.assessments.some(
            (item) => item.id === "principle-three-stages",
          ),
        ).toBe(true);
        expect(
          context.assessments.some(
            (item) => item.id === "principle-combined-conditions",
          ),
        ).toBe(true);
        const usedClauses = new Set(
          context.assessments.flatMap((item) => item.clauseIds),
        );
        expect(
          context.sources.every((source) =>
            source.clauses.some((clause) => usedClauses.has(clause.id)),
          ),
        ).toBe(true);
        expect(
          context.assessments
            .filter(
              (item) => item.kind === "judgement" && item.status === "met",
            )
            .map((item) => item.id),
        ).toEqual(
          assessRules(chart, "general")
            .filter(
              (item) => item.kind === "judgement" && item.status === "met",
            )
            .map((item) => item.id),
        );
      }
    }
  });
  it("does not turn isolated heavenly-general symbolism into a conclusive judgement", () => {
    const chart = castManual({
      dayStem: "甲",
      dayBranch: "子",
      monthGeneral: "子",
      hourBranch: "午",
      daytime: true,
    });
    const context = buildReadingContext(chart, "business");
    expect(validateReadingContext(context, chart)).toEqual(context);
    const wealth = context.assessments.find(
      (item) => item.id === "principle-wealth-qinglong",
    )!;
    expect(wealth.kind).toBe("principle");
    const qinglong = context.facts.find(
      (item) => item.id === "reading-qinglong-location",
    )!;
    expect(qinglong.value).toContain(
      `青龙乘${chart.heavenPlate[chart.generals.indexOf("青龙")]}`,
    );
    expect(
      buildReadingContext(chart, "travel").assessments.some(
        (item) => item.id === "principle-wealth-qinglong",
      ),
    ).toBe(false);
    const symbols = context.assessments.filter((item) =>
      item.id.startsWith("principle-cuiyan-general"),
    );
    expect(symbols.length).toBeGreaterThan(0);
    for (const symbol of symbols) {
      expect(symbol.kind).toBe("principle");
      expect(symbol.caveats.join(" ")).toContain("未完整实现");
      expect(symbol.caveats.join(" ")).toContain("单一天将");
    }
    for (const [index, transmission] of chart.transmissions.entries()) {
      const detail = context.facts.find(
        (item) => item.id === `reading-transmission-${index + 1}-detail`,
      )!.value;
      expect(detail).toContain(transmission.general);
      expect(detail).toContain(transmission.relative);
      expect(detail).toContain(transmission.branch);
      expect(detail).toContain(transmission.isVoid ? "本支旬空" : "本支不旬空");
    }
  });
});
