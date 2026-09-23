import { validateBranch } from "./calendar";
import { BRANCHES, bi } from "./constants";
import type {
  Branch,
  CastInput,
  CastingContext,
  ChartFact,
  ChartResult,
} from "./types";

const NATAL_MISSING = "未提供本命，不使用依赖本命的条文。";
const ANNUAL_MISSING = "未提供行年，不使用依赖行年的条文。";
const REUSE_NOTICE =
  "本盘续占只更新用户提供的本命、行年上下文；课盘、三传、天将、原起课时间及原盘编号全部保留，不重新排盘。此为本网站的同盘续问功能，不冒称古籍次客移时的统一版本。";

/** The reported number is a branch selector, never a replacement calendar date. */
export function resolveCasting(
  input: CastInput,
  realHourBranch: Branch,
): CastingContext {
  const mode = input.castMode === undefined ? "standard" : input.castMode;
  if (mode !== "standard" && mode !== "living")
    throw new Error("起课模式只支持正时或活时报数；次客续占请复用已有课盘");
  if (mode === "standard") {
    if (input.livingNumber !== undefined)
      throw new Error("正时起课不能携带报数，请切换活时模式或清除报数");
    return {
      mode,
      realHourBranch,
      notice:
        "正时按真实时间及所选时间基准起课。同一日辰、月将、时支与昼夜口径相同，课盘相同；不同新问题可续问本盘或选择活时报数。",
    };
  }
  const number = input.livingNumber;
  if (
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > 12
  )
    throw new Error("活时报数须为 1 至 12 的整数，1 对应子、12 对应亥");
  return {
    mode,
    realHourBranch,
    virtualHourBranch: BRANCHES[number - 1],
    number,
    notice:
      "活时报数为有流派争议的备选起课方式，传统优先正时。本站将 1—12 映射子—亥，仅替换月将加时所用的占时；真实日干支、月将、月建及历法时间均不改。昼夜贵人仍依真实时间和所选时间基准判定，不跟随虚拟时支改变，这是本网站固定口径，不宣称唯一古法。相同报数会重现相同课盘，不保证不同问题必有不同结论。",
  };
}

/**
 * Structural identity intentionally excludes exact timestamps, question text,
 * natal/annual context, display IDs, and casting mode. It is not a session key:
 * callers checking "this same time period" must also compare the real period.
 */
export function chartStructureSignature(chart: ChartResult): string {
  return JSON.stringify({
    ruleVersion: chart.ruleVersion,
    day: [chart.day.stem, chart.day.branch],
    monthGeneral: chart.monthGeneral,
    monthBranch: chart.monthBranch ?? null,
    hourBranch: chart.hourBranch,
    daytime: chart.daytime,
    heavenPlate: chart.heavenPlate,
    lessons: chart.lessons.map((l) => [
      l.lower,
      l.lowerBranch,
      l.upper,
      l.kind,
    ]),
    transmissions: chart.transmissions.map((t) => [
      t.branch,
      t.hiddenStem,
      t.relative,
      t.general,
      t.isVoid,
    ]),
    generals: chart.generals,
    voids: chart.voids,
    method: chart.method.name,
  });
}

export function hasEquivalentChart(a: ChartResult, b: ChartResult): boolean {
  return chartStructureSignature(a) === chartStructureSignature(b);
}

/** Recontextualise an existing chart without calling calendar(), rules(), or cast(). */
export function withPersonalContext(
  chart: ChartResult,
  natalBranch?: Branch,
  annualBranch?: Branch,
): ChartResult {
  validateBranch(natalBranch, "本命");
  validateBranch(annualBranch, "行年");
  const facts = chart.facts.filter(
    (f) => f.id !== "natal" && f.id !== "annual",
  );
  const add = (id: string, label: string, b?: Branch) => {
    if (b === undefined) return;
    const position = bi(b);
    const fact: ChartFact = {
      id,
      label: `${label}上神`,
      value: `${label}${b}，上见${chart.heavenPlate[position]}，乘${chart.generals[position]}（本盘续占用户提供，未重新排盘）`,
      sourceIds: [],
    };
    facts.push(fact);
  };
  add("natal", "本命", natalBranch);
  add("annual", "行年", annualBranch);
  const profileWarnings = chart.profileWarnings.filter(
    (warning) =>
      warning !== NATAL_MISSING &&
      warning !== ANNUAL_MISSING &&
      warning !== REUSE_NOTICE,
  );
  if (natalBranch === undefined) profileWarnings.push(NATAL_MISSING);
  if (annualBranch === undefined) profileWarnings.push(ANNUAL_MISSING);
  profileWarnings.push(REUSE_NOTICE);
  return {
    ...chart,
    ...(chart.input
      ? { input: { ...chart.input, natalBranch, annualBranch } }
      : {}),
    ...(chart.manualInput
      ? { manualInput: { ...chart.manualInput, natalBranch, annualBranch } }
      : {}),
    facts,
    profileWarnings,
  };
}
