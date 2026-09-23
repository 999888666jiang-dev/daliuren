import type { Category } from "../core/types";
import type { CategoryChoice, Clarification, IntentAssessment } from "./types";

export const INTENT_VERSION = "local-intent-v1.0.0";

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
    /事业|求职|找工作|面试|录用|入职|跳槽|辞职|升职|晋升|转岗|岗位|职场|考编|考公|编制|实习|职业|工作|工资|同事|老板/u,
  business:
    /合同|签约|回款|欠款|收款|付款|订单|客户|交易|生意|经营|创业|开店|合伙|合作|供应商|采购|竞标|投资|融资|项目|货款|债务|买房|卖房/u,
  relationship:
    /恋爱|感情|婚姻|结婚|离婚|复合|分手|相亲|伴侣|夫妻|男朋友|女朋友|男友|女友|前任|喜欢我|表白|暧昧|家人|亲子|婆媳/u,
  travel:
    /出行|出差|旅行|旅游|航班|机票|火车|车票|行程|出发|远行|搬家|签证|通勤/u,
  lost: /失物|丢失|丢了|遗失|遗落|走丢|寻物|找回|不见了|找不到/u,
};
const inquiry =
  /[？?]|能否|是否|会不会|能不能|怎样|怎么样|怎么|何时|什么时候|如何|吗|可否|要不要|该不该|想问|顺不顺|顺利|机会|结果/u;

function positiveText(text: string): string {
  return text.replace(
    /(?:不是|不问|不算|不看|别算|不要分析|不想问|不用看|不考虑|不想讨论)(?:(?!而是|只问|只想问|但是|但)[^，,。！？!?；;\n])*/gu,
    "",
  );
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
  const clauses = text
    .split(/[？?；;\n]+|(?:另外|还想问|顺便问|同时也想问|也想问)/u)
    .map((part) => part.trim().replace(/^[，,。\s]+|[，,。\s]+$/gu, ""))
    .filter(
      (part) => part.length >= 4 && positiveText(part).trim().length >= 3,
    );
  if (clauses.length > 1) return clauses;
  const commas = text.split(/[，,]/u).map((part) => part.trim());
  const asks = commas.filter(
    (part) => inquiry.test(part) && detected(part).length > 0,
  );
  return asks.length > 1 ? asks : [];
}

function focusText(text: string): string {
  const clauses = text.split(/[，,。]/u).map((part) => part.trim());
  const last = clauses.at(-1) ?? text;
  return clauses.length > 1 && inquiry.test(last) && detected(last).length
    ? last
    : text;
}

function extract(text: string) {
  const timeframe =
    text.match(
      /(?:20\d{2}年(?:\d{1,2}月(?:\d{1,2}[日号])?)?|\d{1,2}月\d{1,2}[日号]|今天|明天|后天|今晚|本周|这周|下周|下个月|这个月|本月|月底|今年|明年|年底|未来[一二三四五六七八九十\d]+(?:天|周|个月|月|年)|[一二三四五六七八九十\d]+(?:天|周|个月|月|年)内)/u,
    )?.[0] ?? null;
  const subject = /^我(?:帮|替|代|为)/u.test(text)
    ? null
    : (text.match(
        /^(?:请问)?(我们|我|父亲|母亲|爸爸|妈妈|朋友|同事|他|她)/u,
      )?.[1] ?? null);
  const object =
    text.match(
      /合同|欠款|货款|订单|项目|工作|岗位|钱包|钥匙|手机|证件|戒指|宠物|行李|感情|婚姻|恋爱|旅行|行程|航班/u,
    )?.[0] ?? null;
  return { subject, object, timeframe };
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
  const info = extract(active);
  const missingInformation: string[] = [];
  if (!info.timeframe)
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
            : "没有足够明确的类别信息，暂记其他事项，不猜测背景。",
    status: clarifications.length ? "needs_clarification" : "ready",
    source: "local",
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
      resolved = localIntent(selected, "auto");
      resolved.categoryReason = `根据用户选定的核心问题重新识别：${resolved.categoryReason}`;
      // A numbered answer may select a model's paraphrase. Do not turn that
      // paraphrase into a fabricated extracted span in downstream validation.
      const source = [
        intent.source === "local" ? intent.coreQuestion : "",
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
        intent.clarifications.filter((item) => item.id === "object"),
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
        (item) => item.id !== "object" || resolved.category === "general",
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
  return resolved;
}
