import type {
  Category,
  ChartFact,
  ChartResult,
  EvidenceRecord,
} from "../core/types";
import type { AiMeta, IntentAssessment } from "./types";

export interface ReadingSource extends EvidenceRecord {
  clauses: { id: string; text: string }[];
}

export interface ReadingAssessment {
  id: string;
  title: string;
  kind: "procedure" | "principle" | "judgement";
  status: "met" | "unknown";
  statement: string;
  factIds: string[];
  clauseIds: string[];
  caveats: string[];
}

export interface ReadingContext {
  facts: ChartFact[];
  sources: ReadingSource[];
  assessments: ReadingAssessment[];
  version: string;
}

export type ReadingTendency =
  "favorable" | "unfavorable" | "mixed" | "undetermined";
export type ReadingStage =
  "selection" | "lessons" | "transmissions" | "generals" | "conditions";
export type ReadingContribution =
  "supports" | "opposes" | "limits" | "describes";

export interface ReadingReferences {
  factIds: string[];
  assessmentIds: string[];
  clauseIds: string[];
}

export interface InterpretationV3 {
  summary: string;
  tendency: ReadingTendency;
  focus: Array<
    ReadingReferences & {
      id: string;
      title: string;
      explanation: string;
    }
  >;
  reasoning: Array<
    ReadingReferences & {
      id: string;
      stage: ReadingStage;
      title: string;
      literalMeaning: string;
      application: string;
      contribution: ReadingContribution;
    }
  >;
  synthesis: { text: string; reasoningIds: string[] };
  advice: Array<{ action: string; purpose: string; reasoningIds: string[] }>;
  limitations: string[];
}

export interface ReadingMeta extends AiMeta {
  readingVersion: string;
  assessmentVersion: string;
  questionAskedAt: string;
}

export interface ReadingRequest {
  apiKey: string;
  question: string;
  questionAskedAt: string;
  chart: ChartResult;
  intent: IntentAssessment;
  answers: Record<string, string>;
  context: ReadingContext;
  consultationMode?: "standard" | "living" | "reuse" | "manual";
  signal?: AbortSignal;
}

/** Compatible context builders must preserve all original chart facts and never recast. */
export type ReadingContextBuilder = (
  chart: ChartResult,
  category: Category,
) => ReadingContext;
