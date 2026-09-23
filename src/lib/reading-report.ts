import type { IntentAssessment } from "../ai/types";
import type {
  InterpretationV3,
  ReadingContext,
  ReadingMeta,
} from "../ai/reading-types";
import type { Report } from "./report";

/** Each revision is a complete reading of the immutable original chart. */
export interface ReadingRevision {
  id: string;
  createdAt: string;
  questionAskedAt: string;
  intent: IntentAssessment;
  answers: Record<string, string>;
  context: ReadingContext;
  interpretation: InterpretationV3;
  meta: ReadingMeta;
}

export function activeReading(report: Report): ReadingRevision | undefined {
  return report.readingRevisions?.find((r) => r.id === report.activeReadingId);
}

export function canInterpretChart(report: Report): boolean {
  return (
    report.chart.engineVersion === "0.2.0" &&
    report.chart.ruleVersion === "daquan-v1.0.0"
  );
}

export function appendReading(
  report: Report,
  reading: ReadingRevision,
): Partial<Report> {
  if ((report.readingRevisions?.length ?? 0) >= 100) {
    throw new Error("此课已有100版解读，已保留全部原记录；请先导出备份。");
  }
  return {
    schemaVersion: 3,
    readingRevisions: [...(report.readingRevisions ?? []), reading],
    activeReadingId: reading.id,
  };
}
