import { afterEach, describe, expect, it, vi } from "vitest";
import { cast, castManual, withPersonalContext } from "../src/core";
import type { ChartResult } from "../src/core";
import * as calendarModule from "../src/core/calendar";
import * as rulesModule from "../src/core/rules";
import {
  normalizeReport,
  serializeReport,
  type Report,
} from "../src/lib/report";

const standard = cast({
  datetime: "2026-09-23T12:30:00",
  timeBasis: "standard",
});
const living = cast({
  datetime: "2026-09-23T12:30:00",
  timeBasis: "standard",
  castMode: "living",
  livingNumber: 1,
});
const manual = castManual({
  dayStem: "甲",
  dayBranch: "子",
  monthGeneral: "亥",
  hourBranch: "午",
  daytime: true,
});
function report(
  chart = standard,
  mode?: NonNullable<Report["consultation"]>["mode"],
): Report {
  return {
    schemaVersion: 2,
    id: "archive-test-report",
    question: "这件新的合作接下来应注意什么？",
    categoryChoice: "business",
    category: "business",
    place: "未提供地点",
    createdAt: "2026-09-23T04:30:00.000Z",
    chart,
    ...(mode
      ? { consultation: { mode, matterId: "archive-test-matter" } }
      : {}),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("archived casting provenance is internally consistent", () => {
  it.each([
    ["standard", standard],
    ["living", living],
    ["manual", manual],
  ] as const)(
    "round-trips a %s report with its actual original casting mode",
    (mode, chart) => {
      const original = report(chart, mode);
      const restored = normalizeReport(JSON.parse(serializeReport(original)))!;
      expect(restored.chart).toEqual(chart);
      expect(restored.consultation).toEqual(original.consultation);
      expect(restored.createdAt).toBe(original.createdAt);
    },
  );

  it.each([
    ["living", standard],
    ["manual", standard],
    ["standard", living],
    ["manual", living],
    ["living", manual],
    ["standard", manual],
  ] as const)(
    "rejects a %s consultation whose chart has a different origin",
    (mode, chart) => {
      expect(normalizeReport(report(chart, mode))).toBeNull();
    },
  );

  it.each([standard, living, manual])(
    "preserves continuation of any original casting mode without rerunning the engine",
    (chart) => {
      const contextual = withPersonalContext(chart, "卯", "申");
      const original = report(contextual, "reuse");
      original.consultation = {
        mode: "reuse",
        matterId: "changed-matter",
        parentReportId: "original-matter-report",
        sourceChartReportId: "different-chart-report",
        changeNote: "对方今天已经提交了新的正式条件",
      };
      const calendarSpy = vi.spyOn(calendarModule, "calendar");
      const rulesSpy = vi.spyOn(rulesModule, "rules");
      const restored = normalizeReport(JSON.parse(serializeReport(original)))!;
      expect(restored.chart).toEqual(contextual);
      expect(restored.chart.id).toBe(chart.id);
      expect(restored.consultation).toEqual(original.consultation);
      expect(calendarSpy).not.toHaveBeenCalled();
      expect(rulesSpy).not.toHaveBeenCalled();
    },
  );

  it.each([
    { manualInput: manual.manualInput },
    { input: undefined },
    { time: undefined },
    { casting: { ...standard.casting!, virtualHourBranch: "子", number: 1 } },
  ])("rejects contradictory or incomplete timed chart provenance", (patch) => {
    expect(
      normalizeReport({ ...report(), chart: { ...standard, ...patch } }),
    ).toBeNull();
  });

  it("rejects manual input combined with timed input even without casting metadata", () => {
    expect(
      normalizeReport(report({ ...manual, input: standard.input })),
    ).toBeNull();
    expect(
      normalizeReport(report({ ...manual, time: standard.time })),
    ).toBeNull();
  });

  it("rejects a reported-time chart relabelled as standard or stripped of its provenance", () => {
    expect(
      normalizeReport(
        report({
          ...living,
          casting: { ...living.casting!, mode: "standard" },
        }),
      ),
    ).toBeNull();
    expect(
      normalizeReport(report({ ...living, casting: undefined })),
    ).toBeNull();
  });
});

describe("known clocks are checked without imposing current rules on old reports", () => {
  it("checks the real branch and real daylight independently of a living virtual hour", () => {
    expect(living.hourBranch).toBe("子");
    expect(living.casting!.realHourBranch).toBe("午");
    expect(normalizeReport(report(living, "living"))!.chart.daytime).toBe(true);
    expect(
      normalizeReport(
        report({
          ...living,
          casting: { ...living.casting!, realHourBranch: "亥" },
        }),
      ),
    ).toBeNull();
    expect(normalizeReport(report({ ...living, daytime: false }))).toBeNull();
  });

  it.each([
    "2026-09-22T22:59:59",
    "2026-09-22T23:00:00",
    "2026-09-23T00:00:00",
    "2026-09-23T00:59:59",
    "2026-09-23T01:00:00",
    "2026-09-23T04:59:59",
    "2026-09-23T05:00:00",
    "2026-09-23T16:59:59",
    "2026-09-23T17:00:00",
  ])(
    "preserves a valid known report at the saved clock boundary %s",
    (datetime) => {
      const chart = cast({
        datetime,
        timeBasis: "standard",
        castMode: "living",
        livingNumber: 7,
      });
      expect(normalizeReport(report(chart, "living"))!.chart).toEqual(chart);
    },
  );

  it("uses the saved selected solar clock, including clocks on a different date", () => {
    const solar = cast({
      datetime: "2026-01-01T01:00:00",
      timeBasis: "solar",
      longitude: 75,
      castMode: "living",
      livingNumber: 7,
    });
    expect(solar.time!.selected.slice(0, 10)).toBe("2025-12-31");
    expect(solar.casting!.realHourBranch).toBe("亥");
    expect(normalizeReport(report(solar, "living"))!.chart).toEqual(solar);
    const wrongClock: ChartResult = {
      ...solar,
      casting: { ...solar.casting!, realHourBranch: "丑" },
    };
    expect(normalizeReport(report(wrongClock, "living"))).toBeNull();
  });

  it("requires the known saved selection to agree with its saved basis and input", () => {
    expect(
      normalizeReport(
        report({
          ...standard,
          time: { ...standard.time!, selected: "2026-09-23 13:30:00" },
        }),
      ),
    ).toBeNull();
    expect(
      normalizeReport(
        report({
          ...standard,
          time: { ...standard.time!, timeBasis: "solar" },
        }),
      ),
    ).toBeNull();
    expect(
      normalizeReport(
        report({
          ...standard,
          input: { ...standard.input!, datetime: "2026-09-23T13:30:00" },
        }),
      ),
    ).toBeNull();
    // The schema permits minute precision as well as seconds; these are the same clock.
    expect(
      normalizeReport(
        report({
          ...standard,
          input: { ...standard.input!, datetime: "2026-09-23T12:30" },
        }),
      ),
    ).not.toBeNull();
  });

  it.each([1, 2])(
    "preserves old schema %s charts without newly introduced mode metadata",
    (schemaVersion) => {
      const oldChart: ChartResult = {
        ...standard,
        casting: undefined,
        engineVersion: "archived-engine",
        ruleVersion: "archived-rules",
        // Retain an old recorded result instead of recomputing it under today's rules.
        hourBranch: "亥",
        daytime: false,
        method: { ...standard.method, detail: "历史口径，保留当时记录" },
      };
      const restored = normalizeReport({ ...report(oldChart), schemaVersion })!;
      expect(restored).not.toBeNull();
      expect(restored.chart).toEqual(oldChart);
      expect(restored.consultation).toBeUndefined();
      expect(restored.chart.casting).toBeUndefined();
    },
  );

  it("does not assume the selected-clock or daylight algorithm of an unknown historical version", () => {
    const historical: ChartResult = {
      ...living,
      engineVersion: "other-engine",
      casting: { ...living.casting!, realHourBranch: "巳" },
      daytime: false,
    };
    expect(normalizeReport(report(historical, "living"))!.chart).toEqual(
      historical,
    );
    const otherRules = {
      ...historical,
      engineVersion: living.engineVersion,
      ruleVersion: "other-rules",
    };
    expect(normalizeReport(report(otherRules, "living"))!.chart).toEqual(
      otherRules,
    );
  });

  it("retains old bare chart structures with no input metadata rather than inventing a source", () => {
    const oldChart = {
      ...standard,
      casting: undefined,
      input: undefined,
      time: undefined,
    };
    const restored = normalizeReport(report(oldChart))!;
    expect(restored.chart).toEqual(oldChart);
    expect(restored.consultation).toBeUndefined();
  });
});
