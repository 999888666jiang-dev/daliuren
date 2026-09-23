import type { ChartFact, ChartResult } from "../core/types";
import type {
  InterpretationV3,
  ReadingAssessment,
  ReadingContext,
  ReadingReferences,
  ReadingSource,
} from "./reading-types";
import { AiClientError, isRecord, validText } from "./validation";

export const READING_VERSION = "traditional-reading-v3.0.0";
export const READING_LIMITS = {
  summary: 280,
  focus: 4,
  reasoning: 8,
  literalMeaning: 220,
  application: 320,
  synthesis: 400,
  total: 4400,
} as const;

/** Known lossless provider-shape variants. The final validator remains strict. */
export function normalizeReadingResponse(value: unknown): unknown {
  if (!isRecord(value)) return value;
  let normalized = value;
  if (
    exact(value, [
      "summary",
      "tendency",
      "focus",
      "reasoning",
      "synthesis",
      "reasoningIds",
      "advice",
      "limitations",
    ]) &&
    typeof value.synthesis === "string" &&
    Array.isArray(value.reasoningIds)
  ) {
    const { reasoningIds, synthesis, ...rest } = value;
    normalized = { ...rest, synthesis: { text: synthesis, reasoningIds } };
  }
  if (
    !exact(normalized, [
      "summary",
      "tendency",
      "focus",
      "reasoning",
      "synthesis",
      "advice",
      "limitations",
    ]) ||
    !Array.isArray(normalized.advice) ||
    !normalized.advice.some(
      (item) => isRecord(item) && Object.hasOwn(item, "id"),
    )
  )
    return normalized;
  const adviceIds = new Set<string>();
  for (const item of normalized.advice) {
    if (!isRecord(item)) return normalized;
    if (exact(item, ["action", "purpose", "reasoningIds"])) continue;
    if (
      !exact(item, ["id", "action", "purpose", "reasoningIds"]) ||
      !identifier(item.id) ||
      adviceIds.has(item.id)
    )
      return normalized;
    adviceIds.add(item.id);
  }
  // Advice IDs are presentation-only in this provider variant: nothing in the
  // schema may reference advice. Text and every reasoning reference stay intact.
  return {
    ...normalized,
    advice: normalized.advice.map(({ id: _id, ...item }) => item),
  };
}

function fail(): never {
  throw new AiClientError(
    "INVALID_INTERPRETATION",
    "解读未通过盘面或引文关系校验，原课与已保存解读保持不变。",
  );
}
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const plain = (value: unknown, maximum: number): value is string =>
  validText(value, 1, maximum) &&
  !/[<>]/u.test(value) &&
  !/(?:https?:\/\/|www\.|javascript:|data:|```|\[[^\]]+\]\()/iu.test(value);
const identifier = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(value);
const unique = (values: string[]) => new Set(values).size === values.length;
const ids = (
  value: unknown,
  allowed: Set<string>,
  minimum = 1,
  maximum = 16,
): value is string[] =>
  Array.isArray(value) &&
  value.length >= minimum &&
  value.length <= maximum &&
  value.every((id) => typeof id === "string" && allowed.has(id)) &&
  unique(value);
const texts = (
  value: unknown,
  minimum: number,
  maximum: number,
  length: number,
): value is string[] =>
  Array.isArray(value) &&
  value.length >= minimum &&
  value.length <= maximum &&
  value.every((item) => plain(item, length)) &&
  unique(value);

const rawIds = (value: unknown, maximum: number): value is string[] =>
  Array.isArray(value) &&
  value.length <= maximum &&
  value.every(identifier) &&
  unique(value);
function sourceUrl(value: unknown): value is string {
  if (!validText(value, 1, 3000)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Archive snapshots are self-contained. No lookup against a newer corpus is allowed here. */
function checkedContext(value: unknown, chart?: ChartResult): ReadingContext {
  if (
    !isRecord(value) ||
    !exact(value, ["facts", "sources", "assessments", "version"]) ||
    !plain(value.version, 120) ||
    !Array.isArray(value.facts) ||
    value.facts.length < 1 ||
    value.facts.length > 160 ||
    !Array.isArray(value.sources) ||
    value.sources.length > 80 ||
    !Array.isArray(value.assessments) ||
    value.assessments.length > 100
  )
    fail();
  const facts: ChartFact[] = value.facts.map((fact) => {
    if (
      !isRecord(fact) ||
      !exact(fact, ["id", "label", "value", "sourceIds"]) ||
      !identifier(fact.id) ||
      !plain(fact.label, 200) ||
      !plain(fact.value, 4000) ||
      !rawIds(fact.sourceIds, 48)
    )
      fail();
    return {
      id: fact.id,
      label: fact.label,
      value: fact.value,
      sourceIds: [...fact.sourceIds],
    };
  });
  if (!unique(facts.map((fact) => fact.id))) fail();
  const factMap = new Map(facts.map((fact) => [fact.id, fact]));
  // Derived facts may be added; the original plate and its recorded provenance stay unchanged.
  for (const original of chart?.facts ?? []) {
    const supplied = factMap.get(original.id);
    if (
      !supplied ||
      supplied.label !== original.label ||
      supplied.value !== original.value ||
      supplied.sourceIds.length !== original.sourceIds.length ||
      supplied.sourceIds.some((id, index) => id !== original.sourceIds[index])
    )
      fail();
  }
  const sources: ReadingSource[] = value.sources.map((source) => {
    if (
      !isRecord(source) ||
      !exact(source, [
        "id",
        "title",
        "quote",
        "work",
        "edition",
        "volume",
        "page",
        "sourceUrl",
        "imageUrl",
        "verification",
        "reviewNote",
        "ruleIds",
        "clauses",
      ]) ||
      !identifier(source.id) ||
      source.verification !== "verified" ||
      !plain(source.quote, 16000) ||
      !plain(source.title, 300) ||
      !plain(source.work, 300) ||
      !plain(source.edition, 500) ||
      !plain(source.volume, 300) ||
      !plain(source.page, 200) ||
      !plain(source.reviewNote, 4000) ||
      !sourceUrl(source.sourceUrl) ||
      typeof source.imageUrl !== "string" ||
      !/^sources\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/u.test(
        source.imageUrl,
      ) ||
      !rawIds(source.ruleIds, 48) ||
      !Array.isArray(source.clauses) ||
      source.clauses.length < 1 ||
      source.clauses.length > 80
    )
      fail();
    const quote = source.quote;
    const clauses = source.clauses.map((clause) => {
      if (
        !isRecord(clause) ||
        !exact(clause, ["id", "text"]) ||
        !identifier(clause.id) ||
        !plain(clause.text, 5000) ||
        !quote.includes(clause.text)
      )
        fail();
      return { id: clause.id, text: clause.text };
    });
    return {
      id: source.id,
      title: source.title,
      quote,
      work: source.work,
      edition: source.edition,
      volume: source.volume,
      page: source.page,
      sourceUrl: source.sourceUrl,
      imageUrl: source.imageUrl,
      verification: "verified",
      reviewNote: source.reviewNote,
      ruleIds: [...source.ruleIds],
      clauses,
    };
  });
  const clauseIds = sources.flatMap((source) =>
    source.clauses.map((clause) => clause.id),
  );
  if (!unique(sources.map((source) => source.id)) || !unique(clauseIds)) fail();
  const allFacts = new Set(factMap.keys());
  const allClauses = new Set(clauseIds);
  const assessments: ReadingAssessment[] = value.assessments.map((item) => {
    if (
      !isRecord(item) ||
      !exact(item, [
        "id",
        "title",
        "kind",
        "status",
        "statement",
        "factIds",
        "clauseIds",
        "caveats",
      ]) ||
      !identifier(item.id) ||
      !plain(item.title, 300) ||
      !["procedure", "principle", "judgement"].includes(String(item.kind)) ||
      !["met", "unknown"].includes(String(item.status)) ||
      !plain(item.statement, 3000) ||
      !ids(item.factIds, allFacts, item.status === "met" ? 1 : 0, 48) ||
      !ids(item.clauseIds, allClauses, item.status === "met" ? 1 : 0, 24) ||
      !texts(item.caveats, 0, 12, 1000)
    )
      fail();
    return {
      id: item.id,
      title: item.title,
      kind: item.kind as ReadingAssessment["kind"],
      status: item.status as ReadingAssessment["status"],
      statement: item.statement,
      factIds: [...item.factIds],
      clauseIds: [...item.clauseIds],
      caveats: [...item.caveats],
    };
  });
  if (!unique(assessments.map((item) => item.id))) fail();
  return { facts, sources, assessments, version: value.version };
}

/** Reject broken context before spending a request, while retaining historical source snapshots. */
export function validateReadingContext(
  value: unknown,
  chart: ChartResult,
): ReadingContext {
  return checkedContext(value, chart);
}

function negated(before: string) {
  // Negation belongs to a clause, not a fixed character window. A contrast or
  // a new clause ends its scope; enumeration punctuation does not.
  const tail =
    before.split(/[，,。！？；;\n]|但是|然而|不过|可是|却|但|而是/u).at(-1) ??
    "";
  return /(?:不能|不可|不得|不应|不宜|不代表|不等于|不[^，,。；;]*?(?:推|断|判|说明|涉及|用于|作|做|证明|意味着|保证)|无法|无从|不足以|不是|并非|而非|尚未|未能|未确认|没有证据|避免|不要)[^，,。；;]*$/u.test(
    tail,
  );
}

function unresolvedAfter(after: string) {
  // “年命未填实未判” names an unresolved proposition, rather than asserting
  // that proposition. Keep this local to the immediately following predicate.
  return /^(?:与否|是否)?(?:尚)?(?:未判|未核(?:定|实)?|待核|待判|不明|未知|有待核|尚待核)/u.test(
    after,
  );
}

function unsupportedClaim(text: string) {
  if (
    /《[^》]+》|(?:原文|古籍|经典|古书|古人)\s*(?:曰|云|说|有言|记载|指出|[：:])|(?:原文(?:为|是)|书中记载)\s*[：:“「『]/u.test(
      text,
    )
  )
    return true;
  return text.split(/[，,。！？；;\n]/u).some((clause) => {
    for (const match of clause.matchAll(
      /必败|必中|必定|必然(?:成功|失败|会|能)|一定(?:会|成功|失败)|百分之百|保证(?:成功|失败|收益|盈利)|注定|必有(?:灾|祸)|准确预测|(?:大|小|高|低)概率|(?:很|极|非常|十分)可能|概率(?:很|较|偏|更|极|非常|十分|相当)?(?:高|低|大|小)|\d+(?:\.\d+)?\s*[%％]|百分之[零〇一二三四五六七八九十百两\d.]+|(?:有|约|达|为|是)[一二三四五六七八九十两]成(?:概率|把握|可能|机会)/gu,
    )) {
      if (!negated(clause.slice(0, match.index))) return true;
    }
    for (const match of clause.matchAll(
      /(?:年命|本命|行年)(?:已|已经)填实|(?:年命|本命|行年)填实(?:成立|已成立|已满足|完成)/gu,
    )) {
      if (!negated(clause.slice(0, match.index))) return true;
    }
    for (const match of clause.matchAll(/欺骗|欺诈|诈骗|骗你|骗子|骗钱/gu)) {
      const before = clause.slice(0, match.index);
      if (
        negated(before) ||
        /(?:是否|有无|可能|如果|若|警惕|防范)[^，,。；;]{0,18}$/u.test(before)
      )
        continue;
      if (
        /(?:对方|某人|有人|领导|同事|朋友|伴侣|对象|合作方|合伙人|家人|丈夫|妻子|男友|女友|他|她)[^，,。；;]{0,24}$/u.test(
          before,
        )
      )
        return true;
    }
    return false;
  });
}

function contradictsChart(
  text: string,
  context: ReadingContext,
  chart?: ChartResult,
) {
  const factValue = (id: string) =>
    context.facts.find((fact) => fact.id === id)?.value;
  for (const [index, label] of ["初传", "中传", "末传"].entries()) {
    const saved = factValue(`transmission-${index + 1}`)?.match(
      /^([甲乙丙丁戊己庚辛壬癸空])([子丑寅卯辰巳午未申酉戌亥])/u,
    );
    const branch = chart?.transmissions[index].branch ?? saved?.[2];
    const stem =
      chart?.transmissions[index].hiddenStem ??
      (saved?.[1] === "空" ? null : saved?.[1]);
    const expression = new RegExp(
      `${label}(?:为|是|：|:|取)?\\s*([甲乙丙丁戊己庚辛壬癸])?([子丑寅卯辰巳午未申酉戌亥])`,
      "gu",
    );
    for (const match of text.matchAll(expression)) {
      if ((branch && match[2] !== branch) || (match[1] && match[1] !== stem))
        return true;
    }
  }
  for (const match of text.matchAll(
    /(?:日柱|日干支|本课日辰)(?:为|是|：|:)?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/gu,
  )) {
    const day = chart ? chart.day.stem + chart.day.branch : factValue("day");
    if (day && match[1] !== day) return true;
  }
  for (const match of text.matchAll(
    /本课(?:采用|以|为|属于|按)?\s*(贼克|比用|涉害|遥克|昴星|别责|八专|伏吟|返吟)/gu,
  )) {
    const method =
      chart?.method.name ?? factValue("method")?.split(/[：:]/u)[0];
    if (method && match[1] !== method) return true;
  }
  return false;
}

function procedurePrediction(text: string) {
  return text.split(/[，,。！？；;\n]/u).some((clause) => {
    for (const match of clause.matchAll(
      /偏吉|偏凶|偏顺|有利|不利|吉利|凶险|成功|失败|成败|吉凶|财运|将会|预示|象征/gu,
    )) {
      if (!negated(clause.slice(0, match.index))) return true;
    }
    return false;
  });
}

/** These tempting shortcuts are not licensed by the currently supplied rules. */
function unlicensedInference(text: string) {
  const asserted = (pattern: RegExp, targetGroup?: number) =>
    [...text.matchAll(pattern)].some((match) => {
      const at =
        (match.index ?? 0) +
        (targetGroup ? match[0].lastIndexOf(match[targetGroup]) : 0);
      const before = text.slice(0, at);
      return (
        !negated(before) &&
        !unresolvedAfter(text.slice((match.index ?? 0) + match[0].length)) &&
        !/(?:不把|不将)[^。；;\n]*$/u.test(before)
      );
    });
  if (
    asserted(
      /(?:占时|占時|时支|時支|时辰|時辰)[^。；;\n]{0,24}(?:旬空|空亡|落空|空象)[^。；;\n]{0,24}(?:说明|所以|因此|意味着|表示|代表|故|导致|预示|也就是)[^。；;\n]{0,12}((?:今天|今日|当日|本日|时间锚|時間錨)[^。；;\n]{0,24}(?:落空|空象|不成|难成|收不到|到不了|不能到账|无法到账|无望))/gu,
      1,
    )
  )
    return true;
  if (asserted(/(?:年命|本命|行年)(?:尚未|未|没有|没能)填实/gu)) return true;
  if (
    asserted(
      /(?:比和|同五行|由生转比)[^。；;\n]{0,100}(力量(?:转为|变得|趋于)?平缓|(?:缺少|缺乏|没有|无)(?:有效|强力|足够|进一步|明显|实际|当日|到账|的){0,8}(?:推动|动力|助力)|推动力?(?:不足|减弱|偏弱)|动力不足|力度不足|无进展|停滞|拖延|延迟|推迟|偏阻|受阻|不利|难成)/gu,
      1,
    )
  )
    return true;
  if (
    asserted(
      /(?:没有|缺乏|缺少|未见|不见)[^。；;\n]{0,15}(?:有利|支持|生扶|生合|助力|推动)[^。；;\n]{0,30}(?:所以|因此|故|可见|说明|意味着|导致)[^。；;\n]{0,15}(偏阻|不利|失败|不成|难成|延迟|推迟)/gu,
      1,
    )
  )
    return true;
  return false;
}

function frameworkProgressClaim(text: string) {
  return [
    ...text.matchAll(
      /非当日(?:即)?结|(?:今天|今日|当日|目前|现在)(?:仍|还|正)?(?:处于|在)[^。；;\n]{0,12}(?:过程|中途|途中)|(?:不是|并非|不会|难以)一蹴而就|(?:需要|必须)等待/gu,
    ),
  ].some((match) => !negated(text.slice(0, match.index)));
}

function substitutesChartForTranslation(text: string) {
  return /(?:初传|中传|末传)(?:为|是|：|:)?\s*[甲乙丙丁戊己庚辛壬癸]?[子丑寅卯辰巳午未申酉戌亥]|旬空(?:为|是|：|:)\s*[子丑寅卯辰巳午未申酉戌亥]/u.test(
    text,
  );
}

function wrongClauseAttribution(text: string, context: ReadingContext) {
  const xuanwu = context.sources.find(
    (source) => source.id === "cuiyan-general-xuanwu",
  );
  if (!xuanwu || /約契|约契/u.test(xuanwu.quote)) return false;
  const hasTiankongContract = context.sources.some(
    (source) =>
      source.id === "cuiyan-general-tiankong" &&
      /約契|约契/u.test(source.quote),
  );
  // A hard attribution check is limited to a single clause. Crossing commas,
  // multiple subjects, or a coordinated explanation requires human review.
  return [...text.matchAll(/玄武[^，,。；;\n]{0,10}(約契|约契)/gu)].some(
    (match) => {
      // A joint paraphrase of supplied Tiankong and Xuanwu clauses is not an
      // assertion that Xuanwu alone owns every image in their combined list.
      const prefix = text.slice(0, match.index);
      if (
        hasTiankongContract &&
        (/天空(?:[、和与及]|以及)\s*$/u.test(prefix) ||
          /^玄武(?:[、和与及]|以及)\s*天空/u.test(match[0]))
      )
        return false;
      const before = text.slice(
        0,
        (match.index ?? 0) + match[0].length - match[1].length,
      );
      return (
        !negated(before) &&
        !/玄武[^。；;\n]{0,12}(?:没有|未载|不含|不主|未主)[^。；;\n]{0,6}$/u.test(
          before,
        )
      );
    },
  );
}

/** Linguistic ambiguity is a review cue, not a failed proof or a verdict. */
export function readingProseReviewNotes(
  interpretation: InterpretationV3,
): string[] {
  const text = [
    interpretation.summary,
    ...interpretation.focus.map((item) => item.explanation),
    ...interpretation.reasoning.flatMap((item) => [
      item.literalMeaning,
      item.application,
    ]),
    interpretation.synthesis.text,
    ...interpretation.advice.flatMap((item) => [item.action, item.purpose]),
    ...interpretation.limitations,
  ];
  const coordinatedAttribution = text.some((part) =>
    part
      .split(/[。！？；;\n]/u)
      .some(
        (clause) =>
          /天空/u.test(clause) &&
          /玄武/u.test(clause) &&
          /約契|约契/u.test(clause),
      ),
  );
  return coordinatedAttribution
    ? [
        "本次合并解释了天空与玄武的类象，约契须归于所引天空原句；并列语句的具体归因需对照原句审阅，引用关系通过不等于自然语言推演已被证明。",
      ]
    : [];
}

/** Deterministic caveats must also be rendered from the context; models cannot erase them. */
export function readingBoundaryNotes(
  context: ReadingContext,
  interpretation?: InterpretationV3,
): string[] {
  const used = new Set(
    interpretation
      ? [...interpretation.focus, ...interpretation.reasoning].flatMap(
          (item) => item.assessmentIds,
        )
      : [],
  );
  return [
    ...new Set(
      context.assessments
        .filter((item) => item.status === "unknown" || used.has(item.id))
        .flatMap((item) => item.caveats)
        .concat(interpretation ? readingProseReviewNotes(interpretation) : []),
    ),
  ];
}

export function validateReading(
  value: unknown,
  suppliedContext: ReadingContext,
  chart?: ChartResult,
): InterpretationV3 {
  const context = checkedContext(suppliedContext, chart);
  const prose = (text: unknown, maximum: number): text is string =>
    plain(text, maximum) &&
    !unsupportedClaim(text) &&
    !unlicensedInference(text) &&
    !wrongClauseAttribution(text, context) &&
    !contradictsChart(text, context, chart);
  if (
    !isRecord(value) ||
    !exact(value, [
      "summary",
      "tendency",
      "focus",
      "reasoning",
      "synthesis",
      "advice",
      "limitations",
    ]) ||
    !prose(value.summary, READING_LIMITS.summary) ||
    !["favorable", "unfavorable", "mixed", "undetermined"].includes(
      String(value.tendency),
    ) ||
    !Array.isArray(value.focus) ||
    value.focus.length > READING_LIMITS.focus ||
    !Array.isArray(value.reasoning) ||
    value.reasoning.length < 1 ||
    value.reasoning.length > READING_LIMITS.reasoning ||
    !Array.isArray(value.advice) ||
    value.advice.length > 3 ||
    !texts(value.limitations, 0, 5, 240) ||
    !value.limitations.every((text) => prose(text, 240))
  )
    fail();
  const met = new Map(
    context.assessments
      .filter((item) => item.status === "met")
      .map((item) => [item.id, item]),
  );
  const factIds = new Set(context.facts.map((item) => item.id));
  const clauseIds = new Set(
    context.sources.flatMap((source) =>
      source.clauses.map((clause) => clause.id),
    ),
  );
  const references = (
    item: Record<string, unknown>,
  ): { ids: ReadingReferences; selected: ReadingAssessment[] } => {
    if (
      !ids(item.factIds, factIds) ||
      !ids(item.assessmentIds, new Set(met.keys()), 1, 12) ||
      !ids(item.clauseIds, clauseIds, 1, 16)
    )
      fail();
    const selected = item.assessmentIds.map((id) => met.get(id)!);
    const selectedFacts = new Set(
      selected.flatMap((assessment) => assessment.factIds),
    );
    const selectedClauses = new Set(
      selected.flatMap((assessment) => assessment.clauseIds),
    );
    const facts = item.factIds;
    const clauses = item.clauseIds;
    if (
      facts.some((id) => !selectedFacts.has(id)) ||
      clauses.some((id) => !selectedClauses.has(id)) ||
      selected.some(
        (assessment) =>
          !assessment.factIds.some((id) => facts.includes(id)) ||
          !assessment.clauseIds.every((id) => clauses.includes(id)),
      )
    )
      fail();
    return {
      ids: {
        factIds: facts,
        assessmentIds: item.assessmentIds,
        clauseIds: clauses,
      },
      selected,
    };
  };
  const allSectionIds = new Set<string>();
  const sectionId = (value: unknown): string => {
    if (!identifier(value) || allSectionIds.has(value)) fail();
    allSectionIds.add(value);
    return value;
  };
  const focus: InterpretationV3["focus"] = value.focus.map((item) => {
    if (
      !isRecord(item) ||
      !exact(item, [
        "id",
        "title",
        "explanation",
        "factIds",
        "assessmentIds",
        "clauseIds",
      ]) ||
      !prose(item.title, 60) ||
      !prose(item.explanation, 240)
    )
      fail();
    const checked = references(item);
    if (
      checked.selected.every((assessment) => assessment.kind === "procedure") &&
      procedurePrediction(item.explanation)
    )
      fail();
    return {
      id: sectionId(item.id),
      title: item.title,
      explanation: item.explanation,
      ...checked.ids,
    };
  });
  const nonProcedural = new Set<string>();
  const usedJudgements = new Set<string>();
  const reasoning: InterpretationV3["reasoning"] = value.reasoning.map(
    (item) => {
      if (
        !isRecord(item) ||
        !exact(item, [
          "id",
          "stage",
          "title",
          "literalMeaning",
          "application",
          "contribution",
          "factIds",
          "assessmentIds",
          "clauseIds",
        ]) ||
        ![
          "selection",
          "lessons",
          "transmissions",
          "generals",
          "conditions",
        ].includes(String(item.stage)) ||
        !prose(item.title, 60) ||
        !prose(item.literalMeaning, READING_LIMITS.literalMeaning) ||
        substitutesChartForTranslation(item.literalMeaning) ||
        !prose(item.application, READING_LIMITS.application) ||
        !["supports", "opposes", "limits", "describes"].includes(
          String(item.contribution),
        )
      )
        fail();
      const checked = references(item);
      const id = sectionId(item.id);
      const procedureOnly = checked.selected.every(
        (assessment) => assessment.kind === "procedure",
      );
      const frameworkOnly = checked.selected.every(
        (assessment) =>
          assessment.kind === "procedure" ||
          assessment.id === "principle-three-stages",
      );
      if (
        frameworkOnly &&
        (item.contribution !== "describes" ||
          frameworkProgressClaim(
            item.title + "。" + item.literalMeaning + "。" + item.application,
          ))
      )
        fail();
      if (
        procedureOnly &&
        (item.contribution !== "describes" ||
          procedurePrediction(item.literalMeaning + "。" + item.application))
      )
        fail();
      if (!frameworkOnly) nonProcedural.add(id);
      checked.selected
        .filter((assessment) => assessment.kind === "judgement")
        .forEach((assessment) => usedJudgements.add(assessment.id));
      return {
        id,
        stage: item.stage as InterpretationV3["reasoning"][number]["stage"],
        title: item.title,
        literalMeaning: item.literalMeaning,
        application: item.application,
        contribution:
          item.contribution as InterpretationV3["reasoning"][number]["contribution"],
        ...checked.ids,
      };
    },
  );
  // Applicable judgements include adverse and limiting structures. They cannot be cherry-picked.
  if (
    [...met.values()].some(
      (item) => item.kind === "judgement" && !usedJudgements.has(item.id),
    )
  )
    fail();
  const allReasoningIds = new Set(reasoning.map((item) => item.id));
  if (
    !isRecord(value.synthesis) ||
    !exact(value.synthesis, ["text", "reasoningIds"]) ||
    !prose(value.synthesis.text, READING_LIMITS.synthesis) ||
    !ids(
      value.synthesis.reasoningIds,
      allReasoningIds,
      1,
      READING_LIMITS.reasoning,
    )
  )
    fail();
  const synthesized = new Set(value.synthesis.reasoningIds);
  if (
    reasoning.some(
      (item) =>
        (item.contribution !== "describes" ||
          item.assessmentIds.some((id) => met.get(id)?.kind === "judgement")) &&
        !synthesized.has(item.id),
    )
  )
    fail();
  const contributions = new Set(
    reasoning
      .filter((item) => synthesized.has(item.id) && nonProcedural.has(item.id))
      .map((item) => item.contribution),
  );
  if (
    nonProcedural.size === 0 &&
    (procedurePrediction(value.summary) ||
      procedurePrediction(value.synthesis.text))
  )
    fail();
  if (
    (value.tendency === "favorable" && !contributions.has("supports")) ||
    (value.tendency === "unfavorable" && !contributions.has("opposes")) ||
    (value.tendency === "mixed" &&
      (!contributions.has("supports") ||
        (!contributions.has("opposes") && !contributions.has("limits"))))
  )
    fail();
  const advice: InterpretationV3["advice"] = value.advice.map((item) => {
    if (
      !isRecord(item) ||
      !exact(item, ["action", "purpose", "reasoningIds"]) ||
      !prose(item.action, 180) ||
      !prose(item.purpose, 180) ||
      !ids(item.reasoningIds, allReasoningIds, 1, 4)
    )
      fail();
    return {
      action: item.action,
      purpose: item.purpose,
      reasoningIds: item.reasoningIds,
    };
  });
  const proseLength =
    value.summary.length +
    focus.reduce(
      (sum, item) => sum + item.title.length + item.explanation.length,
      0,
    ) +
    reasoning.reduce(
      (sum, item) =>
        sum +
        item.title.length +
        item.literalMeaning.length +
        item.application.length,
      0,
    ) +
    value.synthesis.text.length +
    advice.reduce(
      (sum, item) => sum + item.action.length + item.purpose.length,
      0,
    ) +
    value.limitations.reduce((sum, text) => sum + text.length, 0);
  if (proseLength > READING_LIMITS.total) fail();
  return {
    summary: value.summary,
    tendency: value.tendency as InterpretationV3["tendency"],
    focus,
    reasoning,
    synthesis: {
      text: value.synthesis.text,
      reasoningIds: value.synthesis.reasoningIds,
    },
    advice,
    limitations: value.limitations,
  };
}
