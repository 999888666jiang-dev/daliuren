import type {
  CastInput,
  Category,
  ChartResult,
  EvidenceRecord,
  Interpretation,
} from "../core/types";
import type {
  AiMeta,
  CategoryChoice,
  IntentAssessment,
  InterpretationV2,
  RuleAssessment,
} from "../ai/types";
import { normalizeReport } from "./report-validation";
import type { ReadingRevision } from "./reading-report";
export { normalizeReport } from "./report-validation";
export const categories: { id: Category; label: string; long: string }[] = [
  { id: "career", label: "事业", long: "求职事业" },
  { id: "business", label: "合作", long: "交易合作" },
  { id: "relationship", label: "感情", long: "感情关系" },
  { id: "travel", label: "出行", long: "出行安排" },
  { id: "lost", label: "失物", long: "寻找失物" },
  { id: "general", label: "其他", long: "其他事项" },
];
export interface Report {
  schemaVersion: 2 | 3;
  id: string;
  categoryChoice: CategoryChoice;
  question: string;
  category: Category;
  place: string;
  createdAt: string;
  chart: ChartResult;
  comparison?: ChartResult;
  evidenceSnapshot?: EvidenceRecord[];
  corpusVersion?: string;
  intent?: IntentAssessment;
  clarificationAnswers?: Record<string, string>;
  assessments?: RuleAssessment[];
  interpretation?: InterpretationV2;
  legacyInterpretation?: Interpretation;
  aiMeta?: Record<string, string> | AiMeta;
  warnings?: string[];
  readingRevisions?: ReadingRevision[];
  activeReadingId?: string | null;
  consultation?: {
    mode: "standard" | "living" | "reuse" | "manual";
    matterId: string;
    parentReportId?: string;
    sourceChartReportId?: string;
    changeNote?: string;
  };
}
const legacyKey = "guanxiang.reports.v1";
const key = "guanxiang.reports.v2";
const readingKey = "guanxiang.reports.v3";
export function nowBeijing() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19);
}
export function timeText(value: string) {
  return value.replace("T", " ").slice(0, 19);
}
export function readReports(): Report[] {
  const combined = new Map<string, Report>();
  for (const storageKey of [legacyKey, key, readingKey]) {
    try {
      for (const item of readStored(storageKey)) {
        const normalized = normalizeReport(item);
        if (normalized) combined.set(normalized.id, normalized);
      }
    } catch {
      /* A broken key must not hide valid reports in the other version. */
    }
  }
  return [...combined.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
}
function readStored(storageKey: string): unknown[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];
  const items: unknown = JSON.parse(raw);
  if (!Array.isArray(items))
    throw new Error("历史记录格式无效；请先导出当前报告。");
  return items;
}
export function serializeReport(report: Report): string {
  const normalized = normalizeReport(report);
  if (!normalized) throw new Error("报告未通过格式校验，无法保存或导出。");
  return JSON.stringify(normalized, null, 2);
}
export function saveReport(report: Report) {
  const normalized = normalizeReport(report);
  if (!normalized) throw new Error("报告未通过格式校验，无法保存。");
  // Read strictly before writing. If storage fails, keep the unsaved report in the caller.
  const targetKey = normalized.schemaVersion === 3 ? readingKey : key;
  const items = readStored(targetKey)
    .map(normalizeReport)
    .filter(
      (item): item is Report => item !== null && item.id !== normalized.id,
    );
  localStorage.setItem(
    targetKey,
    JSON.stringify(
      [normalized, ...items]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30),
    ),
  );
}
export function removeReport(id: string) {
  const before = [readingKey, key, legacyKey].map((storageKey) => ({
    storageKey,
    raw: localStorage.getItem(storageKey),
    items: readStored(storageKey),
  }));
  const written: typeof before = [];
  try {
    for (const item of before) {
      if (item.raw === null) continue;
      localStorage.setItem(
        item.storageKey,
        JSON.stringify(
          item.items.filter(
            (r) =>
              !(r && typeof r === "object" && normalizeReport(r)?.id === id),
          ),
        ),
      );
      written.push(item);
    }
  } catch {
    for (const item of written) {
      try {
        localStorage.setItem(item.storageKey, item.raw!);
      } catch {
        /* Report the failure; do not hide it. */
      }
    }
    throw new Error("无法修改本机存储，当前报告仍可导出。");
  }
}
export function exportReport(report: Report) {
  const blob = new Blob([serializeReport(report)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `guanxiang-${normalizeReport(report)!.chart.id.replace(/[^a-zA-Z0-9_-]/gu, "_")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function comparedInput(input: CastInput): CastInput {
  return {
    ...input,
    timeBasis: input.timeBasis === "solar" ? "standard" : "solar",
  };
}
