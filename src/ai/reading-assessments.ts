import {
  BRANCHES,
  BRANCH_ELEMENTS,
  ELEMENT_NAMES,
  bi,
  si,
  controls,
  generates,
} from "../core/constants";
import type { Category, ChartFact, ChartResult } from "../core/types";
import {
  generalReadingSourceIds,
  readingEvidence,
} from "../data/reading-evidence";
import { assessRules } from "./assessments";
import type { ReadingAssessment, ReadingContext } from "./reading-types";

export const READING_ASSESSMENT_VERSION = "reading-assessments-v3.0.5";

function relation(a: number, b: number): string {
  if (a === b) return "同五行（比和）";
  if (generates(a, b)) return "前者生后者";
  if (generates(b, a)) return "后者生前者";
  if (controls(a, b)) return "前者克后者";
  return "后者克前者";
}

/** Enriches a frozen chart; all original facts and casting times remain untouched. */
export function buildReadingContext(
  chart: ChartResult,
  category: Category,
): ReadingContext {
  const facts: ChartFact[] = chart.facts.map((fact) => ({
    ...fact,
    sourceIds: [...fact.sourceIds],
  }));
  const append = (
    id: string,
    label: string,
    value: string,
    sourceIds: string[] = [],
  ) => {
    if (!facts.some((fact) => fact.id === id))
      facts.push({ id, label, value, sourceIds });
  };
  const dayElement = Math.floor(si(chart.day.stem) / 2);
  append(
    "reading-day-elements",
    "日干支五行",
    `${chart.day.stem}属${ELEMENT_NAMES[dayElement]}；${chart.day.branch}属${ELEMENT_NAMES[BRANCH_ELEMENTS[bi(chart.day.branch)]]}。`,
  );
  chart.lessons.forEach((lesson, index) => {
    const lowerElement =
      lesson.kind === "stem"
        ? Math.floor(si(lesson.lower as typeof chart.day.stem) / 2)
        : BRANCH_ELEMENTS[bi(lesson.lowerBranch)];
    const upperElement = BRANCH_ELEMENTS[bi(lesson.upper)];
    append(
      `reading-lesson-${index + 1}-relation`,
      `第${index + 1}课上下五行`,
      `上神${lesson.upper}${ELEMENT_NAMES[upperElement]}，下为${lesson.lower}${ELEMENT_NAMES[lowerElement]}：${relation(upperElement, lowerElement)}。`,
    );
  });
  chart.transmissions.forEach((transmission, index) => {
    const element = BRANCH_ELEMENTS[bi(transmission.branch)];
    const seat = chart.heavenPlate.indexOf(transmission.branch);
    const sourceId = generalReadingSourceIds[transmission.general];
    append(
      `reading-transmission-${index + 1}-detail`,
      `${["初", "中", "末"][index]}传细项`,
      `${transmission.branch}${ELEMENT_NAMES[element]}；六亲${transmission.relative}（相对日干）；天将${transmission.general}；遁干${transmission.hiddenStem ?? "无（旬空）"}；${transmission.isVoid ? "本支旬空" : "本支不旬空"}；地盘落${seat >= 0 ? BRANCHES[seat] : "未知"}${seat >= 0 && chart.voids.includes(BRANCHES[seat]) ? "（坐旬空）" : ""}。`,
      sourceId ? [sourceId] : [],
    );
    append(
      `reading-transmission-${index + 1}-day`,
      `${["初", "中", "末"][index]}传与日干`,
      `${transmission.branch}${ELEMENT_NAMES[element]}与日干${chart.day.stem}${ELEMENT_NAMES[dayElement]}：${relation(element, dayElement)}。`,
    );
    if (index < chart.transmissions.length - 1) {
      const next = chart.transmissions[index + 1];
      append(
        `reading-chain-${index + 1}`,
        `${["初中", "中末"][index]}传关系`,
        `${transmission.branch}${ELEMENT_NAMES[element]}与${next.branch}${ELEMENT_NAMES[BRANCH_ELEMENTS[bi(next.branch)]]}：${relation(element, BRANCH_ELEMENTS[bi(next.branch)])}。`,
      );
    }
  });
  const available = new Map(
    readingEvidence.map((source) => [source.id, source]),
  );
  const assessments: ReadingAssessment[] = assessRules(chart, category)
    .filter(
      (assessment) =>
        assessment.status === "met" || assessment.status === "unknown",
    )
    .map((assessment) => ({
      id: assessment.id,
      title: assessment.title,
      kind: assessment.kind,
      status: assessment.status === "met" ? "met" : "unknown",
      statement: assessment.statement,
      factIds: [...assessment.factIds],
      clauseIds: assessment.evidenceIds.flatMap(
        (id) => available.get(id)?.clauses.map((clause) => clause.id) ?? [],
      ),
      caveats: [...assessment.caveats],
    }));
  assessments.push({
    id: "principle-three-stages",
    title: "三传按发端、转移、归结展开",
    kind: "principle",
    status: "met",
    statement: `本课三传${chart.transmissions.map((item) => item.branch).join("→")}。可据初、中、末传组织所问事情的起因、发展与收束，再结合实际生克、六亲、天将和旬空推演。`,
    factIds: chart.transmissions
      .flatMap((_, index) => [
        `transmission-${index + 1}`,
        `reading-transmission-${index + 1}-detail`,
        `reading-transmission-${index + 1}-day`,
      ])
      .concat(["reading-chain-1", "reading-chain-2"]),
    clauseIds: ["cuiyan-three-stages:quote"],
    caveats: [
      "三阶段是分析脉络，不代表三件已发生的事实；末传不单独决定全部结局。",
      "阶段排列本身不构成支持、阻碍或延期信号；必须另外引用实际生克、具体取用、旬空等适用依据。",
      "五行关系与六亲为程序盘值；单一生克或六亲名称不能推出某个具体事件。",
    ],
  });
  assessments.push({
    id: "principle-combined-conditions",
    title: "综合三传的支持与阻碍",
    kind: "principle",
    status: "met",
    statement:
      "按原文合看有利与受阻条件。本课可核对已算出的生克、六亲和旬空，把相生作为支持线索、相克或旬空作为相应限制，再说明它们作用于谁、何物及哪一传。不能仅因见生就断必成、见克或空就断必败。",
    factIds: [
      "day",
      "voids",
      ...chart.transmissions.flatMap((_, index) => [
        `transmission-${index + 1}`,
        `reading-transmission-${index + 1}-detail`,
        `reading-transmission-${index + 1}-day`,
      ]),
      "reading-chain-1",
      "reading-chain-2",
    ],
    clauseIds: ["cuiyan-combined-conditions:quote"],
    caveats: [
      "原句并列多个条件；这里不把部分条件当作全条充分条件。",
      "旬空只针对本次实际分析的三传、取用支或其地盘坐空说明影响，不把占时时支属于旬空等同于当日落空、今日不成或整件事必败。",
      "得位、禄、墓、冲、绝及旺衰细则本次未完整核定，不得仅凭这条摘句自行补算或声称已满足。",
      "六亲先展示程序的五行关系名称；具体人物与事件取象仍须说明与所问的联系，不能把财、官、子孙直接等同到账、录用或怀孕。",
    ],
  });
  const relevantGenerals = new Map<string, string[]>();
  chart.transmissions.forEach((item, index) => {
    const ids = relevantGenerals.get(item.general) ?? [];
    ids.push(
      `transmission-${index + 1}`,
      `reading-transmission-${index + 1}-detail`,
    );
    relevantGenerals.set(item.general, ids);
  });
  chart.lessons.forEach((lesson, index) => {
    const general = chart.generals[chart.heavenPlate.indexOf(lesson.upper)];
    if (!general) return;
    const id = `reading-lesson-${index + 1}-general`;
    append(
      id,
      `第${index + 1}课上神天将`,
      `${lesson.upper}乘${general}。`,
      generalReadingSourceIds[general]
        ? [generalReadingSourceIds[general]]
        : [],
    );
    const ids = relevantGenerals.get(general) ?? [];
    ids.push(`lesson-${index + 1}`, id);
    relevantGenerals.set(general, ids);
  });
  relevantGenerals.forEach((factIds, general) => {
    const sourceId = generalReadingSourceIds[general];
    if (!sourceId) return;
    assessments.push({
      id: `principle-${sourceId}`,
      title: `${general}的传统类象`,
      kind: "principle",
      status: "met",
      statement: `四课或三传实际见${general}。原句提供取象范围，结合用户所问选择有关的象义，说明它与问题的联系；不必把整串类象全套进本问。`,
      factIds,
      clauseIds: [`${sourceId}:quote`],
      caveats: [
        "原段另论旺相、休囚和生克；当前未完整实现这些条件，只作类象线索。",
        "类象不是事件已发生的证据，也不能由单一天将断定吉凶、疾病、盗窃或人物动机。",
      ],
    });
  });
  if (category === "business") {
    const seat = chart.generals.indexOf("青龙");
    if (seat >= 0 && chart.heavenPlate[seat]) {
      const branch = chart.heavenPlate[seat];
      const stageNames = chart.transmissions.flatMap((item, index) =>
        item.general === "青龙" ? [["初传", "中传", "末传"][index]] : [],
      );
      append(
        "reading-qinglong-location",
        "青龙实际所乘所临",
        `青龙乘${branch}，临地盘${BRANCHES[seat]}；${stageNames.length ? stageNames.join("、") + "见青龙" : "三传不见青龙"}；所乘支${chart.voids.includes(branch) ? "旬空" : "不旬空"}。`,
        ["cuiyan-wealth-qinglong"],
      );
      assessments.push({
        id: "principle-wealth-qinglong",
        title: "求财为何参考青龙",
        kind: "principle",
        status: "met",
        statement:
          "问题涉及求财时，青龙是本篇明确提出的观察线索。先核对它实际所乘所临、是否入传及旬空，再与本问的款项、动作和期限联系；事项类别只用于检索此条，不替代语义理解。",
        factIds: [
          "day",
          "voids",
          "reading-qinglong-location",
          "transmission-1",
          "transmission-2",
          "transmission-3",
          ...(relevantGenerals.get("青龙") ?? []),
        ],
        clauseIds: ["cuiyan-wealth-qinglong:quote"],
        caveats: [
          "这是取象依据，不是青龙一见便得财的充分条件。",
          "这句没有规定青龙必须入传才得财。青龙不入传也不能被推成钱款未落实、必延期或不利；它所乘所临仍须与其他条件合看。",
          "后文还要求旺相、生克及六宫等配合；年命与完整旺衰本轮未实施，不能声称六宫条件已全部核验。",
        ],
      });
    }
  }
  const validFactIds = new Set(facts.map((fact) => fact.id));
  assessments.forEach((assessment) => {
    assessment.factIds = [...new Set(assessment.factIds)].filter((id) =>
      validFactIds.has(id),
    );
  });
  const usedClauseIds = new Set(
    assessments.flatMap((assessment) => assessment.clauseIds),
  );
  const sources = readingEvidence
    .filter((source) =>
      source.clauses.some((clause) => usedClauseIds.has(clause.id)),
    )
    .map((source) => ({
      ...source,
      ruleIds: [...source.ruleIds],
      clauses: source.clauses.map((clause) => ({ ...clause })),
    }));
  return { facts, sources, assessments, version: READING_ASSESSMENT_VERSION };
}
