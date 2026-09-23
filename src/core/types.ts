export type Branch =
  | "子"
  | "丑"
  | "寅"
  | "卯"
  | "辰"
  | "巳"
  | "午"
  | "未"
  | "申"
  | "酉"
  | "戌"
  | "亥";
export type Stem =
  "甲" | "乙" | "丙" | "丁" | "戊" | "己" | "庚" | "辛" | "壬" | "癸";
export type Category =
  "career" | "business" | "relationship" | "travel" | "lost" | "general";
export type TimeBasis = "solar" | "standard";
export type CastMode = "standard" | "living";
export interface CastInput {
  datetime: string;
  timeBasis: TimeBasis;
  castMode?: CastMode;
  livingNumber?: number;
  latitude?: number;
  longitude?: number;
  natalBranch?: Branch;
  annualBranch?: Branch;
  ruleVersion?: string;
}
export interface ManualInput {
  dayStem: Stem;
  dayBranch: Branch;
  monthGeneral: Branch;
  hourBranch: Branch;
  daytime: boolean;
  natalBranch?: Branch;
  annualBranch?: Branch;
}
export interface TimeContext {
  utcIso: string;
  beijing: string;
  solar: string | null;
  selected: string;
  timeBasis: TimeBasis;
  longitudeCorrectionMinutes: number | null;
  equationOfTimeMinutes: number | null;
  offsetMinutes: number | null;
  nearBoundary: boolean;
}
export interface Lesson {
  lower: Stem | Branch;
  lowerBranch: Branch;
  upper: Branch;
  kind: "stem" | "branch";
}
export interface Transmission {
  branch: Branch;
  hiddenStem: Stem | null;
  relative: string;
  general: string;
  isVoid: boolean;
}
export interface TraceStep {
  id: string;
  title: string;
  detail: string;
  sourceIds: string[];
}
export interface ChartFact {
  id: string;
  label: string;
  value: string;
  sourceIds: string[];
}
export interface CastingContext {
  mode: CastMode;
  realHourBranch: Branch;
  virtualHourBranch?: Branch;
  number?: number;
  notice: string;
}
export interface ChartResult {
  id: string;
  engineVersion: string;
  ruleVersion: string;
  input?: CastInput;
  manualInput?: ManualInput;
  time?: TimeContext;
  casting?: CastingContext;
  day: { stem: Stem; branch: Branch };
  monthGeneral: Branch;
  monthBranch?: Branch;
  hourBranch: Branch;
  daytime: boolean;
  heavenPlate: Branch[];
  lessons: Lesson[];
  transmissions: Transmission[];
  generals: string[];
  voids: Branch[];
  method: { name: string; detail: string };
  trace: TraceStep[];
  facts: ChartFact[];
  profileWarnings: string[];
}
export interface EvidenceRecord {
  id: string;
  title: string;
  quote: string;
  work: string;
  edition: string;
  volume: string;
  page: string;
  sourceUrl: string;
  imageUrl: string;
  verification: "verified" | "pending";
  reviewNote: string;
  ruleIds: string[];
}
export interface Interpretation {
  summary: string;
  observations: { text: string; factIds: string[]; evidenceIds: string[] }[];
  advice: string[];
  missingInformation: string[];
  limitations: string[];
}
