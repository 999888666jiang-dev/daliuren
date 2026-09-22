import { describe, expect, it } from "vitest";
import { BRANCHES, STEMS, RULE_VERSION, cast, castManual } from "../src/core";
import type { Branch, ManualInput, Stem } from "../src/core/types";

// The expected transmissions below are transcribed from texts, not generated
// by this engine. OCR candidates remain explicitly distinct from scan-verified
// production quotation records (see docs/algorithm.md and evidence manifest).
const goldenInputs: [string, Stem, Branch, Branch, Branch, string][] = [
  ["重审：丙寅干上午", "丙", "寅", "丑", "子", "辰巳午"],
  ["元首：壬戌干上申", "壬", "戌", "酉", "子", "巳寅亥"],
  ["比用：甲戌干上未", "甲", "戌", "巳", "子", "子巳戌"],
  ["涉害深浅：丁卯丑时亥将", "丁", "卯", "亥", "丑", "亥酉未"],
  ["涉害复等：甲午辰时午将", "甲", "午", "午", "辰", "辰午申"],
  ["蒿矢：丙戌干上寅", "丙", "戌", "酉", "子", "亥申巳"],
  ["弹射：癸未干上子", "癸", "未", "亥", "子", "巳辰卯"],
  ["昴星仰视：戊寅卯将亥时", "戊", "寅", "卯", "亥", "丑午酉"],
  ["昴星俯视：丁亥寅将亥时", "丁", "亥", "寅", "亥", "午戌寅"],
  ["刚日别责：丙辰干上午", "丙", "辰", "丑", "子", "亥午午"],
  ["柔日别责：丁酉干上巳", "丁", "酉", "亥", "丑", "丑巳巳"],
  ["八专顺数：甲寅干上亥", "甲", "寅", "酉", "子", "丑亥亥"],
  ["八专逆数：丁未干上戌", "丁", "未", "卯", "子", "亥戌戌"],
  ["八专独足：己未干上酉", "己", "未", "寅", "子", "酉酉酉"],
  ["伏吟：甲日自任", "甲", "子", "子", "子", "寅巳申"],
  ["伏吟：乙酉自刑杜传", "乙", "酉", "子", "子", "辰酉卯"],
  ["伏吟：丁卯中传杜传", "丁", "卯", "子", "子", "卯子午"],
  ["伏吟：壬辰两重自刑", "壬", "辰", "子", "子", "亥辰戌"],
  ["返吟无克：丁丑", "丁", "丑", "午", "子", "亥未丑"],
  ["返吟无克：辛丑", "辛", "丑", "午", "子", "亥未辰"],
  ["影印总钤：甲辰干上未", "甲", "辰", "巳", "子", "寅未子"],
  ["影印总钤：乙卯干上申", "乙", "卯", "辰", "子", "未亥卯"],
  ["影印总钤：丁卯干上亥", "丁", "卯", "辰", "子", "未亥卯"],
  ["影印总钤：己卯干上亥", "己", "卯", "辰", "子", "未亥卯"],
  ["影印总钤：己亥干上亥", "己", "亥", "辰", "子", "未亥卯"],
  ["影印总钤：辛卯干上寅", "辛", "卯", "辰", "子", "未亥卯"],
];

// Provenance belongs to EACH expected result. These statuses do not inherit
// the verification of a rule quotation: verifying a poem is not verifying a
// worked chart. For examples stated as 干上X, equivalent 月将/时支 pairs were
// calculated by hand; no historical Gregorian date is claimed.
interface GoldenSource {
  work: string;
  edition: string;
  chapter: string;
  sourceUrl: string;
  scanPage: number | null;
  verification: "text-transcription" | "hand-calculated" | "scan-verified";
  locator: string;
  note: string;
}
const cuiyanUrl =
  "https://www.shidianguji.com/book/NCL06574A/chapter/1lytk81lo2b03";
const shehaiUrl =
  "https://www.shidianguji.com/zh/book/SK1599/chapter/1m1g2evjvmoez";
function cuiyan(chapter: string, locator: string): GoldenSource {
  return {
    work: "六壬粹言",
    edition: "识典古籍 NCL06574A 电子转录，逐页影印待核",
    chapter: `卷一·${chapter}`,
    sourceUrl: cuiyanUrl,
    scanPage: null,
    verification: "text-transcription",
    locator,
    note: "预期三传读取原文转录；月将时支有以干上位置人工换算者。未声称影印课例已核。",
  };
}
function daquanScan(page: number, locator: string): GoldenSource {
  return {
    work: "六壬大全",
    edition: "CADAL 06054168 影印本",
    chapter: "卷一·六十日总钤",
    sourceUrl: `https://commons.wikimedia.org/wiki/File:CADAL06054168_六壬大全·卷一.djvu?page=${page}`,
    scanPage: page,
    verification: "scan-verified",
    locator,
    note: `直接目视 library/review/daquan-v1-p${page}.jpg 原图，公开副本 public/sources/daquan-v1-p${page}.jpg。格首干支是日干及其上神，小字为日支，大字为三传；月将/时支为人工换算的等价天盘位移。这6例可区分涉害计数是否包含所临起点。`,
  };
}
const provenance: GoldenSource[] = [
  cuiyan("上克下贼先重审", "丙寅干上午，三传辰巳午"),
  cuiyan("元首课", "壬戌干上申，三传巳寅亥"),
  cuiyan("克多取用比方知", "阳阳比格：甲戌一课未甲，三传子巳戌"),
  {
    work: "六壬大全",
    edition: "识典古籍 SK1599 电子转录，逐页影印待核",
    chapter: "课经·涉害课",
    sourceUrl: shehaiUrl,
    scanPage: null,
    verification: "text-transcription",
    locator: "正月丁卯日丑时亥将；三传亥酉未",
    note: "计数为辰戊未己戌五重与乙木一重；已有已/己/巳转录讹字，等待影印裁决。",
  },
  {
    work: "六壬大全",
    edition: "识典古籍 SK1599 电子转录，逐页影印待核",
    chapter: "课经·涉害课·缀瑕",
    sourceUrl: shehaiUrl,
    scanPage: null,
    verification: "text-transcription",
    locator: "六月甲午日辰时午将；三传辰午申",
    note: "原文两候选前行各一重；预期读取转录图文，尚未声称影印已核。",
  },
  cuiyan("蒿矢课", "丙戌干上寅；亥申巳"),
  cuiyan("弹射课", "癸未干上子；巳辰卯"),
  cuiyan("昴星仰视格", "戊寅日三传丑午酉"),
  {
    work: "六壬大全",
    edition: "CADAL 06054168 规则影像本，课例为项目手算",
    chapter: "卷一·昴星法",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:CADAL06054168_六壬大全·卷一.djvu",
    scanPage: 13,
    verification: "hand-calculated",
    locator: "丁亥、寅将、亥时：天盘酉落午；干上戌、支上寅",
    note: "这是独立手算断言，不宣称该完整课例印于此页；该页仅为昴星算法出处。",
  },
  cuiyan("刚日别责课", "丙辰干上午；亥午午"),
  cuiyan("柔日别责课", "丁酉干上巳；丑巳巳（原转录中有己/巳混字）"),
  cuiyan("顺数三神格", "甲寅三传丑亥亥"),
  cuiyan("逆数三神格", "丁未支阴丑，三传亥戌戌"),
  cuiyan("逆数三神格·独足", "己未支上酉，三传酉酉酉"),
  cuiyan("自任课", "六甲三传寅巳申"),
  cuiyan("初中二传杜传格", "乙酉辰酉卯"),
  cuiyan("中传杜传格", "丁卯、己卯、辛卯，卯子午；子卯回刑末取冲"),
  cuiyan("初中二传杜传格", "壬辰亥辰戌"),
  cuiyan("无亲课", "丁丑、己丑三传亥未丑"),
  cuiyan("无亲课", "辛丑三传亥未辰"),
  daquanScan(16, "六甲日上行甲未格，小字辰对应寅未子；干上未为位移+5"),
  daquanScan(17, "六乙日右上乙申格，小字亥卯对应未亥卯；干上申为位移+4"),
  daquanScan(19, "六丁日右下丁亥格，小字亥卯对应未亥卯；干上亥为位移+4"),
  daquanScan(21, "六己日右下己亥格，小字卯亥对应未亥卯；取己卯日"),
  daquanScan(21, "六己日右下己亥格，小字卯亥对应未亥卯；取己亥日"),
  daquanScan(23, "六辛日左下辛寅格，右下小字卯对应未亥卯；干上寅为位移+4"),
];
export const GOLDEN_CASES = goldenInputs.map(
  ([name, dayStem, dayBranch, monthGeneral, hourBranch, expected], i) => ({
    name,
    input: { dayStem, dayBranch, monthGeneral, hourBranch, daytime: true },
    expected,
    source: provenance[i],
  }),
);

describe("independent classical and hand-checked examples", () => {
  it.each(GOLDEN_CASES)("$name", ({ name, input, expected, source }) => {
    const chart = castManual(input);
    expect(chart.transmissions.map((t) => t.branch).join(""), name).toBe(
      expected,
    );
    expect(source.sourceUrl.startsWith("https://")).toBe(true);
    expect(source.locator.length).toBeGreaterThan(0);
  });
  it("keeps the first lesson lower as a stem, including its different element", () => {
    const chart = castManual({
      dayStem: "癸",
      dayBranch: "丑",
      monthGeneral: "子",
      hourBranch: "子",
      daytime: true,
    });
    expect(chart.lessons[0]).toEqual({
      lower: "癸",
      lowerBranch: "丑",
      upper: "丑",
      kind: "stem",
    });
    expect(chart.transmissions.map((t) => t.branch).join("")).toBe("丑戌未");
  });
  it("makes the published harm counts inspectable instead of hiding a lookup", () => {
    const chart = castManual({
      dayStem: "丁",
      dayBranch: "卯",
      monthGeneral: "亥",
      hourBranch: "丑",
      daytime: true,
    });
    const depth = chart.trace.find((t) => t.id === "harm-depth")!.detail;
    expect(depth).toContain("5重");
    expect(depth).toContain("1重");
    expect(depth).toContain("辰、戊、未、己、戌");
  });
  it("lays out noble generals on ground palaces and attaches them to transmission correctly", () => {
    const day = castManual({
      dayStem: "甲",
      dayBranch: "子",
      monthGeneral: "子",
      hourBranch: "子",
      daytime: true,
    });
    const night = castManual({
      dayStem: "甲",
      dayBranch: "子",
      monthGeneral: "子",
      hourBranch: "子",
      daytime: false,
    });
    expect(day.generals[1]).toBe("贵人");
    expect(day.generals[2]).toBe("螣蛇");
    expect(night.generals[7]).toBe("贵人");
    expect(night.generals[6]).toBe("螣蛇");
    expect(day.transmissions[0].general).toBe("螣蛇");
    expect(day.voids).toEqual(["戌", "亥"]);
  });
  it("matches all twenty day/night noble branches directly read from the NCL 06574 scan", () => {
    // 六壬粹言，国图06574钞本，卷一立课·十二天将旦暮治，叶十九。
    // PDF page41 left, visually checked at library/review/cuiyan-041.jpg.
    // https://commons.wikimedia.org/wiki/File:NCL-06574_六壬粹言.pdf?page=41
    const expectedDay = [..."丑子亥亥丑子丑午巳巳"];
    const expectedNight = [..."未申酉酉未申未寅卯卯"];
    for (let n = 0; n < 10; n++)
      for (const daytime of [true, false]) {
        const chart = castManual({
          dayStem: STEMS[n],
          dayBranch: n % 2 === 0 ? "子" : "丑",
          monthGeneral: "子",
          hourBranch: "子",
          daytime,
        });
        const nobleBranch = chart.heavenPlate[chart.generals.indexOf("贵人")];
        expect(nobleBranch).toBe((daytime ? expectedDay : expectedNight)[n]);
      }
  });
});

describe("all 720 structural charts and 1440 day/night charts", () => {
  it("matches the exact nine 别责 combinations printed on CADAL volume 1 scan page 14", () => {
    // Independently read from the scan, rather than copied from this engine:
    // 戊午戊辰与丙辰，干上皆午；辛丑辛未各二，干上丑/未；丁酉干上巳，辛酉干上酉。
    // Source: https://commons.wikimedia.org/wiki/File:CADAL06054168_六壬大全·卷一.djvu?page=14
    const expected = [
      "戊午/午",
      "戊辰/午",
      "丙辰/午",
      "辛丑/丑",
      "辛丑/未",
      "辛未/丑",
      "辛未/未",
      "丁酉/巳",
      "辛酉/酉",
    ];
    const actual: string[] = [];
    for (let day = 0; day < 60; day++)
      for (let shift = 0; shift < 12; shift++) {
        const chart = castManual({
          dayStem: STEMS[day % 10],
          dayBranch: BRANCHES[day % 12],
          monthGeneral: BRANCHES[shift],
          hourBranch: "子",
          daytime: true,
        });
        if (chart.method.name === "别责")
          actual.push(
            `${chart.day.stem}${chart.day.branch}/${chart.lessons[0].upper}`,
          );
      }
    expect(actual.sort()).toEqual(expected.sort());
  });
  it("matches all six 无克返吟 days printed on CADAL volume 1 scan page 15", () => {
    // The selected scan explicitly says 六日 and names 丁/己/辛 × 丑/未.
    // Source: https://commons.wikimedia.org/wiki/File:CADAL06054168_六壬大全·卷一.djvu?page=15
    const expected = ["丁丑", "丁未", "己丑", "己未", "辛丑", "辛未"];
    const actual: string[] = [];
    for (let day = 0; day < 60; day++) {
      const chart = castManual({
        dayStem: STEMS[day % 10],
        dayBranch: BRANCHES[day % 12],
        monthGeneral: "午",
        hourBranch: "子",
        daytime: true,
      });
      if (chart.method.detail.startsWith("无克返吟"))
        actual.push(`${chart.day.stem}${chart.day.branch}`);
    }
    expect(actual.sort()).toEqual(expected.sort());
  });
  it("every valid day/rotation yields complete deterministic results and all nine methods are reachable", () => {
    const seen = new Set<string>();
    let count = 0;
    for (let day = 0; day < 60; day++)
      for (let shift = 0; shift < 12; shift++)
        for (const daytime of [true, false]) {
          const input: ManualInput = {
            dayStem: STEMS[day % 10],
            dayBranch: BRANCHES[day % 12],
            monthGeneral: BRANCHES[shift],
            hourBranch: "子",
            daytime,
          };
          const chart = castManual(input);
          seen.add(chart.method.name);
          count++;
          expect(chart.heavenPlate).toHaveLength(12);
          expect(new Set(chart.heavenPlate).size).toBe(12);
          expect(chart.generals).toHaveLength(12);
          expect(new Set(chart.generals).size).toBe(12);
          expect(chart.lessons).toHaveLength(4);
          expect(chart.transmissions).toHaveLength(3);
          expect(chart.voids).toHaveLength(2);
          expect(chart.heavenPlate[0]).toBe(input.monthGeneral);
          for (const t of chart.transmissions) {
            expect(BRANCHES).toContain(t.branch);
            expect(t.isVoid).toBe(chart.voids.includes(t.branch));
            expect(t.hiddenStem === null).toBe(t.isVoid);
            expect(t.general).toBe(
              chart.generals[chart.heavenPlate.indexOf(t.branch)],
            );
          }
          expect(chart.trace.every((t) => t.detail.length > 0)).toBe(true);
          expect(chart).toEqual(castManual(input));
        }
    expect(count).toBe(1440);
    expect([...seen].sort()).toEqual(
      [
        "贼克",
        "比用",
        "涉害",
        "遥克",
        "昴星",
        "别责",
        "八专",
        "伏吟",
        "返吟",
      ].sort(),
    );
  });
  it("changing daylight changes generals but not the four lessons or three transmission branches", () => {
    for (let day = 0; day < 60; day++)
      for (let shift = 0; shift < 12; shift++) {
        const input: ManualInput = {
          dayStem: STEMS[day % 10],
          dayBranch: BRANCHES[day % 12],
          monthGeneral: BRANCHES[shift],
          hourBranch: "子",
          daytime: true,
        };
        const a = castManual(input),
          b = castManual({ ...input, daytime: false });
        expect(a.lessons).toEqual(b.lessons);
        expect(a.transmissions.map((t) => t.branch)).toEqual(
          b.transmissions.map((t) => t.branch),
        );
        expect(a.generals).not.toEqual(b.generals);
      }
  });
  it("adding natal/annual info changes applicable facts, not the base chart", () => {
    const input: ManualInput = {
      dayStem: "甲",
      dayBranch: "子",
      monthGeneral: "巳",
      hourBranch: "午",
      daytime: true,
    };
    const a = castManual(input),
      b = castManual({ ...input, natalBranch: "卯", annualBranch: "申" });
    expect(a.transmissions).toEqual(b.transmissions);
    expect(b.facts.some((f) => f.id === "natal")).toBe(true);
    expect(b.facts.some((f) => f.id === "annual")).toBe(true);
    expect(a.facts.some((f) => f.id === "natal")).toBe(false);
    expect(a.id).not.toBe(b.id);
  });
});

describe("input contract", () => {
  it("rejects impossible sexagenary days", () =>
    expect(() =>
      castManual({
        dayStem: "甲",
        dayBranch: "丑",
        monthGeneral: "子",
        hourBranch: "子",
        daytime: true,
      }),
    ).toThrow("六十甲子"));
  it.each([
    "1999-12-31T12:00",
    "2101-01-01T12:00",
    "2100-02-29T12:00",
    "2026-02-30T12:00",
    "2026-00-01T12:00",
    "2026-12-01T24:00",
    "2026-01-01T12:60",
    "2026-01-01T12:00:60",
    "2026-01-01T12:00Z",
    "2026-1-1T12:00",
  ])("rejects invalid or ambiguous dates: %s", (datetime) => {
    expect(() => cast({ datetime, timeBasis: "standard" })).toThrow();
  });
  it("accepts Gregorian 2000 leap day and handles end-of-range 23:00", () => {
    expect(() =>
      cast({ datetime: "2000-02-29T12:00", timeBasis: "standard" }),
    ).not.toThrow();
    expect(() =>
      cast({ datetime: "2100-12-31T23:59:59", timeBasis: "standard" }),
    ).not.toThrow();
  });
  it("rejects missing solar longitude and unknown rule versions", () => {
    expect(() =>
      cast({ datetime: "2026-09-23T12:00", timeBasis: "solar" }),
    ).toThrow("经度");
    expect(() =>
      cast({
        datetime: "2026-09-23T12:00",
        timeBasis: "solar",
        longitude: NaN,
      }),
    ).toThrow();
    expect(() =>
      cast({
        datetime: "2026-09-23T12:00",
        timeBasis: "standard",
        ruleVersion: "other",
      }),
    ).toThrow();
    expect(
      cast({
        datetime: "2026-09-23T12:00",
        timeBasis: "standard",
        ruleVersion: RULE_VERSION,
      }).ruleVersion,
    ).toBe(RULE_VERSION);
  });
});
