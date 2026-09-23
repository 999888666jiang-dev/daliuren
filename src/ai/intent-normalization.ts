import type { CategoryChoice, IntentAssessment } from "./types";
import {
  AiClientError,
  isRecord,
  validText,
  validateIntent,
} from "./validation";

const fields = ["subject", "object", "goal", "timeframe"] as const;
const labels = {
  subject: "主体",
  object: "对象",
  goal: "目标",
  timeframe: "时间范围",
};
const keys = [
  "category",
  "coreQuestion",
  ...fields,
  "background",
  "missingInformation",
  "clarifications",
  "categoryReason",
  "status",
  "source",
];

function invalid(): never {
  throw new AiClientError(
    "INVALID_INTENT",
    "问题整理未通过结构校验，请手动确认所问事项。",
  );
}
const plain = (value: unknown, maximum: number): value is string =>
  validText(value, 1, maximum) &&
  !/[<>]/u.test(value) &&
  !/(?:https?:\/\/|www\.|javascript:|data:|```|\[[^\]]+\]\()/iu.test(value);

/**
 * Removes unsupported extracted spans; never repairs schema or invents their replacement.
 * The strict validator remains the final authority for both shape and actual source spans.
 */
export function normalizeIntentExtraction(
  value: unknown,
  question: string,
  categoryChoice: CategoryChoice,
): IntentAssessment {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  )
    invalid();
  const local = value.source === "local";
  for (const key of fields) {
    const field = value[key];
    if (
      field !== null &&
      !(local ? validText(field, 1, 1200) : plain(field, 180))
    )
      invalid();
  }
  if (
    !Array.isArray(value.background) ||
    value.background.length > 4 ||
    value.background.some((item) => !plain(item, 180)) ||
    new Set(value.background).size !== value.background.length
  )
    invalid();

  // Validate every other original field BEFORE altering any extraction. Required keys,
  // source, category choice, status, options, lengths and unknown keys stay strict.
  const result = validateIntent(
    {
      ...value,
      subject: null,
      object: null,
      goal: null,
      timeframe: null,
      background: [],
    },
    question,
    categoryChoice,
  );
  const removed: string[] = [];
  for (const key of fields) {
    const field = value[key] as string | null;
    if (field === null || question.includes(field)) result[key] = field;
    else {
      result[key] = null;
      removed.push(labels[key]);
    }
  }
  result.background = (value.background as string[]).filter((item) =>
    question.includes(item),
  );
  if (result.background.length !== value.background.length)
    removed.push("背景");
  if (removed.length) {
    const notice = `${removed.join("、")}未能逐字对应问题原话，已保留为未知，未自行补充。`;
    const existing = [...result.missingInformation];
    if (!existing.includes(notice)) {
      if (existing.length < 4) existing.push(notice);
      else {
        const index = existing.findIndex(
          (item) => item.length + notice.length + 1 <= 120,
        );
        // Do not discard an existing limitation merely to squeeze in our audit note.
        if (index < 0) invalid();
        existing[index] = `${existing[index]} ${notice}`;
      }
    }
    result.missingInformation = existing;
  }
  return validateIntent(result, question, categoryChoice);
}
