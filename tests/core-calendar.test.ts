import { describe, expect, it } from "vitest";
import { Solar } from "lunar-typescript";
import { cast } from "../src/core";
import { solarClock } from "../src/core/calendar";

describe("calendar and the separation of physical instant from clock", () => {
  it("changes day at 23:00 while midnight remains in the same sexagenary day", () => {
    const before = cast({
      datetime: "2026-09-22T22:59:59",
      timeBasis: "standard",
    });
    const after = cast({
      datetime: "2026-09-22T23:00:00",
      timeBasis: "standard",
    });
    const midnight = cast({
      datetime: "2026-09-23T00:00:00",
      timeBasis: "standard",
    });
    expect(before.day).not.toEqual(after.day);
    expect(after.day).toEqual(midnight.day);
    expect(before.hourBranch).toBe("亥");
    expect(after.hourBranch).toBe("子");
    expect(after.time!.utcIso).toBe("2026-09-22T15:00:00.000Z");
  });
  it("uses exactly the frozen 卯申 / 酉寅 daylight boundary", () => {
    const c = (datetime: string) => cast({ datetime, timeBasis: "standard" });
    expect(c("2026-09-23T04:59:59").daytime).toBe(false);
    expect(c("2026-09-23T05:00:00").daytime).toBe(true);
    expect(c("2026-09-23T16:59:59").daytime).toBe(true);
    expect(c("2026-09-23T17:00:00").daytime).toBe(false);
  });
  it("matches HKO 2026 equinox timing to the published minute precision", () => {
    // HKO Almanac 2026: spring equinox 20 March, 22:46 HKT.
    // https://www.hko.gov.hk/tc/gts/astron2026/files/HKO_almanac_2026.pdf
    const terms = Solar.fromYmd(2026, 3, 20).getLunar().getJieQiTable();
    const computed = Date.parse(
      terms["春分"].toYmdHms().replace(" ", "T") + "Z",
    );
    expect(
      Math.abs(computed - Date.parse("2026-03-20T22:46:00Z")),
    ).toBeLessThanOrEqual(30_000);
    expect(
      cast({ datetime: "2026-03-20T22:45:00", timeBasis: "standard" })
        .monthGeneral,
    ).toBe("亥");
    expect(
      cast({ datetime: "2026-03-20T22:47:00", timeBasis: "standard" })
        .monthGeneral,
    ).toBe("戌");
  });
  it("crosses the numerical term at its actual instant, even when solar time is on another hour/date", () => {
    const term = Solar.fromYmd(2026, 9, 23).getLunar().getJieQiTable()["秋分"];
    const at = term.toYmdHms().replace(" ", "T");
    const pseudo = new Date(at + "Z");
    const before = new Date(pseudo.getTime() - 1000).toISOString().slice(0, 19);
    for (const longitude of [-179, 0, 75, 120, 179]) {
      const a = cast({ datetime: before, timeBasis: "solar", longitude });
      const b = cast({ datetime: at, timeBasis: "solar", longitude });
      const standard = cast({ datetime: at, timeBasis: "standard" });
      expect(a.monthGeneral).toBe("巳");
      expect(b.monthGeneral).toBe("辰");
      expect(b.monthGeneral).toBe(standard.monthGeneral);
      expect(b.monthBranch).toBe(standard.monthBranch);
      expect(b.time!.utcIso).toBe(standard.time!.utcIso);
    }
  });
  it("has continuous solar dates near the international date line", () => {
    const utc = new Date("2026-09-22T16:00:00Z");
    const west = solarClock(utc, -179),
      east = solarClock(utc, 179);
    expect(west.civil.toISOString().slice(0, 10)).toBe("2026-09-22");
    expect(east.civil.toISOString().slice(0, 10)).toBe("2026-09-23");
    expect((east.civil.getTime() - west.civil.getTime()) / 60000).toBeCloseTo(
      358 * 4,
      1,
    );
    expect(Math.abs(west.equationMinutes)).toBeLessThan(20);
    expect(Math.abs(east.equationMinutes)).toBeLessThan(20);
  });
  it("unrolls midnight without a 24-hour jump at the solar-clock wrap", () => {
    let previous = solarClock(
      new Date("2026-09-22T15:40:00Z"),
      120,
    ).civil.getTime();
    for (let minute = 1; minute <= 40; minute++) {
      const next = solarClock(
        new Date(Date.parse("2026-09-22T15:40:00Z") + minute * 60000),
        120,
      ).civil.getTime();
      expect(next - previous).toBeGreaterThan(59900);
      expect(next - previous).toBeLessThan(60100);
      previous = next;
    }
  });
  it("matches the independent NOAA equation-of-time approximation within 75 seconds over the year", () => {
    // NOAA fractional-year approximation, independent of Astronomy Engine.
    // https://gml.noaa.gov/grad/solcalc/solareqns.PDF
    // This is a coarse cross-check, not a sub-second accuracy certificate.
    for (let month = 0; month < 12; month++) {
      const utc = new Date(Date.UTC(2026, month, 15, 12));
      const day = 1 + (utc.getTime() - Date.UTC(2026, 0, 1, 12)) / 86400000;
      const gamma = ((2 * Math.PI) / 365) * (day - 1);
      const eot =
        229.18 *
        (0.000075 +
          0.001868 * Math.cos(gamma) -
          0.032077 * Math.sin(gamma) -
          0.014615 * Math.cos(2 * gamma) -
          0.040849 * Math.sin(2 * gamma));
      expect(Math.abs(solarClock(utc, 0).equationMinutes - eot)).toBeLessThan(
        1.25,
      );
    }
  });
  it("solar and standard basis genuinely produce different charts near a relevant boundary", () => {
    const input = { datetime: "2026-09-23T06:00:00", longitude: 75 };
    const a = cast({ ...input, timeBasis: "solar" }),
      b = cast({ ...input, timeBasis: "standard" });
    expect(a.hourBranch).not.toBe(b.hourBranch);
    expect(a.daytime).not.toBe(b.daytime);
    expect(a.heavenPlate).not.toEqual(b.heavenPlate);
    expect(a.monthGeneral).toBe(b.monthGeneral);
  });
  it("boundary warnings cover actual term and selected-clock boundaries", () => {
    expect(
      cast({ datetime: "2026-09-23T05:01:00", timeBasis: "standard" }).time!
        .nearBoundary,
    ).toBe(true);
    expect(
      cast({ datetime: "2026-09-23T05:30:00", timeBasis: "standard" }).time!
        .nearBoundary,
    ).toBe(false);
  });
});
