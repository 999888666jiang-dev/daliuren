import type { Category } from "../core/types";

export type MeaningBasis =
  "explicit" | "paraphrase" | "default_self" | "unknown";
export type MeaningSource =
  "question" | "answer:scope" | "answer:category" | "answer:object";
export interface MeaningRef {
  source: MeaningSource;
  quote: string;
}
export interface MeaningField {
  value: string | null;
  basis: MeaningBasis;
  refs: MeaningRef[];
}
export interface IntentMeaning {
  version: "meaning-v1";
  topicLabel: MeaningField;
  questionKind:
    "evaluation" | "comparison" | "outcome" | "timing" | "advice" | "unclear";
  focus: MeaningField;
  subject: MeaningField & { role: "self" | "other" | "group" | "unknown" };
  action: MeaningField;
  objects: MeaningField[];
  goal: MeaningField;
  time: MeaningField & {
    dateBasis: "explicit" | "relative" | "unspecified";
    period: "morning" | "noon" | "afternoon" | "evening" | "night" | null;
  };
}
export interface MeaningSources {
  question: string;
  answers?: Record<string, string>;
}

const FIELD_KEYS = ["value", "basis", "refs"];
const SOURCE_NAMES: readonly MeaningSource[] = [
  "question",
  "answer:scope",
  "answer:category",
  "answer:object",
];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
function invalid(): never {
  throw new Error("问题理解的语义字段或原文依据无效");
}
function text(value: unknown, max = 240): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/u.test(value) ||
    /(?:https?:\/\/|javascript:|data:|```)/iu.test(value)
  )
    invalid();
  return value;
}
const unknown = (): MeaningField => ({
  value: null,
  basis: "unknown",
  refs: [],
});
function field(
  value: string | null,
  quote: string | null,
  basis: MeaningBasis = "explicit",
  source: MeaningSource = "question",
): MeaningField {
  return value && quote
    ? { value, basis, refs: [{ source, quote }] }
    : unknown();
}

/** Validates provenance and schema, not an assertion of perfect semantic entailment. */
export function validateMeaning(
  value: unknown,
  source: MeaningSources | string,
): IntentMeaning {
  const legacyCombinedSource = typeof source === "string";
  const sources = typeof source === "string" ? { question: source } : source;
  if (
    !record(value) ||
    !exact(value, [
      "version",
      "topicLabel",
      "questionKind",
      "focus",
      "subject",
      "action",
      "objects",
      "goal",
      "time",
    ]) ||
    value.version !== "meaning-v1"
  )
    invalid();
  function readField(
    raw: unknown,
    extra: string[] = [],
    defaultAllowed = false,
  ): MeaningField {
    if (
      !record(raw) ||
      !exact(raw, [...FIELD_KEYS, ...extra]) ||
      !["explicit", "paraphrase", "default_self", "unknown"].includes(
        String(raw.basis),
      ) ||
      !Array.isArray(raw.refs) ||
      raw.refs.length > 6
    )
      invalid();
    const basis = raw.basis as MeaningBasis;
    const refs: MeaningRef[] = raw.refs.map((r: unknown) => {
      if (
        !record(r) ||
        !exact(r, ["source", "quote"]) ||
        !SOURCE_NAMES.includes(r.source as MeaningSource)
      )
        invalid();
      const quote = text(r.quote, 600);
      // Older validateIntent callers supplied one concatenated user-source string.
      // V3 callers pass a source map, enforcing exact question/answer provenance.
      const supplied =
        r.source === "question"
          ? sources.question
          : (sources.answers?.[String(r.source).slice(7)] ??
            (legacyCombinedSource ? sources.question : undefined));
      if (typeof supplied !== "string" || !supplied.includes(quote)) invalid();
      return { source: r.source as MeaningSource, quote };
    });
    if (new Set(refs.map((r) => `${r.source}:${r.quote}`)).size !== refs.length)
      invalid();
    if (basis === "unknown") {
      if (raw.value !== null || refs.length) invalid();
      return unknown();
    }
    const result = text(raw.value);
    if (basis === "default_self") {
      if (!defaultAllowed || result !== "本人" || refs.length) invalid();
    } else {
      if (!refs.length) invalid();
      if (basis === "explicit" && !refs.some((r) => r.quote.includes(result)))
        invalid();
      // Semantic labels can rephrase, but cannot introduce a new number/date.
      const quoted = refs.map((r) => r.quote).join(" ");
      if (
        [...result.matchAll(/\d+(?:[.:/-]\d+)*/gu)].some(
          (m) => !quoted.includes(m[0]),
        )
      )
        invalid();
    }
    return { value: result, basis, refs };
  }
  const topicLabel = readField(value.topicLabel);
  const focus = readField(value.focus);
  const subject = readField(value.subject, ["role"], true);
  const subjectRaw = value.subject as Record<string, unknown>;
  if (!["self", "other", "group", "unknown"].includes(String(subjectRaw.role)))
    invalid();
  if ((subject.basis === "unknown") !== (subjectRaw.role === "unknown"))
    invalid();
  if (subject.basis === "default_self" && subjectRaw.role !== "self") invalid();
  const action = readField(value.action);
  if (!Array.isArray(value.objects) || value.objects.length > 6) invalid();
  const objects = value.objects.map((o) => readField(o));
  if (
    objects.some((o) => o.basis === "unknown") ||
    new Set(objects.map((o) => o.value)).size !== objects.length
  )
    invalid();
  const goal = readField(value.goal);
  const time = readField(value.time, ["dateBasis", "period"]);
  const timeRaw = value.time as Record<string, unknown>;
  if (
    !["explicit", "relative", "unspecified"].includes(
      String(timeRaw.dateBasis),
    ) ||
    ![null, "morning", "noon", "afternoon", "evening", "night"].includes(
      timeRaw.period as string | null,
    )
  )
    invalid();
  if (
    time.basis === "unknown" &&
    (timeRaw.dateBasis !== "unspecified" || timeRaw.period !== null)
  )
    invalid();
  // A period alone cannot silently become a dated appointment. This does not
  // calculate dates; relative expressions remain anchored by the reading layer.
  if (
    time.value &&
    /^(?:凌晨|早晨|早上|上午|中午|午后|下午|傍晚|晚上|夜里|夜间)$/u.test(
      time.value,
    ) &&
    timeRaw.dateBasis !== "unspecified"
  )
    invalid();
  if (
    timeRaw.dateBasis === "explicit" &&
    !/\d{1,4}[年月日号]|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/u.test(
      [time.value, ...time.refs.map((ref) => ref.quote)].join(" "),
    )
  )
    invalid();
  if (
    ![
      "evaluation",
      "comparison",
      "outcome",
      "timing",
      "advice",
      "unclear",
    ].includes(String(value.questionKind))
  )
    invalid();
  return {
    version: "meaning-v1",
    topicLabel,
    questionKind: value.questionKind as IntentMeaning["questionKind"],
    focus,
    subject: {
      ...subject,
      role: subjectRaw.role as IntentMeaning["subject"]["role"],
    },
    action,
    objects,
    goal,
    time: {
      ...time,
      dateBasis: timeRaw.dateBasis as IntentMeaning["time"]["dateBasis"],
      period: timeRaw.period as IntentMeaning["time"]["period"],
    },
  };
}

const DATE_SOURCE =
  /(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|20\d{2}年(?:\d{1,2}月(?:\d{1,2}[日号])?)?|\d{1,2}月\d{1,2}[日号]|今天|明天|后天|昨天|今早|今晚|今夜|明早|明晚|昨晚|昨夜|本周|这周|下周|下个月|下月|这个月|本月|月底|今年|明年|年底|周末|(?:本|这|下)?(?:周|星期)[一二三四五六日天]|未来[一二三四五六七八九十\d]+(?:天|周|个月|月|年)|[一二三四五六七八九十\d]+(?:天|周|个月|月|年)内)/u
    .source;
const PERIOD_SOURCE =
  /(?:凌晨|早晨|早上|上午|中午|午后|下午|傍晚|晚上|夜里|夜间)/u.source;
export const TIME_PATTERN = new RegExp(
  `${DATE_SOURCE}(?:[的\\s]*${PERIOD_SOURCE})?|${PERIOD_SOURCE}`,
  "u",
);
const QUESTION_CUE =
  /(?:[？?]|能否|是否|会不会|能不能|怎么样|怎样|怎么|什么|哪个|哪种|何时|什么时候|如何|好吗|好不好|合适吗|吗|可否|要不要|该不该|想问|想問|順利|顺利|有希望|有机会|结果)/u;
const ACTION_PATTERN =
  /(?:不|没|未)?(?:点外卖|做饭|用餐|吃饭|吃|喝|穿|佩戴|买|购买|换|更换|修理|修|用|使用|看|阅读|读|听|练习|练|学习|学|玩|送|坐|乘坐|住|租|订|预订|报名|申请|参加|找回|寻找|收回|收到|签约|签|搬家|面试|复试|复查|开庭|出发|去)/gu;
const QUERY_END =
  /(?:怎么样|怎么|怎样|如何|好不好|会不会|能不能|更合适|哪个|哪种|好还是|是否|能否|合适吗|适合吗|好吗|好么|可以吗|行不行|要注意什么|需要注意什么|有什么|能过吗|能成功吗|顺利吗|会怎样|吗|呢|[？?。！!]).*$/u;
const NOUN_PATTERN =
  /(?:合同|欠款|尾款|货款|订单|项目|工作|岗位|实习|面试|考试|钱包|钥匙|手机|手表|护照|证件|戒指|宠物|行李|感情|婚姻|恋爱|相亲|旅行|出差|出行|行程|航班|车票|笔试|复查|开庭|升职|入职|转正)/u;

/** Exclude explicitly disclaimed topics, while retaining negated actions. */
export function relevantText(text: string): string {
  return text.replace(
    /(?:不是|不问|不算|不看|别算|不要分析|不想问|不用看|不考虑|不想讨论)(?:(?!而是|只问|只想问|但是|但)[^，,。！？!?；;\n])*/gu,
    "",
  );
}

function trimObject(text: string): string {
  return text
    .replace(QUERY_END, "")
    .replace(
      /(?:更好|最好|比较好|好|比较合适|合适|顺利|有希望|成功|的事情|这件事)$/u,
      "",
    )
    .replace(/^[的了过着\s]+|[的了过着\s]+$/gu, "")
    .trim();
}
function actionParts(text: string): {
  action: string | null;
  objects: string[];
  prefix: string;
  comparison: boolean;
} {
  const matches = [...text.matchAll(ACTION_PATTERN)];
  // "还是" only constitutes a comparison if the left side contains an action/object.
  const alternatives = text.split(/还是|或者/u);
  const comparison =
    alternatives.length === 2 &&
    ACTION_PATTERN.test(alternatives[0]) &&
    trimObject(alternatives[0]).length > 0 &&
    trimObject(alternatives[1]).length > 0;
  ACTION_PATTERN.lastIndex = 0;
  if (!matches.length)
    return { action: null, objects: [], prefix: text, comparison: false };
  let selected = matches[0];
  // A destination can precede the principal act: 去某店吃饭, 去某公司面试.
  if (selected[0] === "去" && matches.length > 1) selected = matches[1];
  const action = selected[0];
  const prefix = text.slice(0, matches[0].index);
  const tail = text.slice(selected.index! + action.length);
  const objects = (comparison ? tail.split(/还是|或者/u) : [tail])
    .map((part) => {
      const cleaned = part.replace(
        /^(?:不|没|未)?(?:吃|喝|买|修|用|穿|看|读|坐|去)/u,
        "",
      );
      return trimObject(cleaned);
    })
    .filter(
      (part) =>
        part &&
        !/^(?:什么|啥|哪个|哪种|这个|那个|这样|那样|一下|一会儿|到了|回来|到|下|能|可以|会|该|有机会|有希望)/u.test(
          part,
        ) &&
        !/^(?:来|去|过|成功)$/u.test(part),
    );
  const venue =
    /去([^，。？！!?]{1,35}?)(?:吃饭|用餐|吃晚饭|吃午饭|面试|复试)/u.exec(text);
  if (venue && !objects.includes(venue[1])) objects.unshift(venue[1]);
  return {
    action,
    objects: [...new Set(objects)].slice(0, 6),
    prefix,
    comparison,
  };
}

export function questionFocus(text: string): {
  active: string;
  focus: string;
  scopes: string[];
} {
  const active = relevantText(text);
  const parts = active
    .split(/[？?；;\n]+|(?:另外|还想问|顺便问|同时也想问|也想问)/u)
    .map((p) => p.trim().replace(/^[，,。\s]+|[，,。\s]+$/gu, ""))
    .filter((p) => p.length >= 4);
  const independent = parts.filter((p) => QUESTION_CUE.test(p));
  let scopes = independent.length > 1 ? independent : [];
  if (!scopes.length) {
    const commas = active.split(/[，,]/u).map((p) => p.trim());
    const asked = commas.filter(
      (p) =>
        QUESTION_CUE.test(p) &&
        (actionParts(p).objects.length > 0 || NOUN_PATTERN.test(p)),
    );
    if (asked.length > 1) scopes = asked;
  }
  const clauses = active
    .split(/[，,。；;？?]/u)
    .map((p) => p.trim())
    .filter(Boolean);
  const last = clauses.at(-1) ?? active;
  const content = last
    .replace(QUERY_END, "")
    .replace(TIME_PATTERN, "")
    .replace(/^(?:请问|只问|我想问|想问)/u, "")
    .trim();
  const focus =
    independent.length < 2 &&
    clauses.length > 1 &&
    QUESTION_CUE.test(last) &&
    content.length >= 2 &&
    (hasClearAction(last) || NOUN_PATTERN.test(last))
      ? last
      : active;
  return { active, focus, scopes };
}

export function extractLocalDetails(
  focus: string,
  context = focus,
): { subject: string | null; object: string | null; timeframe: string | null } {
  const proxy = /我(?:帮|替|代|为)([^，,。？！!?]{1,12}?)(?:问|咨询|占)/u.exec(
    context,
  );
  const action = actionParts(focus);
  const group =
    /(?:我|他|她)(?:和|与|跟)(?:朋友|同事|他|她|男朋友|女朋友|妈妈|爸爸|姐姐|哥哥)/u.exec(
      focus,
    );
  // Keep legacy raw proxy extraction empty. The semantic role retains the actual person.
  // Names/titles inside the action's object are not the person doing the action.
  const person = [
    ...focus.matchAll(
      /我们|我|父亲|母亲|爸爸|妈妈|姐姐|哥哥|弟弟|妹妹|朋友|同事|他|她/gu,
    ),
  ].find(
    (m) =>
      !/[给向替帮为]$/u.test(focus.slice(0, m.index)) &&
      (!action.action ||
        m.index < action.prefix.length ||
        /(?:适合|适用于|对)$/u.test(focus.slice(0, m.index))),
  );
  const subject = proxy
    ? null
    : group && (!action.action || group.index < action.prefix.length)
      ? group[0]
      : (person?.[0] ?? null);
  const object =
    action.objects.find((item) => item.length <= 180) ??
    focus.match(NOUN_PATTERN)?.[0] ??
    null;
  const finalClause =
    focus
      .split(/[，,。；;？?]/u)
      .filter(Boolean)
      .at(-1) ?? focus;
  const localTime = QUESTION_CUE.test(finalClause)
    ? finalClause.match(TIME_PATTERN)?.[0]
    : null;
  return {
    subject,
    object,
    timeframe: localTime ?? focus.match(TIME_PATTERN)?.[0] ?? null,
  };
}

export function hasClearAction(text: string): boolean {
  const parts = actionParts(text);
  return (
    parts.objects.length > 0 ||
    /做饭|点外卖|用餐|吃饭|复查|开庭|面试|复试|搬家|出发/u.test(
      parts.action ?? "",
    )
  );
}

const CATEGORY_LABELS: Record<Category, string> = {
  career: "求职事业",
  business: "交易合作",
  relationship: "感情关系",
  travel: "出行安排",
  lost: "寻找失物",
  general: "一般生活事项",
};

/** Recover an omitted actor only from a single, plainly stated question clause.
 * This is an intake repair, not a replacement for open semantic understanding.
 */
export function recoverExplicitSubject(
  meaning: IntentMeaning,
  sources: MeaningSources,
): IntentMeaning["subject"] | null {
  if (!["unknown", "default_self"].includes(meaning.subject.basis)) return null;
  const actor =
    /^(?:我和|我与|我跟)(?:朋友|同事|他|她|男朋友|女朋友|妈妈|爸爸|姐姐|哥哥)|^(?:我们|他们|她们|父亲|母亲|爸爸|妈妈|姐姐|哥哥|弟弟|妹妹|朋友|同事|我|他|她)/u;
  const leadingTime = new RegExp(`^(?:${TIME_PATTERN.source})[的\\s]*`, "u");
  function recover(
    source: MeaningSource,
    original: string,
    useFocusRefs = true,
  ): IntentMeaning["subject"] | null {
    const active = relevantText(original);
    if (questionFocus(active).scopes.length > 1) return null;
    const clauses = active.split(/[，,。；;？?]/u).map((part) => part.trim());
    const asked = clauses.filter((part) => QUESTION_CUE.test(part));
    if (asked.length > 1) return null;
    let focus = asked[0] ?? questionFocus(active).focus;
    const proxy =
      /我(?:帮|替|代|为)([^，,。？！!?]{1,12}?)(?:问|咨询|占)(?!过|了)/u.exec(
        active,
      );
    if (proxy && focus.startsWith(proxy[0]))
      focus = focus.slice(proxy[0].length);
    focus = focus.replace(
      /^(?:请问|只问|想问|那么|请帮我看看|请帮我看)[，,\s]*/u,
      "",
    );
    let previous: string;
    do {
      previous = focus;
      focus = focus.replace(leadingTime, "");
    } while (focus !== previous);
    const match = actor.exec(focus);
    if (!match) {
      if (proxy)
        return {
          ...field(proxy[1], proxy[0], "explicit", source),
          role: "other" as const,
        };
      // A later clause can omit the actor already stated in the model's own
      // quoted focus (e.g. "我下周参加…，这次能通过吗"). Only use those
      // verified focus spans and require one unambiguous explicit actor.
      if (useFocusRefs) {
        const candidates = meaning.focus.refs
          .filter((ref) => ref.source === source)
          .flatMap((ref) => ref.quote.split(/[，,。；;？?]/u))
          .map((part) => recover(source, part.trim(), false))
          .filter(
            (subject): subject is IntentMeaning["subject"] => subject !== null,
          );
        if (
          candidates.length &&
          new Set(
            candidates.map((subject) => `${subject.role}:${subject.value}`),
          ).size === 1
        )
          return candidates[0];
      }
      return null;
    }
    const value = match[0];
    const rest = focus.slice(value.length);
    // A possessor, narrator or speaker is not necessarily the affected person.
    if (
      !rest ||
      /^(?:的|家|爸|妈|姐|哥|弟|妹|朋友|同事|客户|公司|觉得|认为|听说|说|(?:想|要)?(?:问|知道|了解))/u.test(
        rest,
      ) ||
      meaning.objects.some((object) =>
        object.refs.some(
          (ref) =>
            ref.source === source &&
            ref.quote.length > value.length &&
            ref.quote.startsWith(value) &&
            focus.startsWith(ref.quote),
        ),
      )
    )
      return null;
    const role = /们|和|与|跟/u.test(value)
      ? "group"
      : value === "我"
        ? "self"
        : "other";
    return {
      ...field(value, value, "explicit", source),
      role,
    } as IntentMeaning["subject"];
  }
  // Explicit corrections can supersede the original question. If a correction
  // names an actor but is too ambiguous locally, do not restore the old actor.
  for (const key of ["object", "scope"] as const) {
    const answer = sources.answers?.[key];
    if (!answer) continue;
    const recovered = recover(`answer:${key}`, answer);
    if (recovered) return recovered;
    if (
      /我|他|她|父亲|母亲|爸爸|妈妈|姐姐|哥哥|弟弟|妹妹|朋友|同事|主体|代问|本人/u.test(
        answer,
      )
    )
      return null;
  }
  return recover("question", sources.question);
}

export function localMeaning(
  question: string,
  category: Category,
  unresolvedScope = false,
): IntentMeaning {
  const { active, focus } = questionFocus(question);
  const blank: IntentMeaning = {
    version: "meaning-v1",
    topicLabel: unknown(),
    questionKind: "unclear",
    focus: unknown(),
    subject: { ...unknown(), role: "unknown" },
    action: unknown(),
    objects: [],
    goal: unknown(),
    time: { ...unknown(), dateBasis: "unspecified", period: null },
  };
  if (unresolvedScope) return blank;
  const extracted = extractLocalDetails(focus, active);
  const parts = actionParts(focus);
  const readableFocus = focus
    .trim()
    .replace(/^[，,。；;？！!?]+|[，,。；;？！!?]+$/gu, "");
  const focusQuote =
    readableFocus && question.includes(readableFocus)
      ? readableFocus.slice(0, 600)
      : null;
  const focusField = field(readableFocus.slice(0, 240) || null, focusQuote);
  const comparison =
    parts.comparison ||
    /(?:这份|那个|这个|那份).+(?:和|与).+(?:哪个|哪种)/u.test(focus);
  const questionKind: IntentMeaning["questionKind"] = comparison
    ? "comparison"
    : /何时|什么时候|几时|多久/u.test(focus)
      ? "timing"
      : /怎么|如何|要注意|要不要|该不该|该.+吗|怎么办/u.test(focus) &&
          !/怎么样/u.test(focus)
        ? "advice"
        : /能否|能不能|会不会|能.+吗|会.+吗|会怎样|结果|顺利|有希望|有机会/u.test(
              focus,
            )
          ? "outcome"
          : focusQuote
            ? "evaluation"
            : "unclear";
  let subject: IntentMeaning["subject"] = { ...unknown(), role: "unknown" };
  const proxy = /我(?:帮|替|代|为)([^，,。？！!?]{1,12}?)(?:问|咨询|占)/u.exec(
    active,
  );
  const personal = proxy?.[1] ?? extracted.subject;
  if (personal) {
    const role = /我们|他们|她们|(?:我|他|她)(?:和|与|跟)/u.test(personal)
      ? "group"
      : personal === "我"
        ? "self"
        : "other";
    subject = { ...field(personal, personal), role };
  } else {
    const beforeAction = parts.prefix
      .replace(TIME_PATTERN, "")
      .replace(
        /^(?:请问|请帮我看看|请帮我看|想问|只问|我想问|打算|想|计划|能否|是否|要不要|该不该|能|会|照常|在家|不|没|未|今天|明天)+/u,
        "",
      )
      .trim();
    const recipientOnly = /^给[^，。]{1,12}$/u.test(beforeAction);
    if (hasClearAction(focus) && (!beforeAction || recipientOnly))
      subject = {
        value: "本人",
        basis: "default_self",
        refs: [],
        role: "self",
      };
  }
  const action = field(parts.action, parts.action);
  const objectValues = parts.objects.length
    ? parts.objects
    : extracted.object
      ? [extracted.object]
      : [];
  const objects = objectValues
    .filter((o) => o.length <= 180 && question.includes(o))
    .map((o) => field(o, o));
  let label = CATEGORY_LABELS[category];
  if (/吃|喝|用餐|做饭|点外卖/u.test(parts.action ?? "")) label = "饮食选择";
  else if (category === "general") {
    if (/考试|笔试|成绩|学业/u.test(focus)) label = "考试学业";
    else if (/复查|检查|就医|医院|健康|症状/u.test(focus)) label = "健康就医";
    else if (/开庭|诉讼|法律/u.test(focus)) label = "诉讼法律";
    else if (objects.length && parts.action)
      label = `${parts.action}${objects[0].value}的选择`.slice(0, 100);
    else label = "事项待明确";
  }
  const topicLabel = field(label, focusQuote, "paraphrase");
  const goalText = !focusQuote
    ? null
    : questionKind === "comparison"
      ? "比较原问题中的备选方案，了解怎样选择更合适"
      : questionKind === "timing"
        ? "了解所问事情的时间或进度"
        : questionKind === "advice"
          ? "了解所问事情的处理方式与注意事项"
          : questionKind === "outcome"
            ? "了解所问事情的结果或发展情况"
            : "了解所问安排是否合适";
  const timeText = extracted.timeframe;
  const period: IntentMeaning["time"]["period"] = !timeText
    ? null
    : /早|上午|凌晨/u.test(timeText)
      ? "morning"
      : /中午/u.test(timeText)
        ? "noon"
        : /下午|午后/u.test(timeText)
          ? "afternoon"
          : /晚|傍晚/u.test(timeText)
            ? "evening"
            : /夜/u.test(timeText)
              ? "night"
              : null;
  const dateBasis: IntentMeaning["time"]["dateBasis"] = !timeText
    ? "unspecified"
    : /\d{1,4}[年月日号]|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/u.test(timeText)
      ? "explicit"
      : /^(?:今天|明天|后天|昨天|今早|今晚|今夜|明早|明晚|昨晚|昨夜|本周|这周|下周|下个月|下月|这个月|本月|月底|今年|明年|年底|周末|(?:本|这|下)?(?:周|星期)[一二三四五六日天]|未来)|内$/u.test(
            timeText,
          )
        ? "relative"
        : "unspecified";
  return {
    ...blank,
    topicLabel,
    questionKind,
    focus: focusField,
    subject,
    action,
    objects,
    goal: field(goalText, focusQuote, "paraphrase"),
    time: { ...field(timeText, timeText), dateBasis, period },
  };
}

/** Re-anchor a local reconstruction to the actual original/clarification text. */
export function reanchorMeaning(
  meaning: IntentMeaning,
  sources: MeaningSources,
  selectedAnswer?: "scope" | "object",
): IntentMeaning {
  const texts: [MeaningSource, string][] = [
    ["question", sources.question],
    ...Object.entries(sources.answers ?? {})
      .filter(([id]) => ["scope", "category", "object"].includes(id))
      .map(
        ([id, value]) =>
          [`answer:${id}` as MeaningSource, value] as [MeaningSource, string],
      ),
  ];
  const reanchor = (f: MeaningField): MeaningField => {
    if (f.basis === "unknown" || f.basis === "default_self") return f;
    const refs: MeaningRef[] = [];
    for (const ref of f.refs) {
      const found = texts.find(([, value]) => value.includes(ref.quote));
      if (found) refs.push({ source: found[0], quote: ref.quote });
    }
    if (refs.length === f.refs.length) return { ...f, refs };
    const answer = selectedAnswer && sources.answers?.[selectedAnswer];
    if (!answer) return unknown();
    // A numbered reply can select a model's paraphrase. It is a selection,
    // never a new literal quotation; retain the original question as context.
    const refsForSelection: MeaningRef[] = [
      ...(sources.question.length <= 600
        ? [{ source: "question" as const, quote: sources.question }]
        : []),
      { source: `answer:${selectedAnswer!}` as MeaningSource, quote: answer },
    ];
    const sourceText = refsForSelection.map((ref) => ref.quote).join(" ");
    if (
      [...(f.value ?? "").matchAll(/\d+(?:[.:/-]\d+)*/gu)].some(
        (m) => !sourceText.includes(m[0]),
      )
    )
      return unknown();
    return { value: f.value, basis: "paraphrase", refs: refsForSelection };
  };
  const subject = reanchor(meaning.subject);
  const time = reanchor(meaning.time);
  return {
    ...meaning,
    topicLabel: reanchor(meaning.topicLabel),
    focus: reanchor(meaning.focus),
    subject: {
      ...subject,
      role: subject.basis === "unknown" ? "unknown" : meaning.subject.role,
    },
    action: reanchor(meaning.action),
    objects: meaning.objects.map(reanchor).filter((f) => f.basis !== "unknown"),
    goal: reanchor(meaning.goal),
    time: {
      ...time,
      dateBasis:
        time.basis === "unknown" ? "unspecified" : meaning.time.dateBasis,
      period: time.basis === "unknown" ? null : meaning.time.period,
    },
  };
}
