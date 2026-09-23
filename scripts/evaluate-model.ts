/** Explicit, paid, synthetic evaluation. Never invoked by CI; no automatic retries. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { requestIntent, requestInterpretation } from "../src/ai/client";
import { assessRules } from "../src/ai/assessments";
import { localIntent } from "../src/ai/intent";
import { BRANCHES, STEMS, cast, castManual } from "../src/core";
import { selectEvidence } from "../src/data/evidence";
import { intentCases } from "../tests/fixtures/intent-cases";
import type { ChartResult } from "../src/core";
import type { IntentAssessment } from "../src/ai/types";

if (!process.argv.includes("--live"))
  throw new Error("Explicit --live is required; this consumes API credit.");
const folder = "output/review";
mkdirSync(folder, { recursive: true });
const file = `${folder}/live-evaluation.json`;
type Entry = {
  callNumber?: number;
  index: number;
  question: string;
  ok: boolean;
  elapsedMs: number;
  expectedCategory?: string;
  expectedStatus?: string;
  categoryCorrect?: boolean;
  statusCorrect?: boolean;
  intent?: IntentAssessment;
  chart?: ChartResult;
  assessments?: ReturnType<typeof assessRules>;
  result?: Awaited<ReturnType<typeof requestInterpretation>>;
  error?: string;
};
type Run = {
  startedAt: string;
  updatedAt: string;
  calls: number;
  priorCalls: number;
  intents: Entry[];
  interpretations: Entry[];
  supersededIntents?: Entry[];
  supersededInterpretations?: Entry[];
};
const run: Run = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8"))
  : {
      startedAt: new Date().toISOString(),
      updatedAt: "",
      calls: 0,
      priorCalls: Number(
        process.argv
          .find((arg) => arg.startsWith("--prior-calls="))
          ?.split("=")[1] ?? 0,
      ),
      intents: [],
      interpretations: [],
    };
const save = () => {
  run.updatedAt = new Date().toISOString();
  writeFileSync(file, JSON.stringify(run, null, 2));
};
async function readSecret(): Promise<string> {
  if (!process.stdin.isTTY)
    throw new Error("Use an interactive terminal for hidden credential input.");
  process.stdin.setRawMode(true);
  process.stdout.write("READY_FOR_SECRET_INPUT\n");
  return new Promise((resolve) => {
    let data = "";
    const receive = (chunk: Buffer) => {
      data += chunk.toString("utf8");
      if (data.includes("\u0003")) process.exit(1);
      if (/[\r\n]/.test(data)) {
        process.stdin.off("data", receive);
        process.stdin.pause();
        process.stdin.setRawMode(false);
        resolve(data.trim());
      }
    };
    process.stdin.on("data", receive);
    process.stdin.resume();
  });
}
let secret = await readSecret();
if (
  !Number.isInteger(run.priorCalls) ||
  run.priorCalls < 0 ||
  run.priorCalls > 100
)
  throw new Error("Invalid prior call count");
const recheck = process.argv.find((arg) =>
  arg.startsWith("--recheck-intents="),
);
if (recheck) {
  // Explicit operator-selected regression run; previous failures stay in the audit trail.
  const selected = new Set(recheck.split("=")[1].split(",").map(Number));
  if (
    [...selected].some(
      (index) => !Number.isInteger(index) || index < 0 || index >= 60,
    )
  )
    throw new Error("Invalid recheck indices");
  run.supersededIntents = [
    ...(run.supersededIntents ?? []),
    ...run.intents.filter((entry) => selected.has(entry.index)),
  ];
  run.intents = run.intents.filter((entry) => !selected.has(entry.index));
  save();
}
const recheckReadings = process.argv.find((arg) =>
  arg.startsWith("--recheck-interpretations="),
);
if (recheckReadings) {
  const selected = new Set(
    recheckReadings.split("=")[1].split(",").map(Number),
  );
  if (
    [...selected].some(
      (index) => !Number.isInteger(index) || index < 0 || index >= 24,
    )
  )
    throw new Error("Invalid interpretation recheck indices");
  run.supersededInterpretations = [
    ...(run.supersededInterpretations ?? []),
    ...run.interpretations.filter((entry) => selected.has(entry.index)),
  ];
  run.interpretations = run.interpretations.filter(
    (entry) => !selected.has(entry.index),
  );
  save();
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (String(args[0]).includes("chat/completions")) {
    const body = await response.clone().text();
    writeFileSync(
      `${folder}/evaluation-response-${run.calls}.json`,
      body.replaceAll(secret, "[removed]"),
    );
  }
  return response;
};
function reserve() {
  // Includes the six exploratory calls made before this evaluation; leaves two for production QA.
  if (run.calls + run.priorCalls >= 98)
    throw new Error("100-request session ceiling: production QA reserved.");
  run.calls++;
  save();
}
function safeError(e: unknown) {
  return typeof e === "object" && e && "code" in e
    ? String(e.code)
    : "unexpected_error";
}
const normal = cast({
  datetime: "2026-09-23T10:30",
  timeBasis: "solar",
  longitude: 116.4,
  latitude: 39.9,
});
const examples: Record<string, ChartResult> = {};
for (let day = 0; day < 60; day++)
  for (const monthGeneral of BRANCHES)
    for (const daytime of [true, false]) {
      const chart = castManual({
        dayStem: STEMS[day % 10],
        dayBranch: BRANCHES[day % 12],
        monthGeneral,
        hourBranch: "子",
        daytime,
      });
      for (const rule of assessRules(chart, "career"))
        if (
          rule.status === "met" &&
          rule.kind === "judgement" &&
          !examples[rule.id]
        )
          examples[rule.id] = chart;
    }
try {
  // Author-labelled corpus: 48 clear single-topic cases, then 12 negation/ambiguity cases.
  for (let index = 0; index < 60; index++) {
    if (run.intents.some((r) => r.index === index)) continue;
    const item = intentCases[index],
      start = Date.now();
    reserve();
    let entry: Entry;
    try {
      const intent = await requestIntent({
        apiKey: secret,
        question: item.question,
        categoryChoice: item.choice,
      });
      entry = {
        index,
        question: item.question,
        ok: true,
        elapsedMs: Date.now() - start,
        expectedCategory: item.category,
        expectedStatus: item.status,
        categoryCorrect: intent.category === item.category,
        statusCorrect: intent.status === item.status,
        intent,
      };
    } catch (e) {
      entry = {
        index,
        question: item.question,
        ok: false,
        elapsedMs: Date.now() - start,
        error: safeError(e),
      };
    }
    entry.callNumber = run.calls;
    run.intents.push(entry);
    save();
    console.log(
      JSON.stringify({
        phase: "intent",
        index,
        ok: entry.ok,
        categoryCorrect: entry.categoryCorrect,
        error: entry.error,
      }),
    );
  }
  // Four questions in each category; shared chart and real rule-positive/unknown charts.
  const indices = Array.from({ length: 6 }, (_, category) =>
    Array.from({ length: 4 }, (_, offset) => category * 8 + offset),
  ).flat();
  for (let index = 0; index < indices.length; index++) {
    if (run.interpretations.some((r) => r.index === index)) continue;
    const sourceIndex = indices[index],
      item = intentCases[sourceIndex];
    const intent =
      run.intents.find((r) => r.index === sourceIndex)?.intent ??
      localIntent(item.question, item.choice);
    const variants = [
      normal,
      examples["bifa-016"],
      examples["bifa-031"],
      examples["bifa-031-void"],
      examples["bifa-032"],
    ];
    const chart = variants[index % variants.length];
    if (!chart) throw new Error("Missing real chart fixture.");
    const assessments = assessRules(chart, intent.category),
      start = Date.now();
    reserve();
    let entry: Entry;
    try {
      const result = await requestInterpretation({
        apiKey: secret,
        question: item.question,
        chart,
        intent,
        answers: {},
        assessments,
        evidence: selectEvidence(chart, intent.category),
      });
      entry = {
        index,
        question: item.question,
        ok: true,
        elapsedMs: Date.now() - start,
        intent,
        chart,
        assessments,
        result,
      };
    } catch (e) {
      entry = {
        index,
        question: item.question,
        ok: false,
        elapsedMs: Date.now() - start,
        intent,
        chart,
        assessments,
        error: safeError(e),
      };
    }
    entry.callNumber = run.calls;
    run.interpretations.push(entry);
    save();
    console.log(
      JSON.stringify({
        phase: "interpretation",
        index,
        ok: entry.ok,
        error: entry.error,
      }),
    );
  }
  const clear = run.intents.filter((r) => r.index < 48);
  console.log(
    JSON.stringify({
      phase: "summary",
      callsIncludingPrior: run.calls + run.priorCalls,
      intentPassed: run.intents.filter((r) => r.ok).length,
      clearCorrect: clear.filter((r) => r.categoryCorrect).length,
      clearTotal: clear.length,
      interpretationPassed: run.interpretations.filter((r) => r.ok).length,
      interpretationTotal: run.interpretations.length,
    }),
  );
} finally {
  secret = "";
}
