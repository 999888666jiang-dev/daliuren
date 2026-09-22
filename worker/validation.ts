import type {
  Branch,
  CastInput,
  Category,
  ChartResult,
  EvidenceRecord,
  Interpretation,
} from "../src/core/types";
import { ApiError, type InterpretRequest } from "./types";

const branches = new Set("子丑寅卯辰巳午未申酉戌亥".split(""));
const categories = new Set([
  "career",
  "business",
  "relationship",
  "travel",
  "lost",
  "general",
]);
const own = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function keysOnly(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}
function validText(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.length <= max &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
  );
}
function invalid(): never {
  throw new ApiError(
    400,
    "INVALID_REQUEST",
    "请检查问题、起课时间和所需信息。",
  );
}

export function validateRequest(value: unknown): InterpretRequest {
  if (
    !isRecord(value) ||
    !keysOnly(value, [
      "input",
      "question",
      "category",
      "ruleVersion",
      "corpusVersion",
    ])
  )
    invalid();
  if (
    !validText(value.question, 4, 1200) ||
    typeof value.category !== "string" ||
    !categories.has(value.category)
  )
    invalid();
  if (
    !validText(value.ruleVersion, 1, 80) ||
    !validText(value.corpusVersion, 1, 80)
  )
    invalid();
  const input = value.input;
  if (
    !isRecord(input) ||
    !keysOnly(input, [
      "datetime",
      "timeBasis",
      "latitude",
      "longitude",
      "natalBranch",
      "annualBranch",
      "ruleVersion",
    ])
  )
    invalid();
  if (
    typeof input.datetime !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/u.test(input.datetime)
  )
    invalid();
  const parts = input.datetime.match(/\d+/gu)!.map(Number);
  const [year, month, day, hour, minute, second = 0] = parts;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    year < 2000 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    invalid();
  if (input.timeBasis !== "solar" && input.timeBasis !== "standard") invalid();
  for (const [key, maximum] of [
    ["latitude", 90],
    ["longitude", 180],
  ] as const) {
    if (
      own(input, key) &&
      (typeof input[key] !== "number" ||
        !Number.isFinite(input[key]) ||
        Math.abs(input[key]) > maximum)
    )
      invalid();
  }
  if (input.timeBasis === "solar" && typeof input.longitude !== "number")
    invalid();
  for (const key of ["natalBranch", "annualBranch"] as const) {
    if (
      own(input, key) &&
      (typeof input[key] !== "string" || !branches.has(input[key]))
    )
      invalid();
  }
  if (
    own(input, "ruleVersion") &&
    (!validText(input.ruleVersion, 1, 80) ||
      input.ruleVersion !== value.ruleVersion)
  )
    invalid();
  const normalized: CastInput = {
    datetime: input.datetime,
    timeBasis: input.timeBasis,
  };
  if (typeof input.latitude === "number") normalized.latitude = input.latitude;
  if (typeof input.longitude === "number")
    normalized.longitude = input.longitude;
  if (typeof input.natalBranch === "string")
    normalized.natalBranch = input.natalBranch as Branch;
  if (typeof input.annualBranch === "string")
    normalized.annualBranch = input.annualBranch as Branch;
  normalized.ruleVersion = value.ruleVersion;
  return {
    input: normalized,
    question: value.question.trim(),
    category: value.category as Category,
    ruleVersion: value.ruleVersion,
    corpusVersion: value.corpusVersion,
  };
}

// JSON mode does not validate a schema. Validate every field and reference after parsing.
export function validateInterpretation(
  value: unknown,
  chart: ChartResult,
  evidence: EvidenceRecord[],
): Interpretation {
  function fail(): never {
    throw new ApiError(
      502,
      "INVALID_AI_RESPONSE",
      "解读未通过证据校验，请以已显示的课盘与古籍原文为准。",
    );
  }
  const prose = (text: unknown, maximum: number): text is string =>
    validText(text, 1, maximum) &&
    !/[<>「」『』“”《》]/u.test(text) &&
    !/(?:原文|古籍|经典)\s*(?:曰|云|说|记载|指出|：|:)/u.test(text);
  const strings = (
    items: unknown,
    min: number,
    max: number,
    length: number,
  ): items is string[] =>
    Array.isArray(items) &&
    items.length >= min &&
    items.length <= max &&
    items.every((item) => prose(item, length));
  const ids = (
    items: unknown,
    allowed: Set<string>,
    min: number,
  ): items is string[] =>
    Array.isArray(items) &&
    items.length >= min &&
    items.length <= 12 &&
    items.every((id) => typeof id === "string" && allowed.has(id)) &&
    new Set(items).size === items.length;
  if (
    !isRecord(value) ||
    !keysOnly(value, [
      "summary",
      "observations",
      "advice",
      "missingInformation",
      "limitations",
    ])
  )
    fail();
  if (
    !prose(value.summary, 800) ||
    !strings(value.advice, 1, 6, 400) ||
    !strings(value.missingInformation, 0, 6, 300) ||
    !strings(value.limitations, 1, 6, 300)
  )
    fail();
  if (
    !Array.isArray(value.observations) ||
    value.observations.length < 1 ||
    value.observations.length > 8
  )
    fail();
  const factIds = new Set(chart.facts.map((fact) => fact.id));
  const evidenceIds = new Set(
    evidence
      .filter((item) => item.verification === "verified")
      .map((item) => item.id),
  );
  const observations: Interpretation["observations"] = [];
  for (const observation of value.observations) {
    if (
      !isRecord(observation) ||
      !keysOnly(observation, ["text", "factIds", "evidenceIds"]) ||
      !prose(observation.text, 650) ||
      !ids(observation.factIds, factIds, 1) ||
      !ids(observation.evidenceIds, evidenceIds, 0)
    )
      fail();
    observations.push({
      text: observation.text,
      factIds: observation.factIds,
      evidenceIds: observation.evidenceIds,
    });
  }
  return {
    summary: value.summary,
    observations,
    advice: value.advice,
    missingInformation: value.missingInformation,
    limitations: value.limitations,
  };
}

export async function readBoundedJson(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<unknown> {
  if (!body) throw new Error("missing body");
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error("body limit");
      }
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}
