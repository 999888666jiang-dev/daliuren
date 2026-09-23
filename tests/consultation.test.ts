import { describe, expect, it } from "vitest";
import { cast, withPersonalContext } from "../src/core";
import {
  normalizeQuestion,
  realPeriod,
  resolveMatter,
} from "../src/lib/consultation";
import { normalizeReport, type Report } from "../src/lib/report";

const original: Report = {
  schemaVersion: 2,
  id: "first-report",
  categoryChoice: "auto",
  category: "career",
  question: "我下周的面试怎么样？",
  place: "未提供地点",
  createdAt: "2026-09-23T01:30:00.000Z",
  chart: cast({ datetime: "2026-09-23T09:30", timeBasis: "standard" }),
  consultation: { mode: "standard", matterId: "interview" },
};
describe("one matter and a recorded change", () => {
  it("normalizes punctuation and width, without claiming semantic detection", () => {
    expect(normalizeQuestion("ＡＢＣ，面试？")).toBe(
      normalizeQuestion("abc 面试"),
    );
    expect(() =>
      resolveMatter("我下周的面试怎么样！", { acknowledged: true }, [original]),
    ).toThrow("本机已有");
  });
  it("requires the user's confirmation in every mode", () => {
    expect(() =>
      resolveMatter("另一个项目如何", { acknowledged: false }, [original]),
    ).toThrow("请确认");
  });
  it("permits different questions and records a genuinely declared new situation", () => {
    const other = resolveMatter("我的包在哪里？", { acknowledged: true }, [
      original,
    ]);
    expect(other.matterId).not.toBe("interview");
    const changed = resolveMatter(
      original.question,
      {
        acknowledged: true,
        previousReportId: original.id,
        changeNote: "对方今天发来新的面试通知",
      },
      [original],
    );
    expect(changed).toEqual({
      matterId: "interview",
      parentReportId: original.id,
      changeNote: "对方今天发来新的面试通知",
    });
  });
  it("rejects a missing record or a vague change", () => {
    expect(() =>
      resolveMatter(
        original.question,
        {
          acknowledged: true,
          previousReportId: "missing",
          changeNote: "情况真的发生变化",
        },
        [original],
      ),
    ).toThrow("未找到");
    expect(() =>
      resolveMatter(
        original.question,
        {
          acknowledged: true,
          previousReportId: original.id,
          changeNote: "不满意",
        },
        [original],
      ),
    ).toThrow("6—500");
  });
  it("does not allow an unrelated previous matter to bypass the duplicate rule", () => {
    const unrelated = {
      ...original,
      id: "unrelated",
      question: "我的包在哪里",
      consultation: { mode: "standard" as const, matterId: "lost" },
    };
    expect(() =>
      resolveMatter(
        original.question,
        {
          acknowledged: true,
          previousReportId: unrelated.id,
          changeNote: "我已经又换了一个想法",
        },
        [original, unrelated],
      ),
    ).toThrow("本机已有");
  });
  it("will not cast again for an already recorded change", () => {
    const changed: Report = {
      ...original,
      id: "changed",
      consultation: {
        ...original.consultation!,
        changeNote: "今天收到新的面试通知",
      },
    };
    expect(() =>
      resolveMatter(
        original.question,
        {
          acknowledged: true,
          previousReportId: original.id,
          changeNote: "今天收到新的面试通知！",
        },
        [changed, original],
      ),
    ).toThrow("这项现实变化已经有报告");
  });
  it("treats the two civil dates in a Zi hour as the same period", () => {
    const a = cast({ datetime: "2026-09-23T23:30", timeBasis: "standard" });
    const b = cast({ datetime: "2026-09-24T00:30", timeBasis: "standard" });
    expect(realPeriod(a)).toBe(realPeriod(b));
    expect(realPeriod(a)).not.toBe(
      realPeriod(cast({ datetime: "2026-09-24T01:01", timeBasis: "standard" })),
    );
  });
});
describe("mode and matter archival", () => {
  it("preserves living time provenance and unchanged actual day", () => {
    const chart = cast({
      datetime: "2026-09-23T09:30",
      timeBasis: "standard",
      castMode: "living",
      livingNumber: 1,
    });
    const normalized = normalizeReport({
      ...original,
      chart,
      consultation: { mode: "living", matterId: "new" },
    });
    expect(normalized?.chart).toEqual(chart);
    expect(normalized?.chart.day).toEqual(original.chart.day);
    expect(normalized?.consultation?.mode).toBe("living");
    expect(
      normalizeReport({
        ...original,
        chart: { ...chart, casting: { ...chart.casting, number: 13 } },
      }),
    ).toBeNull();
    expect(
      normalizeReport({
        ...original,
        chart: { ...chart, casting: { ...chart.casting, mode: "standard" } },
      }),
    ).toBeNull();
  });
  it("preserves the original plate for continuation and archives new personal context", () => {
    const chart = withPersonalContext(original.chart, "午", "辰");
    const normalized = normalizeReport({
      ...original,
      id: "second",
      chart,
      consultation: {
        mode: "reuse",
        matterId: "new",
        parentReportId: original.id,
      },
    });
    expect(normalized?.chart).toEqual(chart);
    expect(normalized?.chart.heavenPlate).toEqual(original.chart.heavenPlate);
    expect(normalized?.chart.id).toBe(original.chart.id);
    expect(normalized?.consultation?.parentReportId).toBe(original.id);
  });
});
