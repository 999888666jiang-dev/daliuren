import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  Download,
  Printer,
} from "lucide-react";
import { ENGINE_VERSION, RULE_VERSION } from "../core";
import { CORPUS_VERSION, matchBifa } from "../data/evidence";
import {
  categories,
  exportReport,
  saveReport,
  timeText,
  type Report,
} from "../lib/report";
import { Plate } from "./Plate";
import { Evidence } from "./Evidence";
import { AiReading } from "./AiReading";
import { ContinueQuestion, type ContinueInput } from "./ContinueQuestion";
import { QuestionGuide } from "./QuestionGuide";
export function Result({
  report,
  onUpdate,
  onContinue,
  reports,
}: {
  report: Report;
  onUpdate: (patch: Partial<Report>) => void;
  onContinue: (input: ContinueInput) => string | void;
  reports: Report[];
}) {
  const { chart } = report;
  const priority = (r: { id: string; ruleIds: string[] }) =>
    r.id.startsWith("bifa-")
      ? 0
      : r.ruleIds.includes(chart.method.name)
        ? 1
        : 2;
  const records = [...(report.evidenceSnapshot ?? [])].sort(
    (a, b) => priority(a) - priority(b),
  );
  const matches = matchBifa(chart, report.category);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => setSaved(false), [report]);
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
    report.corpusVersion === CORPUS_VERSION &&
    Array.isArray(report.evidenceSnapshot);
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
        <span>
          {report.consultation?.mode === "reuse"
            ? "本盘续问 · 不重排"
            : chart.input?.castMode === "living"
              ? `报数活时 · ${chart.input.livingNumber} → ${chart.hourBranch}时`
              : chart.manualInput
                ? "古课复核"
                : "正时起课"}
        </span>
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
      {chart.input?.castMode === "living" && (
        <p className="notice">
          本课以报数 {chart.input.livingNumber} 取虚拟{chart.hourBranch}
          时；日干支、月将、昼夜仍取真实时刻。报数是备选取法，不保证每次不同，也不保证判断准确。
        </p>
      )}
      {report.consultation?.mode === "reuse" && (
        <p className="notice">
          沿用原课 {chart.id}
          。所问及年命独立记录，四课三传完全保留；本次沿用原盘，未重新起课。原盘对不同事情仍有共同约束。
        </p>
      )}
      {report.consultation?.changeNote && (
        <p className="notice">
          本次记录的现实变化：{report.consultation.changeNote}
        </p>
      )}
      {chart.engineVersion !== ENGINE_VERSION && (
        <p className="notice">
          这份记录使用引擎 {chart.engineVersion}，保留的是当时的课盘；当前引擎为{" "}
          {ENGINE_VERSION}。
        </p>
      )}
      {report.warnings?.map((warning, i) => (
        <p key={i} className="notice">
          {warning}
        </p>
      ))}
      <section className="answer-brief">
        {report.interpretation ? (
          <>
            <span className="section-eyebrow">本次简答 · AI 现代解读</span>
            <p>{report.interpretation.summary}</p>
          </>
        ) : (
          <p>课盘已生成。可继续结合具体问题解读，并逐条核对古籍依据。</p>
        )}
        <button
          className="outline-button no-print"
          onClick={() => {
            const node = document.getElementById("ai-reading");
            node?.scrollIntoView({ behavior: "instant", block: "start" });
            node?.focus({ preventScroll: true });
          }}
        >
          {report.interpretation ? "查看详细解释" : "解读当前问题"}
        </button>
      </section>
      <ContinueQuestion reports={reports} onContinue={onContinue} />
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
          {currentVersion && (
            <QuestionGuide
              chart={chart}
              question={report.question}
              category={report.category}
            />
          )}
          <AiReading
            report={report}
            currentVersion={currentVersion}
            onUpdate={onUpdate}
          />
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
        · 文献 {report.corpusVersion || "未记录"}
      </p>
    </div>
  );
}
