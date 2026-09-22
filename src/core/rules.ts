import type { Branch, Lesson, ManualInput, TraceStep } from "./types";
import {
  BRANCH_ELEMENTS,
  DAY_NOBLE,
  GENERAL_ORDER,
  NIGHT_NOBLE,
  PUNISHMENT,
  STEM_PALACES,
  bi,
  branch,
  controls,
  mod,
  si,
} from "./constants";

interface Candidate {
  upper: number;
  ground: number;
  lessonIndex: number;
}
export interface RuleResult {
  heaven: number[];
  lessons: Lesson[];
  transmissions: number[];
  generals: string[];
  method: { name: string; detail: string };
  trace: TraceStep[];
}

const sourceFor: Record<string, string> = {
  贼克: "daquan-zeike",
  比用: "daquan-biyong",
  涉害: "daquan-shehai",
  遥克: "daquan-yaoke",
  昴星: "daquan-maoxing",
  别责: "daquan-bieze",
  八专: "daquan-bazhuan",
  伏吟: "daquan-fuyin",
  返吟: "daquan-fanyin",
};

function deduplicate(candidates: Candidate[]): Candidate[] {
  return candidates.filter(
    (c, i) => candidates.findIndex((x) => x.upper === c.upper) === i,
  );
}

/** Exclusive passage: after the occupied ground palace, before home.
 * 《大全·涉害课》丁卯/丑时/亥将 counts 辰、戊、未、己、戌 = 5;
 * 甲午/辰时/午将 counts 辰加寅 passing 卯, 申加午 passing 丁, each 1.
 * Branches and all寄干 are separately counted; they are not藏干.
 */
function harm(
  candidate: Candidate,
  thieves: boolean,
): { depth: number; journey: string[] } {
  let depth = 0;
  const journey: string[] = [];
  const ue = BRANCH_ELEMENTS[candidate.upper];
  for (
    let p = mod(candidate.ground + 1);
    p !== candidate.upper;
    p = mod(p + 1)
  ) {
    const elems: { name: string; element: number }[] = [
      { name: branch(p), element: BRANCH_ELEMENTS[p] },
    ];
    for (let stem = 0; stem < 10; stem++) {
      if (STEM_PALACES[stem] === p)
        elems.push({
          name: "甲乙丙丁戊己庚辛壬癸"[stem],
          element: Math.floor(stem / 2),
        });
    }
    for (const e of elems) {
      if (thieves ? controls(e.element, ue) : controls(ue, e.element)) {
        depth++;
        journey.push(e.name);
      }
    }
  }
  return { depth, journey };
}

/** 孟、仲、季 order only breaks an already equal depth. */
function positionRank(ground: number): number {
  return ground % 3 === 2 ? 0 : ground % 3 === 0 ? 1 : 2;
}

export function rules(input: ManualInput): RuleResult {
  const stem = si(input.dayStem),
    day = bi(input.dayBranch);
  const palace = STEM_PALACES[stem];
  const shift = mod(bi(input.monthGeneral) - bi(input.hourBranch));
  const heaven = Array.from({ length: 12 }, (_, i) => mod(i + shift));
  const up = (p: number): number => heaven[p];
  const down = (p: number): number => mod(p - shift);
  const lessons: Lesson[] = [
    {
      lower: input.dayStem,
      lowerBranch: branch(palace),
      upper: branch(up(palace)),
      kind: "stem",
    },
    {
      lower: branch(up(palace)),
      lowerBranch: branch(up(palace)),
      upper: branch(up(up(palace))),
      kind: "branch",
    },
    {
      lower: input.dayBranch,
      lowerBranch: input.dayBranch,
      upper: branch(up(day)),
      kind: "branch",
    },
    {
      lower: branch(up(day)),
      lowerBranch: branch(up(day)),
      upper: branch(up(up(day))),
      kind: "branch",
    },
  ];
  const trace: TraceStep[] = [
    {
      id: "plate",
      title: "月将加占时，顺布天盘",
      detail: `${input.monthGeneral}将加地盘${input.hourBranch}时，天盘相对地盘顺移 ${shift} 位。`,
      sourceIds: ["daquan-jigong"],
    },
    {
      id: "lessons",
      title: "十干寄宫，建立四课",
      detail: `${input.dayStem}寄${branch(palace)}。依次取干上、干上之上、支上、支上之上：${lessons.map((l, i) => `第${i + 1}课 ${l.lower}→${l.upper}`).join("；")}。第一课生克按日干本身五行，不按寄宫地支五行。`,
      sourceIds: ["daquan-jigong"],
    },
  ];
  const lowerElement = (l: Lesson): number =>
    l.kind === "stem"
      ? Math.floor(stem / 2)
      : BRANCH_ELEMENTS[bi(l.lower as Branch)];
  const allCandidates = (thieves: boolean): Candidate[] =>
    deduplicate(
      lessons.flatMap((l, i) => {
        const ue = BRANCH_ELEMENTS[bi(l.upper)],
          le = lowerElement(l);
        return (thieves ? controls(le, ue) : controls(ue, le))
          ? [{ upper: bi(l.upper), ground: bi(l.lowerBranch), lessonIndex: i }]
          : [];
      }),
    );
  const thefts = allCandidates(true);
  const attacks = allCandidates(false);
  const active = thefts.length ? thefts : attacks;
  let method = { name: "", detail: "" };
  let transmissions: number[] = [];
  const chain = (first: number): number[] => [first, up(first), up(up(first))];

  function select(activeCandidates: Candidate[]): {
    first: number;
    name: string;
    detail: string;
  } {
    if (activeCandidates.length === 1)
      return {
        first: activeCandidates[0].upper,
        name: "贼克",
        detail: thefts.length
          ? "重审：先取一下贼上"
          : "元首：无下贼，取一上克下",
      };
    const matching = activeCandidates.filter((c) => c.upper % 2 === stem % 2);
    if (matching.length === 1)
      return {
        first: matching[0].upper,
        name: "比用",
        detail: `知一：候选${activeCandidates.map((c) => branch(c.upper)).join("、")}，取与${input.dayStem}${stem % 2 === 0 ? "阳" : "阴"}性相同的 ${branch(matching[0].upper)}`,
      };
    const candidates = matching.length ? matching : activeCandidates;
    const measured = candidates.map((c) => ({
      ...c,
      ...harm(c, thefts.length > 0),
    }));
    const deepest = Math.max(...measured.map((c) => c.depth));
    let tied = measured.filter((c) => c.depth === deepest);
    const depthDetail = measured
      .map(
        (c) =>
          `${branch(c.upper)}临${branch(c.ground)}，途经${c.journey.join("、") || "无另加克位"}，${c.depth}重`,
      )
      .join("；");
    let subtype = "涉害深浅";
    if (tied.length > 1) {
      const best = Math.min(...tied.map((c) => positionRank(c.ground)));
      tied = tied.filter((c) => positionRank(c.ground) === best);
      subtype = best === 0 ? "等深取孟" : best === 1 ? "等深取仲" : "等深取季";
    }
    if (tied.length > 1) {
      // 剛日先看干之两课，柔日先看支之两课；只在仍并列候选中先见。
      const order = stem % 2 === 0 ? [0, 1, 2, 3] : [2, 3, 0, 1];
      tied.sort(
        (a, b) => order.indexOf(a.lessonIndex) - order.indexOf(b.lessonIndex),
      );
      subtype = "复等取先见";
    }
    trace.push({
      id: "harm-depth",
      title: "涉害逐位计克",
      detail: `${depthDetail}。先比深浅，等深再取孟、仲；仍等时${stem % 2 === 0 ? "刚日干上" : "柔日支上"}先见。`,
      sourceIds: ["daquan-shehai"],
    });
    return {
      first: tied[0].upper,
      name: "涉害",
      detail: `${subtype}：${depthDetail}；取 ${branch(tied[0].upper)}`,
    };
  }

  trace.push({
    id: "lesson-controls",
    title: "先贼后克，去重比选",
    detail: `下贼上候选：${thefts.map((c) => branch(c.upper)).join("、") || "无"}；上克下候选：${attacks.map((c) => branch(c.upper)).join("、") || "无"}。重复同神只算一个发用候选。`,
    sourceIds: ["daquan-zeike", "daquan-biyong"],
  });

  if (shift === 0) {
    const first = active.length
      ? select(active).first
      : stem % 2 === 0
        ? up(palace)
        : up(day);
    let middle: number = PUNISHMENT[first];
    if (middle === first) middle = first === up(palace) ? up(day) : up(palace);
    let last: number = PUNISHMENT[middle];
    if (last === middle || last === first) last = mod(middle + 6);
    transmissions = [first, middle, last];
    method = {
      name: "伏吟",
      detail: `天盘地盘重合；${active.length ? "有克依克取用" : "无克，刚日取干上、柔日取支上"}，中末循刑；自刑及回刑用杜传、冲法`,
    };
  } else if (active.length) {
    const selected = select(active);
    transmissions = chain(selected.first);
    method =
      shift === 6
        ? {
            name: "返吟",
            detail: `有克返吟；${selected.name}取用：${selected.detail}；中末往来取冲`,
          }
        : { name: selected.name, detail: selected.detail };
  } else if (shift === 6) {
    const horse = mod(2 - (day % 4) * 3);
    transmissions = [horse, up(day), up(palace)];
    method = {
      name: "返吟",
      detail: "无克返吟（井栏／无亲）：初取日支驿马，中取支上，末取干上",
    };
  } else if (palace === day) {
    const first = stem % 2 === 0 ? mod(up(palace) + 2) : mod(up(up(day)) - 2);
    transmissions = [first, up(palace), up(palace)];
    method = {
      name: "八专",
      detail: `干支同宫，论克不论遥；${stem % 2 === 0 ? "阳日干阳顺数三位" : "阴日支阴逆数三位"}（连本位），中末同取干上`,
    };
  } else {
    const dayElement = Math.floor(stem / 2);
    const upperCandidates = [
      ...new Set(lessons.slice(1).map((l) => bi(l.upper))),
    ];
    const arrows = upperCandidates.filter((c) =>
      controls(BRANCH_ELEMENTS[c], dayElement),
    );
    const shots = upperCandidates.filter((c) =>
      controls(dayElement, BRANCH_ELEMENTS[c]),
    );
    const remote = arrows.length ? arrows : shots;
    if (remote.length) {
      const matching = remote.filter((c) => c % 2 === stem % 2);
      const finalists = remote.length === 1 ? remote : matching;
      if (finalists.length !== 1)
        throw new Error(
          `遥克取用未决：${input.dayStem}${input.dayBranch}，天盘位移${shift}`,
        );
      transmissions = chain(finalists[0]);
      method = {
        name: "遥克",
        detail: `${arrows.length ? "蒿矢：先取神遥克日" : "弹射：无神克日，取日遥克神"}；${remote.length > 1 ? "多神以阴阳比用取" : "取"} ${branch(finalists[0])}`,
      };
    } else {
      const unique = new Set(lessons.map((l) => l.upper)).size;
      if (unique === 3) {
        const first =
          stem % 2 === 0 ? up(STEM_PALACES[mod(stem + 5, 10)]) : mod(day + 4);
        transmissions = [first, up(palace), up(palace)];
        method = {
          name: "别责",
          detail: `三课无克无遥；${stem % 2 === 0 ? "刚日取日干五合寄宫上神" : "柔日取日支三合前位"}，中末同取干上`,
        };
      } else if (unique === 4) {
        transmissions =
          stem % 2 === 0
            ? [up(9), up(day), up(palace)]
            : [down(9), up(palace), up(day)];
        method = {
          name: "昴星",
          detail:
            stem % 2 === 0
              ? "刚日仰视：初取地盘酉上，中支上、末干上"
              : "柔日俯视：初取天盘酉下，中干上、末支上",
        };
      } else
        throw new Error(
          `无克无遥课体未决：${input.dayStem}${input.dayBranch}，天盘位移${shift}，${unique}课`,
        );
    }
  }

  trace.push({
    id: "transmissions",
    title: `九宗门取三传：${method.name}`,
    detail: `${method.detail}。初传 ${branch(transmissions[0])} → 中传 ${branch(transmissions[1])} → 末传 ${branch(transmissions[2])}。`,
    sourceIds: [sourceFor[method.name]],
  });

  const noble = (input.daytime ? DAY_NOBLE : NIGHT_NOBLE)[stem];
  const nobleGround = down(noble);
  const forward = nobleGround === 11 || nobleGround <= 4;
  const generals = Array.from(
    { length: 12 },
    (_, ground) =>
      GENERAL_ORDER[mod((ground - nobleGround) * (forward ? 1 : -1))],
  );
  trace.push({
    id: "generals",
    title: "起昼夜贵人，布十二天将",
    detail: `${input.dayStem}日${input.daytime ? "昼" : "夜"}贵乘天盘${branch(noble)}，临地盘${branch(nobleGround)}；临亥子丑寅卯辰顺布、临巳午未申酉戌逆布，本课${forward ? "顺" : "逆"}布。天将数组按地盘子至亥排列。逐干昼夜配表以《六壬粹言》已核影印为旁证，顺逆与天将次序以《御定六壬直指》已核影印为旁证；不冒称这些原文出自《大全》。`,
    sourceIds: ["cuiyan-guiren", "zhizhi-generals"],
  });
  return { heaven, lessons, transmissions, generals, method, trace };
}
