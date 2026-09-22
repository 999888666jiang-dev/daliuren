import type { CastInput, Category, Interpretation } from "../src/core/types";

export interface Env {
  DB?: D1Database;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  ALLOWED_ORIGIN?: string;
  ALLOW_LOCAL_DEV?: string;
  AI_ENABLED?: string;
}

export interface InterpretRequest {
  input: CastInput;
  question: string;
  category: Category;
  ruleVersion: string;
  corpusVersion: string;
}

export interface Versions {
  engineVersion: string;
  ruleVersion: string;
  corpusVersion: string;
  promptVersion: string;
  model: string;
}

export interface InterpretResponse {
  chartId: string;
  interpretation: Interpretation;
  meta: Versions;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
