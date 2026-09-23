import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRANCHES,
  cast,
  castManual,
  chartStructureSignature,
  hasEquivalentChart,
  withPersonalContext,
} from "../src/core";
import type { Branch, CastInput, ChartResult } from "../src/core";
import * as calendarModule from "../src/core/calendar";
import * as rulesModule from "../src/core/rules";

const standard: CastInput = {
  datetime: "2026-09-23T12:30:00",
  timeBasis: "standard",
};

function plate(chart: ChartResult) {
  return {
    day: chart.day,
    monthGeneral: chart.monthGeneral,
    hourBranch: chart.hourBranch,
    daytime: chart.daytime,
    heavenPlate: chart.heavenPlate,
    lessons: chart.lessons,
    transmissions: chart.transmissions,
    generals: chart.generals,
    voids: chart.voids,
    method: chart.method,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("casting modes keep reported time separate from the calendar", () => {
  it("defaults to real time and produces the same plate as explicit standard mode", () => {
    const implicit = cast(standard);
    const explicit = cast({ ...standard, castMode: "standard" });
    expect(hasEquivalentChart(implicit, explicit)).toBe(true);
    expect(implicit.casting).toMatchObject({
      mode: "standard",
      realHourBranch: "午",
    });
    expect(implicit.casting).not.toHaveProperty("virtualHourBranch");
    expect(implicit.casting).not.toHaveProperty("number");
    expect(implicit.hourBranch).toBe("午");
  });

  it.each(["2026-09-23T00:30:00", "2026-09-23T12:30:00"])(
    "maps all twelve numbers while preserving real daylight at %s",
    (datetime) => {
      const input: CastInput = { ...standard, datetime };
      const original = cast(input);
      const distinctPlates = new Set<string>();
      for (let number = 1; number <= 12; number++) {
        const living = cast({
          ...input,
          castMode: "living",
          livingNumber: number,
        });
        expect(living.casting).toMatchObject({
          mode: "living",
          number,
          realHourBranch: original.hourBranch,
          virtualHourBranch: BRANCHES[number - 1],
        });
        expect(living.hourBranch).toBe(BRANCHES[number - 1]);
        expect(living.day).toEqual(original.day);
        expect(living.monthGeneral).toBe(original.monthGeneral);
        expect(living.monthBranch).toBe(original.monthBranch);
        expect(living.daytime).toBe(original.daytime);
        expect(living.time).toEqual(original.time);
        expect(living.input!.datetime).toBe(input.datetime);
        const independentlySpecified = castManual({
          dayStem: original.day.stem,
          dayBranch: original.day.branch,
          monthGeneral: original.monthGeneral,
          hourBranch: BRANCHES[number - 1],
          daytime: original.daytime,
        });
        expect(plate(living)).toEqual(plate(independentlySpecified));
        expect(living.heavenPlate[number - 1]).toBe(original.monthGeneral);
        expect(living).toEqual(cast(living.input!));
        distinctPlates.add(chartStructureSignature(living));
      }
      expect(distinctPlates.size).toBe(12);
    },
  );

  it.each([
    { datetime: "2026-09-22T22:59:59", timeBasis: "standard", number: 1 },
    { datetime: "2026-09-22T23:00:00", timeBasis: "standard", number: 12 },
    { datetime: "2026-09-23T00:00:00", timeBasis: "standard", number: 12 },
    { datetime: "2026-09-23T04:59:59", timeBasis: "standard", number: 7 },
    { datetime: "2026-09-23T05:00:00", timeBasis: "standard", number: 1 },
    { datetime: "2026-09-23T16:59:59", timeBasis: "standard", number: 1 },
    { datetime: "2026-09-23T17:00:00", timeBasis: "standard", number: 7 },
    { datetime: "2026-09-23T08:04:00", timeBasis: "standard", number: 12 },
    { datetime: "2026-09-23T08:06:00", timeBasis: "standard", number: 1 },
    { datetime: "2026-09-22T22:55:00", timeBasis: "solar", number: 12 },
    { datetime: "2026-01-01T01:00:00", timeBasis: "solar", number: 7 },
  ] as const)(
    "does not move day/term/daylight boundaries for $datetime ($timeBasis)",
    ({ datetime, timeBasis, number }) => {
      const input: CastInput = {
        datetime,
        timeBasis,
        longitude: timeBasis === "solar" ? 75 : undefined,
      };
      const real = cast(input);
      const living = cast({
        ...input,
        castMode: "living",
        livingNumber: number,
      });
      expect(living.day).toEqual(real.day);
      expect(living.monthGeneral).toBe(real.monthGeneral);
      expect(living.monthBranch).toBe(real.monthBranch);
      expect(living.daytime).toBe(real.daytime);
      expect(living.time).toEqual(real.time);
      expect(living.casting!.realHourBranch).toBe(real.hourBranch);
    },
  );

  it("labels the unchanged result when the reported number equals the real branch", () => {
    const real = cast(standard);
    const living = cast({ ...standard, castMode: "living", livingNumber: 7 });
    expect(hasEquivalentChart(real, living)).toBe(true);
    expect(living.profileWarnings.some((w) => w.includes("不是故障"))).toBe(
      true,
    );
    expect(living.casting!.notice).toContain("流派争议");
    expect(living.casting!.notice).toContain("本网站固定口径");
    const trace = living.trace.find((t) => t.id === "casting-mode")!;
    expect(trace.sourceIds).toEqual([]);
    expect(trace.detail).toContain("不宣称唯一古法");
  });

  it("makes repeated equal numbers reproducible without promising twelve unique outcomes", () => {
    const input: CastInput = {
      ...standard,
      castMode: "living",
      livingNumber: 3,
    };
    const first = cast(input);
    const later = cast({ ...input, datetime: "2026-09-23T12:47:00" });
    expect(first.id).not.toBe(later.id);
    expect(hasEquivalentChart(first, later)).toBe(true);
    expect(first.casting!.notice).toContain("不保证不同问题必有不同结论");
  });

  it.each(["reuse", "advanced", "", null, 1])(
    "rejects invalid mode %s",
    (castMode) => {
      expect(() => cast({ ...standard, castMode } as CastInput)).toThrow(
        "起课模式",
      );
    },
  );

  it.each([undefined, null, 0, 13, -1, 1.5, NaN, Infinity, "3", {}, [3]])(
    "rejects invalid living number %s",
    (livingNumber) => {
      expect(() =>
        cast({ ...standard, castMode: "living", livingNumber } as CastInput),
      ).toThrow("1 至 12 的整数");
    },
  );

  it.each([undefined, "standard"] as const)(
    "rejects an unnoticed number in standard mode %s",
    (castMode) => {
      expect(() => cast({ ...standard, castMode, livingNumber: 5 })).toThrow(
        "正时起课不能携带报数",
      );
    },
  );
});

describe("structural identity is independent of display identifiers", () => {
  it("recognises one plate within a time period while timestamps and personal details differ", () => {
    const a = cast({ ...standard, datetime: "2026-09-23T11:01:00" });
    const b = cast({
      ...standard,
      datetime: "2026-09-23T12:59:00",
      natalBranch: "卯",
      annualBranch: "未",
    });
    expect(a.id).not.toBe(b.id);
    expect(hasEquivalentChart(a, b)).toBe(true);
    expect(hasEquivalentChart(a, { ...b, id: "another-display-id" })).toBe(
      true,
    );
  });

  it("does not assume a whole civil shichen has one plate when a major term changes", () => {
    const before = cast({ ...standard, datetime: "2026-09-23T08:04:00" });
    const after = cast({ ...standard, datetime: "2026-09-23T08:06:00" });
    expect(before.hourBranch).toBe(after.hourBranch);
    expect(before.monthGeneral).not.toBe(after.monthGeneral);
    expect(hasEquivalentChart(before, after)).toBe(false);
  });

  it("distinguishes a changed plate, real daylight, and rule version", () => {
    const base = cast(standard);
    const other = cast({ ...standard, castMode: "living", livingNumber: 1 });
    expect(hasEquivalentChart(base, other)).toBe(false);
    expect(hasEquivalentChart(base, { ...base, daytime: !base.daytime })).toBe(
      false,
    );
    expect(
      hasEquivalentChart(base, { ...base, ruleVersion: "different" }),
    ).toBe(false);
    expect(hasEquivalentChart(base, { ...base, monthBranch: "子" })).toBe(
      false,
    );
  });
});

describe("same-chart continuation never reruns the chart engine", () => {
  it("preserves the original identity and every plate object while switching personal context", () => {
    const original = cast({
      ...standard,
      natalBranch: "寅",
      annualBranch: "酉",
    });
    const serialized = JSON.stringify(original);
    const calendarSpy = vi.spyOn(calendarModule, "calendar");
    const rulesSpy = vi.spyOn(rulesModule, "rules");
    const next = withPersonalContext(original, "卯", "申");
    expect(calendarSpy).not.toHaveBeenCalled();
    expect(rulesSpy).not.toHaveBeenCalled();
    expect(next.id).toBe(original.id);
    for (const key of [
      "day",
      "heavenPlate",
      "lessons",
      "transmissions",
      "generals",
      "voids",
      "method",
      "trace",
      "time",
      "casting",
    ] as const)
      expect(next[key]).toBe(original[key]);
    expect(hasEquivalentChart(next, original)).toBe(true);
    expect(JSON.stringify(original)).toBe(serialized);
    expect(next.input).toMatchObject({ natalBranch: "卯", annualBranch: "申" });
    expect(next.facts.filter((f) => f.id === "natal")).toHaveLength(1);
    expect(next.facts.filter((f) => f.id === "annual")).toHaveLength(1);
    expect(next.facts.find((f) => f.id === "natal")!.value).toContain(
      `上见${original.heavenPlate[3]}，乘${original.generals[3]}`,
    );
    expect(next.facts.find((f) => f.id === "annual")!.value).toContain(
      `上见${original.heavenPlate[8]}，乘${original.generals[8]}`,
    );
  });

  it("clears stale personal data and missing-data warnings accurately over repeated continuations", () => {
    const base = cast(standard);
    const supplied = withPersonalContext(base, "卯", "申");
    expect(
      supplied.profileWarnings.some((w) => w.startsWith("未提供本命")),
    ).toBe(false);
    expect(
      supplied.profileWarnings.some((w) => w.startsWith("未提供行年")),
    ).toBe(false);
    const cleared = withPersonalContext(supplied);
    expect(cleared.input!.natalBranch).toBeUndefined();
    expect(cleared.input!.annualBranch).toBeUndefined();
    expect(
      cleared.facts.some((f) => f.id === "natal" || f.id === "annual"),
    ).toBe(false);
    expect(
      cleared.profileWarnings.filter((w) => w.startsWith("未提供本命")),
    ).toHaveLength(1);
    expect(
      cleared.profileWarnings.filter((w) => w.startsWith("未提供行年")),
    ).toHaveLength(1);
    expect(
      cleared.profileWarnings.filter((w) => w.startsWith("本盘续占")),
    ).toHaveLength(1);
    expect(withPersonalContext(cleared)).toEqual(cleared);
    expect(supplied.input!.natalBranch).toBe("卯");
  });

  it("supports living and manually recorded charts without manufacturing new times", () => {
    const living = cast({ ...standard, castMode: "living", livingNumber: 12 });
    const manual = castManual({
      dayStem: "甲",
      dayBranch: "子",
      monthGeneral: "巳",
      hourBranch: "午",
      daytime: true,
    });
    const livingNext = withPersonalContext(living, "卯");
    expect(livingNext.casting).toBe(living.casting);
    expect(livingNext.input!.livingNumber).toBe(12);
    expect(livingNext.profileWarnings).toContain(living.casting!.notice);
    const manualNext = withPersonalContext(manual, "卯");
    expect(manualNext.manualInput!.natalBranch).toBe("卯");
    expect(manualNext.input).toBeUndefined();
    expect(manualNext.time).toBeUndefined();
    expect(manualNext.id).toBe(manual.id);
    expect(manualNext.trace).toBe(manual.trace);
  });

  it.each([null, "甲", 1])(
    "rejects invalid personal branches %s before altering context",
    (invalid) => {
      const chart = cast(standard);
      expect(() => withPersonalContext(chart, invalid as Branch)).toThrow(
        "本命",
      );
      expect(() =>
        withPersonalContext(chart, undefined, invalid as Branch),
      ).toThrow("行年");
    },
  );
});
