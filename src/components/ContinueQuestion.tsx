import { useState } from "react";
import { BRANCHES } from "../core";
import type { Branch } from "../core/types";
import type { CategoryChoice } from "../ai/types";
import type { MatterInput } from "../lib/consultation";
import { categories, type Report } from "../lib/report";
import { MatterFields } from "./MatterFields";

export interface ContinueInput {
  question: string;
  category: CategoryChoice;
  natal?: Branch;
  annual?: Branch;
  matter: MatterInput;
}
export function ContinueQuestion({
  reports,
  onContinue,
}: {
  reports: Report[];
  onContinue: (input: ContinueInput) => string | void;
}) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<CategoryChoice>("auto");
  const [natal, setNatal] = useState<Branch | "">("");
  const [annual, setAnnual] = useState<Branch | "">("");
  const [matter, setMatter] = useState<MatterInput>({ acknowledged: false });
  const [error, setError] = useState("");
  return (
    <details className="fold-section continue-section no-print">
      <summary>高级选项 · 本盘继续占问新问题</summary>
      <p className="section-intro">
        本盘续问（次客参考）：保留原天地盘、四课、三传与昼夜天将，只更新所问、事项侧重和个人年命辅助信息。不同人的年命须分别提供；不继承上一位的资料与解读。这是本站产品口径，不等同于古籍移时口诀。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const message = onContinue({
            question: question.trim(),
            category,
            natal: natal || undefined,
            annual: annual || undefined,
            matter,
          });
          setError(message || "");
        }}
      >
        <label className="field">
          本盘新问题
          <textarea
            required
            minLength={4}
            maxLength={1200}
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="写下与之前不同的事情，以及已经知道的背景。"
          />
        </label>
        <label className="field">
          新问题类别
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryChoice)}
          >
            <option value="auto">自动识别</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.long}
              </option>
            ))}
          </select>
        </label>
        <div className="coordinates-fields">
          <label className="field">
            本次求测人的本命
            <select
              value={natal}
              onChange={(e) => setNatal(e.target.value as Branch | "")}
            >
              <option value="">未提供</option>
              {BRANCHES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="field">
            本次求测人的行年
            <select
              value={annual}
              onChange={(e) => setAnnual(e.target.value as Branch | "")}
            >
              <option value="">未提供</option>
              {BRANCHES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
        </div>
        <MatterFields value={matter} onChange={setMatter} reports={reports} />
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <button className="outline-button" type="submit">
          沿用本盘，解读新问题
        </button>
      </form>
    </details>
  );
}
