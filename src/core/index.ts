import type {
  Branch,
  CastInput,
  ChartFact,
  ChartResult,
  ManualInput,
  Stem,
} from "./types";
import { calendar, validateBranch } from "./calendar";
import {
  BRANCHES,
  BRANCH_ELEMENTS,
  ENGINE_VERSION,
  RULE_VERSION,
  STEMS,
  bi,
  branch,
  controls,
  generates,
  mod,
  si,
} from "./constants";
import { rules } from "./rules";
import { resolveCasting } from "./modes";

export { BRANCHES, STEMS, RULE_VERSION, ENGINE_VERSION } from "./constants";
export {
  chartStructureSignature,
  hasEquivalentChart,
  withPersonalContext,
} from "./modes";
export type * from "./types";

function fingerprint(text: string): string {
  // A reproducible display identifier, not a cryptographic signature.
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b);
  }
  return (
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}

function canonical(input: CastInput | ManualInput): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(input)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}

function relative(stem: Stem, b: Branch): string {
  const day = Math.floor(si(stem) / 2),
    e = BRANCH_ELEMENTS[bi(b)];
  if (day === e) return "兄弟";
  if (generates(e, day)) return "父母";
  if (generates(day, e)) return "子孙";
  if (controls(day, e)) return "妻财";
  return "官鬼";
}

function compute(input: ManualInput): ChartResult {
  if (
    !input ||
    !STEMS.includes(input.dayStem) ||
    !BRANCHES.includes(input.dayBranch)
  )
    throw new Error("请选择有效的日干、日支");
  if (si(input.dayStem) % 2 !== bi(input.dayBranch) % 2)
    throw new Error("日干支阴阳不配，不属于六十甲子");
  if (
    !BRANCHES.includes(input.monthGeneral) ||
    !BRANCHES.includes(input.hourBranch)
  )
    throw new Error("月将与占时必须为地支");
  if (typeof input.daytime !== "boolean") throw new Error("请选择昼占或夜占");
  validateBranch(input.natalBranch, "本命");
  validateBranch(input.annualBranch, "行年");
  const r = rules(input);
  const xunStart = mod(bi(input.dayBranch) - si(input.dayStem));
  const voids = [branch(xunStart + 10), branch(xunStart + 11)];
  const hidden = (b: Branch): Stem | null => {
    const n = mod(bi(b) - xunStart);
    return n < 10 ? STEMS[n] : null;
  };
  const transmissions = r.transmissions.map((p) => ({
    branch: branch(p),
    hiddenStem: hidden(branch(p)),
    relative: relative(input.dayStem, branch(p)),
    general: r.generals[r.heaven.indexOf(p)],
    isVoid: voids.includes(branch(p)),
  }));
  const facts: ChartFact[] = [
    {
      id: "day",
      label: "日辰",
      value: `${input.dayStem}${input.dayBranch}`,
      sourceIds: [],
    },
    {
      id: "month-general",
      label: "月将",
      value: input.monthGeneral,
      sourceIds: [],
    },
    {
      id: "hour",
      label: "占时",
      value: `${input.hourBranch}时 · ${input.daytime ? "昼" : "夜"}占`,
      sourceIds: ["zhizhi-daynight"],
    },
    {
      id: "method",
      label: "发传法",
      value: `${r.method.name}：${r.method.detail}`,
      sourceIds: r.trace.find((t) => t.id === "transmissions")!.sourceIds,
    },
    { id: "voids", label: "旬空", value: voids.join("、"), sourceIds: [] },
    ...r.lessons.map((l, i) => ({
      id: `lesson-${i + 1}`,
      label: `第${i + 1}课`,
      value: `${l.lower}上${l.upper}`,
      sourceIds: ["daquan-jigong"],
    })),
    ...transmissions.map((t, i) => ({
      id: `transmission-${i + 1}`,
      label: ["初传", "中传", "末传"][i],
      value: `${t.hiddenStem ?? "空"}${t.branch} · ${t.relative} · ${t.general}${t.isVoid ? " · 旬空" : ""}`,
      sourceIds: r.trace.find((x) => x.id === "transmissions")!.sourceIds,
    })),
  ];
  if (input.natalBranch) {
    const p = bi(input.natalBranch);
    facts.push({
      id: "natal",
      label: "本命上神",
      value: `本命${input.natalBranch}，上见${branch(r.heaven[p])}，乘${r.generals[p]}（用户提供）`,
      sourceIds: [],
    });
  }
  if (input.annualBranch) {
    const p = bi(input.annualBranch);
    facts.push({
      id: "annual",
      label: "行年上神",
      value: `行年${input.annualBranch}，上见${branch(r.heaven[p])}，乘${r.generals[p]}（用户提供）`,
      sourceIds: [],
    });
  }
  const warnings = [
    "采用《六壬大全》九宗门与涉害深浅规则；贵人通行表由《六壬粹言》影印旁证，天将顺逆由《御定六壬直指》影印旁证，不混称为《大全》原文。",
    "排盘可以复核；古籍规则及解读不构成预测必然准确的证据。",
  ];
  if (!input.natalBranch) warnings.push("未提供本命，不使用依赖本命的条文。");
  if (!input.annualBranch) warnings.push("未提供行年，不使用依赖行年的条文。");
  return {
    id: `dlr-${fingerprint(RULE_VERSION + canonical(input))}`,
    engineVersion: ENGINE_VERSION,
    ruleVersion: RULE_VERSION,
    day: { stem: input.dayStem, branch: input.dayBranch },
    monthGeneral: input.monthGeneral,
    hourBranch: input.hourBranch,
    daytime: input.daytime,
    heavenPlate: r.heaven.map(branch),
    lessons: r.lessons,
    transmissions,
    generals: r.generals,
    voids,
    method: r.method,
    trace: [
      ...r.trace,
      {
        id: "xun",
        title: "旬遁、旬空与六亲",
        detail: `${input.dayStem}${input.dayBranch}属甲${branch(xunStart)}旬，${voids.join("、")}空。旬首起甲顺遁十干，六亲以日干五行为基准；旬空保持空位，不伪填遁干。`,
        sourceIds: [],
      },
    ],
    facts,
    profileWarnings: warnings,
  };
}

export function castManual(input: ManualInput): ChartResult {
  const result = compute(input);
  result.manualInput = { ...input };
  result.trace.unshift({
    id: "manual",
    title: "人工课例输入",
    detail:
      "使用明确给定的日干支、月将、时支与昼夜复现课例；未从日期反算，也未自动推算年命。",
    sourceIds: [],
  });
  return result;
}

export function cast(input: CastInput): ChartResult {
  const c = calendar(input);
  const casting = resolveCasting(input, c.hourBranch);
  const result = compute({
    dayStem: c.dayStem,
    dayBranch: c.dayBranch,
    monthGeneral: c.monthGeneral,
    hourBranch: casting.virtualHourBranch ?? c.hourBranch,
    daytime: c.daytime,
    natalBranch: input.natalBranch,
    annualBranch: input.annualBranch,
  });
  result.id = `dlr-${fingerprint(RULE_VERSION + canonical({ ...input, ruleVersion: RULE_VERSION }))}`;
  result.input = { ...input, ruleVersion: RULE_VERSION };
  result.time = c.time;
  result.casting = casting;
  result.monthBranch = c.monthBranch;
  result.trace.unshift(...c.trace, {
    id: "casting-mode",
    title: casting.mode === "living" ? "活时报数与真实历法分离" : "正时起课",
    detail:
      casting.mode === "living"
        ? `真实时支${casting.realHourBranch}，用户报数 ${casting.number} 对应虚拟${casting.virtualHourBranch}时，月将加虚拟占时布盘。${casting.notice}`
        : casting.notice,
    sourceIds: [],
  });
  result.facts.push(
    {
      id: "casting-mode",
      label: "起课方式",
      value:
        casting.mode === "living"
          ? `活时报数 ${casting.number} → 虚拟${casting.virtualHourBranch}时；真实${casting.realHourBranch}时，按真实时间取${c.daytime ? "昼" : "夜"}贵；日干支、月将不变（本站口径）`
          : `正时起课，真实${casting.realHourBranch}时`,
      sourceIds: [],
    },
    {
      id: "time-basis",
      label: "时间基准",
      value: `${input.timeBasis === "solar" ? "真太阳时" : "北京时间"} ${c.time.selected}`,
      sourceIds: [],
    },
    { id: "month-branch", label: "月建", value: c.monthBranch, sourceIds: [] },
  );
  if (casting.mode === "living") {
    result.profileWarnings.push(casting.notice);
    if (casting.virtualHourBranch === casting.realHourBranch)
      result.profileWarnings.push(
        "本次报数对应的虚拟时支与真实时支相同，因此与同一真实时间的正时课盘一致，这是规则结果，不是故障。",
      );
  }
  if (c.time.nearBoundary)
    result.profileWarnings.unshift(
      "本次时间接近时辰、换日或交节边界（两分钟内），请核准输入时间，并查看标准时对照。",
    );
  if (input.timeBasis === "solar" && input.latitude === undefined)
    result.profileWarnings.push(
      "未提供纬度，以 0°、海拔 0 米计算太阳时角；当地视差可能造成亚秒级差异。",
    );
  return result;
}
