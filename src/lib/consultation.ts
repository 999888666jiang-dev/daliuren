import type { Report } from "./report";
import type { ChartResult } from "../core";

/** The selected clock is already solar/standard; shift before flooring so 23–01 is one period. */
export function realPeriod(chart: ChartResult): number | null {
  if (!chart.time) return null;
  return Math.floor(
    (Date.parse(chart.time.selected.replace(" ", "T") + "Z") + 3600000) /
      7200000,
  );
}

export interface MatterInput {
  previousReportId?: string;
  changeNote?: string;
  acknowledged: boolean;
}

export const normalizeQuestion = (question: string) =>
  question
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\s]/gu, "");

/** A local record check, not an assertion that paraphrases can be recognized. */
export function resolveMatter(
  question: string,
  input: MatterInput,
  reports: Report[],
) {
  if (!input.acknowledged)
    throw new Error(
      "请确认这是不同的新事，或原事情已发生实际变化。不要为同一件未变化的事反复起课。",
    );
  const prior = input.previousReportId
    ? reports.find((r) => r.id === input.previousReportId)
    : undefined;
  if (input.previousReportId && !prior)
    throw new Error("未找到关联的原问题，请从本机记录重新选择。");
  const duplicate = reports.find(
    (r) => normalizeQuestion(r.question) === normalizeQuestion(question),
  );
  if (
    duplicate &&
    (!prior ||
      (prior.consultation?.matterId ?? prior.id) !==
        (duplicate.consultation?.matterId ?? duplicate.id))
  )
    throw new Error(
      "本机已有这件问题。请查看原报告；若现实已有新变化，选择原事情并填写变化后再起课。",
    );
  const changeNote = input.changeNote?.trim();
  if (
    prior &&
    (!changeNote || changeNote.length < 6 || changeNote.length > 500)
  )
    throw new Error(
      "请用 6—500 字写明已经发生的现实变化；仅换问法或不满意结果不算新变化。",
    );
  if (
    prior &&
    reports.some(
      (r) =>
        (r.consultation?.matterId ?? r.id) ===
          (prior.consultation?.matterId ?? prior.id) &&
        r.consultation?.changeNote &&
        normalizeQuestion(r.consultation.changeNote) ===
          normalizeQuestion(changeNote!),
    )
  )
    throw new Error(
      "这项现实变化已经有报告，请查看原报告；同一项变化不能反复起课。",
    );
  return {
    matterId: prior?.consultation?.matterId ?? prior?.id ?? crypto.randomUUID(),
    ...(prior ? { parentReportId: prior.id, changeNote } : {}),
  };
}
