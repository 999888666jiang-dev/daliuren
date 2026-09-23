import type { Category } from "../core/types";
import type { CategoryChoice, Clarification, IntentAssessment } from "./types";
import {
  extractLocalDetails,
  hasClearAction,
  localMeaning,
  questionFocus,
  reanchorMeaning,
  relevantText,
} from "./meaning";

export const INTENT_VERSION = "local-intent-v2.0.0";

const labels: Record<Category, string> = {
  career: "求职事业",
  business: "交易合作",
  relationship: "感情关系",
  travel: "出行安排",
  lost: "寻找失物",
  general: "其他事项",
};
const categories = Object.keys(labels) as Category[];
// A deliberately limited fallback: these words suggest a topic, never a forecast.
const topics: Record<Exclude<Category, "general">, RegExp> = {
  career:
    /事业|求职|找工作|面试|复试|录用|录取|转正|入职|跳槽|辞职|升职|晋升|转岗|岗位|职场|考编|考公|编制|实习|职业|工作|工资|同事|老板/u,
  business:
    /合同|签约|回款|欠款|尾款|收款|付款|订单|客户|交易|生意|经营|创业|开店|合伙|合作|供应商|采购|竞标|投资|股票|融资|项目|货款|债务|买房|卖房/u,
  relationship:
    /恋爱|感情|婚姻|结婚|离婚|复合|分手|相亲|伴侣|夫妻|男朋友|女朋友|男友|女友|前任|喜欢我|表白|暧昧|家人|亲子|婆媳/u,
  travel:
    /出行|出差|旅行|旅游|航班|机票|火车|车票|行程|出发|远行|搬家|签证|通勤/u,
  lost: /失物|丢失|丢了|遗失|遗落|落在|走丢|寻物|找回|不见了|找不到/u,
};
function positiveText(text: string): string {
  return relevantText(text);
}

function detected(text: string): Category[] {
  const positive = positiveText(text);
  return (Object.keys(topics) as Exclude<Category, "general">[]).filter((c) => {
    if (c === "lost" && /找不到工作|找不到对象|找不到客户/u.test(positive)) {
      return /失物|丢失|遗失|遗落|走丢|寻物|不见了/u.test(positive);
    }
    return topics[c].test(positive);
  });
}

function questions(text: string): string[] {
  return questionFocus(text).scopes;
}

function focusText(text: string): string {
  return questionFocus(text).focus;
}

function extract(text: string) {
  return extractLocalDetails(text);
}

function clarification(
  id: string,
  question: string,
  options: string[],
): Clarification {
  return { id, question, options: [...new Set(options)] };
}

export function localIntent(
  question: string,
  choice: CategoryChoice,
): IntentAssessment {
  const coreQuestion = question.trim();
  const active = positiveText(coreQuestion);
  const scopes = questions(coreQuestion);
  const focus = focusText(active);
  let candidates = detected(focus);
  // A job/client which cannot be found is not a missing physical object.
  if (/找不到对象/u.test(focus) && !candidates.length)
    candidates = ["relationship"];
  const ambiguousRelation =
    /合作关系|(?:我们|我和[^，。？?]{1,12}|双方|他们|她和他)的?关系/u.test(
      active,
    ) &&
    !/合同|签约|回款|生意|合伙|客户|项目|恋爱|感情|婚姻|结婚|同事|工作/u.test(
      active,
    );
  const inferred: Category =
    candidates.length === 1 ? candidates[0] : "general";
  const category = choice === "auto" ? inferred : choice;
  const clarifications: Clarification[] = [];
  if (scopes.length > 1) {
    clarifications.push(
      clarification(
        "scope",
        "这次先解读哪一件事？请选择一个问题，或重新写一个核心问题。",
        scopes.slice(0, 6),
      ),
    );
  }
  if (choice !== "auto" && inferred !== "general" && inferred !== choice) {
    clarifications.push(
      clarification(
        "category",
        "手选类别与问题文字指向不同，请确认本次类别。",
        [labels[choice], labels[inferred]],
      ),
    );
  } else if (ambiguousRelation || candidates.length > 1) {
    clarifications.push(
      clarification(
        "category",
        "这件事主要涉及哪一类关系或事项？",
        ambiguousRelation
          ? [
              labels.business,
              labels.relationship,
              labels.career,
              labels.general,
            ]
          : candidates.map((c) => labels[c]),
      ),
    );
  } else if (
    !candidates.length &&
    !hasClearAction(focus) &&
    !/考试|学业|学习|成绩|健康|疾病|医院|诉讼|官司|法律|天气/u.test(active)
  ) {
    clarifications.push(
      clarification(
        "object",
        "你具体想问什么事情、涉及哪个对象？请补充一个核心问题。",
        [],
      ),
    );
  }
  const info =
    scopes.length > 1
      ? { subject: null, object: null, timeframe: null }
      : extractLocalDetails(focus, active);
  const missingInformation: string[] = [];
  if (!info.timeframe && scopes.length < 2)
    missingInformation.push("未说明关注的时间范围；不会代填期限。");
  if (category === "general")
    missingInformation.push(
      "当前只提供已核一般盘面条文，不宣称已实现该事项的专门取用法。",
    );
  return {
    category,
    coreQuestion,
    ...info,
    goal: coreQuestion || null,
    background: [],
    missingInformation,
    clarifications: clarifications.slice(0, 2),
    categoryReason:
      choice !== "auto"
        ? `保留手选${labels[choice]}；${inferred !== "general" && inferred !== choice ? `文字提示${labels[inferred]}，等待确认。` : "本地关键词仅辅助，不覆盖你的选择。"}`
        : ambiguousRelation || candidates.length > 1
          ? "本地提示发现类别或关系存在歧义，需要确认。"
          : candidates.length === 1
            ? `问题中的明确词语提示${labels[inferred]}；这是本地辅助识别。`
            : hasClearAction(focus)
              ? "已识别具体生活安排；证据仍使用一般事项规则，不把生活主题强行归入其他类别。"
              : "没有足够明确的类别信息，暂记其他事项，不猜测背景。",
    status: clarifications.length ? "needs_clarification" : "ready",
    source: "local",
    meaning: localMeaning(coreQuestion, category, scopes.length > 1),
  };
}

function categoryFromAnswer(answer: string): Category | undefined {
  const direct = categories.find((c) => c === answer || labels[c] === answer);
  if (direct) return direct;
  if (/^(?:其他|综合)(?:事项|问题)?$/u.test(answer)) return "general";
  const found = detected(answer);
  return found.length === 1 ? found[0] : undefined;
}

/** Answers are data. Only a recognized category or a newly stated question resolves ambiguity. */
export function resolveIntent(
  intent: IntentAssessment,
  answers: Record<string, string>,
  originalQuestion?: string,
): IntentAssessment {
  const answer = (id: string) => {
    if (typeof answers[id] !== "string") return "";
    const value = answers[id].trim();
    return value.length <= 500 &&
      !/^(?:暂时)?(?:不确定|不知道|不清楚|没想好|没有想好|随便|不知道怎么说)[。！？?]*$/u.test(
        value,
      )
      ? value
      : "";
  };
  const mergedQuestions = (...sets: Clarification[][]): Clarification[] =>
    [...new Map(sets.flat().map((item) => [item.id, item])).values()].slice(
      0,
      2,
    );
  let resolved: IntentAssessment = {
    ...intent,
    clarifications: [...intent.clarifications],
    missingInformation: [...intent.missingInformation],
  };
  let confirmedModelFocus = false;
  const scope = answer("scope");
  if (scope && intent.clarifications.some((c) => c.id === "scope")) {
    const options = intent.clarifications.find(
      (c) => c.id === "scope",
    )!.options;
    const index = /^(?:第)?([1-6一二三四五六])(?:个|项|件|题)?$/u.exec(scope);
    const number = index
      ? Number(index[1]) || "一二三四五六".indexOf(index[1]) + 1
      : 0;
    const selected = number ? options[number - 1] : scope;
    if (selected) {
      const chosenOption = options.includes(selected);
      confirmedModelFocus = intent.source === "model" && chosenOption;
      resolved = localIntent(selected, "auto");
      // A model-proposed scope already names a concrete matter. Selecting it is
      // enough to resolve that scope; the limited fallback vocabulary cannot
      // demand the same object again merely because the activity is unfamiliar.
      if (confirmedModelFocus) {
        resolved.clarifications = resolved.clarifications.filter(
          (item) => item.id !== "object",
        );
      }
      resolved.categoryReason = `根据用户选定的核心问题重新识别：${resolved.categoryReason}`;
      // A numbered answer may select a model's paraphrase. Do not turn that
      // paraphrase into a fabricated extracted span in downstream validation.
      const source = [
        originalQuestion ??
          (intent.source === "local" ? intent.coreQuestion : ""),
        intent.subject,
        intent.object,
        intent.goal,
        intent.timeframe,
        ...intent.background,
        scope,
      ]
        .filter(Boolean)
        .join("\n")
        .replace(/\s+/gu, "");
      for (const key of ["subject", "object", "goal", "timeframe"] as const) {
        const value = resolved[key];
        if (value && !source.includes(value.replace(/\s+/gu, "")))
          resolved[key] = null;
      }
      resolved.clarifications = mergedQuestions(
        resolved.clarifications,
        intent.clarifications.filter(
          (item) =>
            item.id === "object" ||
            (intent.source === "model" && item.id === "category"),
        ),
      );
    }
  }
  const object = answer("object");
  if (object && intent.clarifications.some((c) => c.id === "object")) {
    const expanded = `${resolved.coreQuestion}\n补充所问事项：${object}`;
    const details = localIntent(
      `${resolved.coreQuestion.replace(/[？?]+$/u, "")}，${object}`,
      resolved.category === "general" ? "auto" : resolved.category,
    );
    const extracted = extract(positiveText(object));
    const pending = mergedQuestions(
      resolved.clarifications.filter((item) => item.id !== "object"),
      details.clarifications.filter(
        (item) =>
          item.id !== "object" ||
          (resolved.category === "general" &&
            !(intent.source === "model" && intent.meaning)),
      ),
    );
    resolved = {
      ...details,
      coreQuestion: expanded,
      goal: resolved.goal,
      object,
      subject: extracted.subject ?? resolved.subject,
      timeframe: extracted.timeframe ?? resolved.timeframe,
      background: resolved.background,
      clarifications: pending,
      categoryReason: `根据用户补充的所问事项重新识别：${details.categoryReason}`,
    };
  }
  const confirmed = categoryFromAnswer(answer("category"));
  if (confirmed) {
    resolved.category = confirmed;
    resolved.categoryReason = `用户澄清后确认${labels[confirmed]}。`;
    resolved.clarifications = resolved.clarifications.filter(
      (c) => c.id !== "category",
    );
  }
  resolved.status = resolved.clarifications.length
    ? "needs_clarification"
    : "ready";
  if (intent.meaning) {
    const sourceQuestion = originalQuestion ?? intent.coreQuestion;
    const changedFocus = Boolean(scope || object);
    const semantic = changedFocus
      ? localMeaning(
          resolved.coreQuestion,
          resolved.category,
          resolved.clarifications.some((c) => c.id === "scope"),
        )
      : intent.meaning;
    resolved.meaning = reanchorMeaning(
      semantic,
      { question: sourceQuestion, answers },
      scope ? "scope" : object ? "object" : undefined,
    );
    if (
      confirmedModelFocus &&
      resolved.meaning.topicLabel.value === "事项待明确" &&
      resolved.meaning.focus.value
    ) {
      // Keep the selected open topic visible without pretending to have parsed
      // an unknown action/object or replacing its wording with a fixed category.
      resolved.meaning.topicLabel = {
        ...resolved.meaning.focus,
        value: resolved.meaning.focus.value.slice(0, 100),
      };
    }
  } else {
    // Legacy model intents stay on the old extraction-only protocol.
    delete resolved.meaning;
  }
  return resolved;
}
