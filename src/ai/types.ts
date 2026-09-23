import type { Category, ChartResult, EvidenceRecord } from "../core/types";
import type { IntentMeaning } from "./meaning";

export type CategoryChoice = Category | "auto";
export interface Clarification {
  id: string;
  question: string;
  options: string[];
}
export interface IntentAssessment {
  category: Category;
  coreQuestion: string;
  subject: string | null;
  object: string | null;
  goal: string | null;
  timeframe: string | null;
  background: string[];
  missingInformation: string[];
  clarifications: Clarification[];
  categoryReason: string;
  status: "ready" | "needs_clarification";
  source: "model" | "local";
  meaning?: IntentMeaning;
}
export type AssessmentStatus = "met" | "not_met" | "unknown" | "not_applicable";
export interface RuleAssessment {
  id: string;
  title: string;
  kind: "procedure" | "judgement";
  status: AssessmentStatus;
  statement: string;
  factIds: string[];
  evidenceIds: string[];
  caveats: string[];
  missingInputs: string[];
}
export interface InterpretationV2 {
  summary: string;
  observations: {
    kind: "traditional" | "context";
    text: string;
    factIds: string[];
    evidenceIds: string[];
    assessmentIds: string[];
  }[];
  advice: string[];
  missingInformation: string[];
  limitations: string[];
}
export interface AiMeta {
  model: string;
  promptVersion: string;
  intentVersion: string;
  engineVersion: string;
  ruleVersion: string;
  corpusVersion: string;
  generatedAt: string;
}
export interface IntentRequest {
  apiKey: string;
  question: string;
  categoryChoice: CategoryChoice;
  signal?: AbortSignal;
}
export interface InterpretationRequest {
  apiKey: string;
  question: string;
  chart: ChartResult;
  intent: IntentAssessment;
  answers: Record<string, string>;
  assessments: RuleAssessment[];
  evidence: EvidenceRecord[];
  consultationMode?: "standard" | "living" | "reuse" | "manual";
  signal?: AbortSignal;
}
