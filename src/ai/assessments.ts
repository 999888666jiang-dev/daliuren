import {
  BRANCHES,
  BRANCH_ELEMENTS,
  bi,
  controls,
  generates,
  si,
} from "../core/constants";
import type { Category, ChartResult } from "../core/types";
import { evidence } from "../data/evidence";
import type { RuleAssessment } from "./types";

export const ASSESSMENT_VERSION = "rule-assessments-v1.0.0";
const LIMIT = "本条只说明已核传统条件，不证明现实事件必然发生。";
const FILLING =
  "年命填实未判；即使提供本命或行年，也不能将其视为已排除或已满足。";

/** This layer evaluates reviewed conditions. It does not add a new divination method. */
export function assessRules(
  chart: ChartResult,
  category: Category,
): RuleAssessment[] {
  const facts = new Set(chart.facts.map((f) => f.id));
  const sources = new Set(
    evidence.filter((e) => e.verification === "verified").map((e) => e.id),
  );
  const keepFacts = (ids: string[]) => ids.filter((id) => facts.has(id));
  const make = (value: RuleAssessment): RuleAssessment => ({
    ...value,
    factIds: keepFacts(value.factIds),
    evidenceIds: value.evidenceIds.filter((id) => sources.has(id)),
  });
  const chainFacts = [
    "day",
    "transmission-1",
    "transmission-2",
    "transmission-3",
  ];
  const lessonFacts = ["day", "lesson-1", "lesson-2", "lesson-3", "lesson-4"];
  const hasLessons =
    chart.lessons.length === 4 && lessonFacts.every((id) => facts.has(id));
  const methodEvidence = evidence
    .filter(
      (e) =>
        e.verification === "verified" && e.ruleIds.includes(chart.method.name),
    )
    .map((e) => e.id);
  const hasTransmissions =
    chart.transmissions.length === 3 &&
    ["method", ...chainFacts.slice(1)].every((id) => facts.has(id)) &&
    methodEvidence.length > 0;
  const results: RuleAssessment[] = [
    make({
      id: "procedure-jigong",
      title: "十干寄宫与四课",
      kind: "procedure",
      status: hasLessons ? "met" : "unknown",
      statement: hasLessons
        ? "按已冻结的十干寄宫规则建立四课。"
        : "四课或对应事实不完整，不能确认排盘步骤。",
      factIds: lessonFacts,
      evidenceIds: ["daquan-jigong"],
      caveats: ["寄宫是排盘程序，不能直接推出事情吉凶。"],
      missingInputs: hasLessons ? [] : ["完整四课及其事实记录"],
    }),
    make({
      id: "procedure-transmissions",
      title: "九宗门取三传",
      kind: "procedure",
      status: hasTransmissions ? "met" : "unknown",
      statement: hasTransmissions
        ? `本课按${chart.method.name}取三传。`
        : "三传、取传事实或已核程序依据不完整，不能确认步骤。",
      factIds: ["method", ...chainFacts.slice(1)],
      evidenceIds: methodEvidence,
      caveats: ["取传法说明算法路径，不能把取传口诀当作所问事情的吉凶判断。"],
      missingInputs: hasTransmissions
        ? []
        : ["完整三传、取传事实及已核程序依据"],
    }),
  ];
  const upper = chart.lessons[0]?.upper;
  const seat = upper ? chart.heavenPlate.indexOf(upper) : -1;
  const can16 =
    upper !== undefined &&
    seat >= 0 &&
    typeof chart.generals[seat] === "string" &&
    ["lesson-1", "voids"].every((id) => facts.has(id));
  const hit16 =
    can16 && chart.voids.includes(upper!) && chart.generals[seat] === "天空";
  results.push(
    make({
      id: "bifa-016",
      title: "空上乘空的已核条件",
      kind: "judgement",
      status: !can16 ? "unknown" : hit16 ? "met" : "not_met",
      statement: !can16
        ? "缺少日上神、旬空或所乘天将，不能判断。"
        : hit16
          ? "日上神旬空，并且乘天空，符合本版已核的局部条件。"
          : "日上神旬空且乘天空的组合未满足。",
      factIds: ["lesson-1", "voids"],
      evidenceIds: ["bifa-016"],
      caveats: [
        "仅使用已核的日上神局部条件，不泛化为任一空亡都符合本格。",
        LIMIT,
      ],
      missingInputs: can16 ? [] : ["日上神、旬空及所乘天将"],
    }),
  );
  const validChain =
    chart.transmissions.length === 3 &&
    chainFacts.every((id) => facts.has(id)) &&
    chart.transmissions.every((t) => BRANCHES.includes(t.branch)) &&
    si(chart.day.stem) >= 0;
  const es = chart.transmissions.map((t) => BRANCH_ELEMENTS[bi(t.branch)]);
  const dayElement = Math.floor(si(chart.day.stem) / 2);
  const lifeForward =
    validChain &&
    generates(es[0], es[1]) &&
    generates(es[1], es[2]) &&
    generates(es[2], dayElement);
  const lifeReverse =
    validChain &&
    generates(es[2], es[1]) &&
    generates(es[1], es[0]) &&
    generates(es[0], dayElement);
  const life = lifeForward || lifeReverse;
  const controlForward =
    validChain &&
    controls(es[0], es[1]) &&
    controls(es[1], es[2]) &&
    controls(es[2], dayElement);
  const controlReverse =
    validChain &&
    controls(es[2], es[1]) &&
    controls(es[1], es[0]) &&
    controls(es[0], dayElement);
  const canEmpty =
    validChain &&
    facts.has("voids") &&
    chart.heavenPlate.length === 12 &&
    chart.transmissions.every((t) => chart.heavenPlate.includes(t.branch));
  const empty =
    canEmpty &&
    chart.transmissions.some(
      (t) =>
        t.isVoid ||
        chart.voids.includes(BRANCHES[chart.heavenPlate.indexOf(t.branch)]),
    );
  const applicable31 = ["career", "business", "general"].includes(category);
  const chainStatement = lifeForward
    ? "初生中、中生末、末生日干"
    : "末生中、中生初、初生日干";
  const status31 = !applicable31
    ? "not_applicable"
    : !validChain || (life && !canEmpty)
      ? "unknown"
      : !life
        ? "not_met"
        : empty
          ? "unknown"
          : "met";
  results.push(
    make({
      id: "bifa-031",
      title: "三传递生的已核条件",
      kind: "judgement",
      status: status31,
      statement: !applicable31
        ? "本版未将此举荐条文用于该问题类别。"
        : !validChain
          ? "三传或日干信息不完整，不能判断递生。"
          : !life
            ? "未形成递生并最终生日干的完整相生链。"
            : !canEmpty
              ? `${chainStatement}；旬空及坐空条件未判。`
              : empty
                ? `${chainStatement}，但遇旬空或坐旬空，不能作无条件举荐判断。`
                : `${chainStatement}，三传无旬空或坐旬空。`,
      factIds: [...chainFacts, "voids"],
      evidenceIds: ["bifa-031"],
      caveats: [
        "该摘句只实现已核的局部结构条件，不是全部占类的完整取用法。",
        ...(life && empty ? [FILLING] : []),
        LIMIT,
      ],
      missingInputs: !applicable31
        ? []
        : !validChain
          ? ["日干与完整三传"]
          : life && !canEmpty
            ? ["三传旬空及地盘坐空"]
            : life && empty
              ? ["年命填实规则未实现"]
              : [],
    }),
  );
  results.push(
    make({
      id: "bifa-031-void",
      title: "递生遇空的限制",
      kind: "judgement",
      status: !applicable31
        ? "not_applicable"
        : !validChain || (life && !canEmpty)
          ? "unknown"
          : life && empty
            ? "met"
            : "not_met",
      statement: !applicable31
        ? "本版未将此举荐限制用于该问题类别。"
        : !validChain || (life && !canEmpty)
          ? "尚不足以确认递生遇空的组合。"
          : life && empty
            ? "完整递生链遇三传旬空或坐旬空；这里只确认限制条件出现。"
            : "未满足完整递生链同时遇空的条件。",
      factIds: [...chainFacts, "voids"],
      evidenceIds: ["bifa-031-void"],
      caveats: [
        FILLING,
        "不能依据本条断定必败；原文后续存在年命填实例，当前没有实现其全部判定。",
        LIMIT,
      ],
      missingInputs: !applicable31
        ? []
        : !validChain
          ? ["日干与完整三传"]
          : life && !canEmpty
            ? ["三传旬空及地盘坐空", "年命填实规则未实现"]
            : life && empty
              ? ["年命填实规则未实现"]
              : [],
    }),
  );
  const control = controlForward || controlReverse;
  results.push(
    make({
      id: "bifa-032",
      title: "三传互克的已核条件",
      kind: "judgement",
      status: !validChain ? "unknown" : control ? "met" : "not_met",
      statement: !validChain
        ? "三传或日干信息不完整，不能判断互克。"
        : controlForward
          ? "初克中、中克末、末克日干，符合所核结构。"
          : controlReverse
            ? "末克中、中克初、初克日干，符合所核结构。"
            : "未满足三传连环克并最终克日干的结构。",
      factIds: chainFacts,
      evidenceIds: ["bifa-032"],
      caveats: [
        "不能由传统象义断言现实中有人欺骗，更不能指认具体人物。",
        LIMIT,
      ],
      missingInputs: validChain ? [] : ["日干与完整三传"],
    }),
  );
  return results;
}
