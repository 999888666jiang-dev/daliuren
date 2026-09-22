import type {
  CastInput,
  Category,
  ChartResult,
  EvidenceRecord,
  Interpretation,
} from "../core/types";
export const categories: { id: Category; label: string; long: string }[] = [
  { id: "career", label: "事业", long: "求职事业" },
  { id: "business", label: "合作", long: "交易合作" },
  { id: "relationship", label: "感情", long: "感情关系" },
  { id: "travel", label: "出行", long: "出行安排" },
  { id: "lost", label: "失物", long: "寻找失物" },
  { id: "general", label: "其他", long: "其他事项" },
];
export interface Report {
  schemaVersion: 1;
  question: string;
  category: Category;
  place: string;
  createdAt: string;
  chart: ChartResult;
  comparison?: ChartResult;
  evidenceSnapshot?: EvidenceRecord[];
  corpusVersion?: string;
  interpretation?: Interpretation;
  aiMeta?: Record<string, string>;
}
const key = "guanxiang.reports.v1";
export function nowBeijing() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19);
}
export function timeText(value: string) {
  return value.replace("T", " ").slice(0, 19);
}
export function readReports(): Report[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(items)) return [];
    return items
      .filter(
        (r): r is Report =>
          r?.schemaVersion === 1 &&
          typeof r.question === "string" &&
          typeof r.createdAt === "string" &&
          typeof r.chart?.id === "string" &&
          Array.isArray(r.chart?.transmissions) &&
          Array.isArray(r.chart?.facts) &&
          Array.isArray(r.chart?.lessons) &&
          Array.isArray(r.chart?.trace) &&
          Array.isArray(r.chart?.heavenPlate) &&
          categories.some((c) => c.id === r.category),
      )
      .slice(0, 30);
  } catch {
    return [];
  }
}
export function saveReport(report: Report) {
  const items = readReports().filter((r) => r.createdAt !== report.createdAt);
  localStorage.setItem(key, JSON.stringify([report, ...items].slice(0, 30)));
}
export function removeReport(createdAt: string) {
  localStorage.setItem(
    key,
    JSON.stringify(readReports().filter((r) => r.createdAt !== createdAt)),
  );
}
export function exportReport(report: Report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `guanxiang-${report.chart.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function comparedInput(input: CastInput): CastInput {
  return {
    ...input,
    timeBasis: input.timeBasis === "solar" ? "standard" : "solar",
  };
}
