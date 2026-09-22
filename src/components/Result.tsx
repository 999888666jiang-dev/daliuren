import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  Download,
  Printer,
  Sparkles,
} from "lucide-react";
import { ENGINE_VERSION, RULE_VERSION } from "../core";
import { CORPUS_VERSION, matchBifa, selectEvidence } from "../data/evidence";
import type { Interpretation } from "../core/types";
import {
  categories,
  exportReport,
  saveReport,
  timeText,
  type Report,
} from "../lib/report";
import { Plate } from "./Plate";
import { Evidence } from "./Evidence";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "")
  .trim()
  .replace(/\/$/, "");
export function Result({
  report,
  onUpdate,
}: {
  report: Report;
  onUpdate: (patch: Partial<Report>) => void;
}) {
  const { chart } = report;
  const priority = (r: { id: string; ruleIds: string[] }) =>
    r.id.startsWith("bifa-")
      ? 0
      : r.ruleIds.includes(chart.method.name)
        ? 1
        : 2;
  const records = [
    ...(report.evidenceSnapshot ?? selectEvidence(chart, report.category)),
  ].sort((a, b) => priority(a) - priority(b));
  const matches = matchBifa(chart, report.category);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [invite, setInvite] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [health, setHealth] = useState<
    "checking" | "ready" | "unavailable" | "not_configured"
  >(API_BASE ? "checking" : "not_configured");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!API_BASE) return;
    const c = new AbortController();
    fetch(`${API_BASE}/api/health`, { signal: c.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((data) =>
        setHealth(data.status === "ready" ? "ready" : "not_configured"),
      )
      .catch(() => {
        if (!c.signal.aborted) setHealth("unavailable");
      });
    return () => c.abort();
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  async function interpret() {
    if (!chart.input) return;
    setLoading(true);
    setApiError("");
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const timer = setTimeout(() => c.abort(), 35000);
    try {
      const response = await fetch(`${API_BASE}/api/interpret`, {
        method: "POST",
        signal: c.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${invite.trim()}`,
        },
        body: JSON.stringify({
          input: chart.input,
          question: report.question,
          category: report.category,
          ruleVersion: RULE_VERSION,
          corpusVersion: CORPUS_VERSION,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || "解读服务暂时不可用。");
      if (
        data.chartId !== chart.id ||
        !data.interpretation ||
        typeof data.interpretation.summary !== "string" ||
        !Array.isArray(data.interpretation.observations) ||
        !Array.isArray(data.interpretation.advice) ||
        !Array.isArray(data.interpretation.missingInformation) ||
        !Array.isArray(data.interpretation.limitations)
      )
        throw new Error("返回的课盘或解读格式不一致，请重新起课。");
      onUpdate({
        interpretation: data.interpretation as Interpretation,
        aiMeta: data.meta,
      });
      setInvite("");
      setSaved(false);
    } catch (err) {
      if (controller.current === c)
        setApiError(
          err instanceof Error && err.name !== "AbortError"
            ? err.message
            : "解读等待超时，课盘与原文仍可查看。",
        );
    } finally {
      clearTimeout(timer);
      if (controller.current === c) setLoading(false);
    }
  }
  function save() {
    try {
      saveReport(report);
      setSaved(true);
      setFeedback("已保存在当前浏览器，最多保留 30 份。");
    } catch {
      setFeedback("本机存储不可用，请导出报告保存。");
    }
  }
  const different =
    report.comparison &&
    JSON.stringify([
      chart.day,
      chart.hourBranch,
      chart.transmissions.map((t) => t.branch),
      chart.daytime,
    ]) !==
      JSON.stringify([
        report.comparison.day,
        report.comparison.hourBranch,
        report.comparison.transmissions.map((t) => t.branch),
        report.comparison.daytime,
      ]);
  const currentVersion =
    chart.engineVersion === ENGINE_VERSION &&
    chart.ruleVersion === RULE_VERSION &&
    (!report.corpusVersion || report.corpusVersion === CORPUS_VERSION);
  return (
    <div className="result-page page-width">
      <div className="result-header">
        <div>
          <a className="back-link" href="#/">
            <ArrowLeft size={15} />
            重新起课
          </a>
          <h1>此课所见</h1>
        </div>
        <div className="report-actions">
          <button onClick={save} className="outline-button">
            {saved ? <Check size={16} /> : <Bookmark size={16} />}
            <span>{saved ? "已保存" : "保存到本机"}</span>
          </button>
          <button className="text-button" onClick={() => exportReport(report)}>
            <Download size={16} />
            导出
          </button>
          <button
            className="icon-button"
            aria-label="打印报告"
            onClick={() => window.print()}
          >
            <Printer size={17} />
          </button>
        </div>
      </div>
      {feedback && (
        <p role="status" className="save-feedback">
          {feedback}
        </p>
      )}
      <p className="question-display">
        <span>所问</span>
        {report.question}
      </p>
      <div className="report-context">
        <span>{categories.find((c) => c.id === report.category)?.long}</span>
        <span>
          {chart.time
            ? timeText(chart.time.beijing) + " · 北京时间"
            : "人工指定古课"}
        </span>
        <span>
          {chart.time
            ? `${report.place} · ${chart.time.timeBasis === "solar" ? "真太阳时" : "标准时"}`
            : chart.ruleVersion}
        </span>
      </div>
      {chart.engineVersion !== ENGINE_VERSION && (
        <p className="notice">
          这份记录使用引擎 {chart.engineVersion}，保留的是当时的课盘；当前引擎为{" "}
          {ENGINE_VERSION}。
        </p>
      )}
      <div className="result-grid">
        <aside className="chart-column">
          <Plate chart={chart} compact />
          <div className="chart-overview">
            <span>
              月将 <b>{chart.monthGeneral}</b>
            </span>
            <span>
              占时 <b>{chart.hourBranch}</b>
            </span>
            <span>
              旬空 <b>{chart.voids.join("、")}</b>
            </span>
          </div>
          <section className="chart-table-section">
            <h2>四课</h2>
            <table className="chart-table">
              <caption className="sr-only">四课下神与上神</caption>
              <thead>
                <tr>
                  <th>课序</th>
                  {chart.lessons.map((_, i) => (
                    <th key={i}>{["一课", "二课", "三课", "四课"][i]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>上神</th>
                  {chart.lessons.map((l, i) => (
                    <td key={i}>{l.upper}</td>
                  ))}
                </tr>
                <tr>
                  <th>下神</th>
                  {chart.lessons.map((l, i) => (
                    <td key={i}>{l.lower}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </section>
          <section className="chart-table-section">
            <h2>
              三传 <small>{chart.method.name}</small>
            </h2>
            <table className="chart-table">
              <caption className="sr-only">三传、遁干、六亲与天将</caption>
              <thead>
                <tr>
                  <th>传序</th>
                  {["初传", "中传", "末传"].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    name: "遁干",
                    value: (i: number) =>
                      chart.transmissions[i].hiddenStem || "空",
                  },
                  {
                    name: "地支",
                    value: (i: number) => chart.transmissions[i].branch,
                  },
                  {
                    name: "六亲",
                    value: (i: number) => chart.transmissions[i].relative,
                  },
                  {
                    name: "天将",
                    value: (i: number) => chart.transmissions[i].general,
                  },
                ].map((row) => (
                  <tr key={row.name}>
                    <th>{row.name}</th>
                    {chart.transmissions.map((_, i) => (
                      <td key={i}>{row.value(i)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">{chart.method.detail}</p>
          </section>
          <details className="fold-section">
            <summary>
              十二宫明细
              <ChevronDown size={16} />
            </summary>
            <table className="data-table">
              <thead>
                <tr>
                  <th>地盘</th>
                  <th>天盘</th>
                  <th>天将</th>
                </tr>
              </thead>
              <tbody>
                {"子丑寅卯辰巳午未申酉戌亥".split("").map((b, i) => (
                  <tr key={b}>
                    <td>{b}</td>
                    <td>{chart.heavenPlate[i]}</td>
                    <td>{chart.generals[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </aside>
        <div className="reading-column">
          <section className="reading-section">
            <div className="section-heading">
              <h2>古籍原文与依据</h2>
              <a href="#/sources">查阅典籍 ↗</a>
            </div>
            <p className="section-intro">
              以下条文按本课实际命中的规则与条件选取。
            </p>
            {records.length ? (
              records.map((r) => (
                <div key={r.id}>
                  <Evidence record={r} />
                  {matches.find((m) => m.evidenceId === r.id) && (
                    <p className="application-note">
                      本课命中：
                      {matches.find((m) => m.evidenceId === r.id)!.condition}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="notice">
                本课暂未匹配到已核引文，不使用待校文字补齐。
              </p>
            )}
          </section>
          <section className="reading-section ai-section">
            <div className="section-heading">
              <h2>当前问题的解读</h2>
              <Sparkles size={18} />
            </div>
            {report.interpretation ? (
              <div className="interpretation">
                <p className="interpretation-summary">
                  {report.interpretation.summary}
                </p>
                <h3>传统解释</h3>
                {report.interpretation.observations.map((o, i) => (
                  <div className="observation" key={i}>
                    <p>{o.text}</p>
                    <div className="evidence-links">
                      {o.factIds.map((id) => (
                        <span key={id}>
                          {chart.facts.find((f) => f.id === id)?.label || id}
                        </span>
                      ))}
                      {o.evidenceIds.map((id) => (
                        <a key={id} href={`#/sources/${id}`}>
                          {records.find((r) => r.id === id)?.title || id} ↗
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
                <h3>
                  行动建议 <small>现代建议</small>
                </h3>
                <ol>
                  {report.interpretation.advice.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
                {report.interpretation.missingInformation.length > 0 && (
                  <>
                    <h3>仍需了解</h3>
                    <ul>
                      {report.interpretation.missingInformation.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="muted small">
                  {report.interpretation.limitations.join(" ")}
                </p>
                <p className="version-line">
                  {report.aiMeta?.model} · {report.aiMeta?.promptVersion} ·{" "}
                  {report.aiMeta?.corpusVersion}
                </p>
              </div>
            ) : (
              <div className="ai-empty">
                <p className="computed-summary">
                  本课以<span>{chart.method.name}</span>取传，三传为{" "}
                  <b>{chart.transmissions.map((t) => t.branch).join(" → ")}</b>
                  。
                </p>
                <p>
                  {!chart.input
                    ? "人工课例用于排盘复核；在线问事解读请使用时间起课。"
                    : health === "not_configured"
                      ? "在线 AI 解读尚未接通。课盘与已核古籍可正常查看，综合解读将在服务配置后开启。"
                      : "课盘与文献已就绪。AI 将结合你的具体问题解释证据，并给出行动建议。"}
                </p>
              </div>
            )}
            {!currentVersion && (
              <p className="notice">
                这份报告使用较早的规则或文献版本。保留原课盘与引文；如需新的 AI
                解读，请重新起课。
              </p>
            )}
            {chart.input &&
              currentVersion &&
              API_BASE &&
              health !== "not_configured" && (
                <form
                  className="ai-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void interpret();
                  }}
                >
                  <label className="field">
                    亲友邀请码
                    <input
                      aria-label="亲友邀请码"
                      type="password"
                      autoComplete="off"
                      minLength={16}
                      maxLength={256}
                      required
                      value={invite}
                      onChange={(e) => setInvite(e.target.value)}
                      placeholder="邀请码只用于本次调用"
                    />
                  </label>
                  <label className="check-label consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      required
                    />
                    同意将本次问题和必要课盘资料发送给 DeepSeek
                    生成解读。网站不保存完整问事记录。
                  </label>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={loading || !consent || !invite.trim()}
                  >
                    <Sparkles size={16} />
                    {loading
                      ? "正在据课解读…"
                      : report.interpretation
                        ? "重新生成解读"
                        : "生成 AI 解读"}
                  </button>
                  {health === "unavailable" && (
                    <p className="muted small">
                      暂时无法检查服务状态，提交时将再次尝试连接。
                    </p>
                  )}
                </form>
              )}
            {apiError && (
              <p className="error-message" role="alert">
                {apiError}
              </p>
            )}
          </section>
          {chart.time && (
            <details
              className="fold-section"
              open={different || chart.time.nearBoundary}
            >
              <summary>
                标准时与真太阳时对照
                <ChevronDown size={16} />
              </summary>
              <div className="time-comparison">
                <dl>
                  <div>
                    <dt>北京时间</dt>
                    <dd>{timeText(chart.time.beijing)}</dd>
                  </div>
                  <div>
                    <dt>真太阳时</dt>
                    <dd>
                      {chart.time.solar
                        ? timeText(chart.time.solar)
                        : "未提供经度"}
                    </dd>
                  </div>
                  <div>
                    <dt>经度修正</dt>
                    <dd>
                      {chart.time.longitudeCorrectionMinutes === null
                        ? "—"
                        : `${chart.time.longitudeCorrectionMinutes.toFixed(2)} 分钟`}
                    </dd>
                  </div>
                  <div>
                    <dt>均时差</dt>
                    <dd>
                      {chart.time.equationOfTimeMinutes === null
                        ? "—"
                        : `${chart.time.equationOfTimeMinutes.toFixed(2)} 分钟`}
                    </dd>
                  </div>
                </dl>
                {report.comparison && (
                  <div className={different ? "notice" : "comparison-note"}>
                    {different
                      ? "时间口径改变了本课。"
                      : "两种时间口径的关键课盘一致。"}
                    <br />
                    当前：{chart.day.stem}
                    {chart.day.branch}日 · {chart.hourBranch}时 ·{" "}
                    {chart.transmissions.map((t) => t.branch).join(" → ")}
                    <br />
                    对照：{report.comparison.day.stem}
                    {report.comparison.day.branch}日 ·{" "}
                    {report.comparison.hourBranch}时 ·{" "}
                    {report.comparison.transmissions
                      .map((t) => t.branch)
                      .join(" → ")}
                  </div>
                )}
                {chart.time.nearBoundary && (
                  <p className="notice">
                    当前接近时辰或换日边界，几分钟的时间或地点误差可能改变课盘。
                  </p>
                )}
                <p className="muted small">
                  中气交接按同一真实时刻计算，不随钟面校正移动。
                </p>
              </div>
            </details>
          )}
          <details className="fold-section">
            <summary>
              起课推导过程
              <ChevronDown size={16} />
            </summary>
            <ol className="trace-list">
              {chart.trace.map((step) => (
                <li key={step.id}>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                  {step.sourceIds.map((id) => (
                    <a key={id} href={`#/sources/${id}`}>
                      依据 {id} ↗
                    </a>
                  ))}
                </li>
              ))}
            </ol>
          </details>
          <details className="fold-section">
            <summary>
              规则口径与资料边界
              <ChevronDown size={16} />
            </summary>
            <ul className="profile-notes">
              {chart.profileWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <a href="#/rules" className="text-link">
              查看完整规则说明 ↗
            </a>
          </details>
        </div>
      </div>
      <p className="report-footer">
        课号 {chart.id} · 引擎 {chart.engineVersion} · 规则 {chart.ruleVersion}{" "}
        · 文献 {report.corpusVersion || CORPUS_VERSION}
      </p>
    </div>
  );
}
