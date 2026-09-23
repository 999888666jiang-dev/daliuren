import { useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, Sparkles, X } from "lucide-react";
import { requestIntent, requestInterpretation } from "../ai/client";
import { resolveIntent } from "../ai/intent";
import { assessRules } from "../ai/assessments";
import type { IntentAssessment, RuleAssessment } from "../ai/types";
import { CORPUS_VERSION, selectEvidence } from "../data/evidence";
import { categories, type Report } from "../lib/report";
import { credentialSnapshot } from "../lib/credentials";
import { Credentials, useCredential } from "./Credentials";

type Stage =
  | "idle"
  | "understanding"
  | "clarifying"
  | "interpreting"
  | "success"
  | "error";
const statusNames = {
  met: "条件满足",
  not_met: "条件不满足",
  unknown: "仍有未判条件",
  not_applicable: "不适用于此类问题",
};

export function AssessmentDetails({
  assessments,
}: {
  assessments: RuleAssessment[];
}) {
  const unknown = assessments.filter((a) => a.status === "unknown");
  const hasJudgement = assessments.some(
    (a) => a.kind === "judgement" && a.status === "met",
  );
  return (
    <div className="assessment-details">
      {!hasJudgement && (
        <p className="scope-note">
          当前已核条文对这件事的传统判断覆盖有限。取传口诀解释排盘步骤，不能单独推出事情吉凶。
        </p>
      )}
      {unknown.map((a) => (
        <div key={a.id} className="notice">
          <strong>{a.title}：仍有未判条件</strong>
          <p>{a.statement}</p>
          {a.caveats.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </div>
      ))}
      <details className="fold-section">
        <summary>
          本课的规则适用检查 <ChevronDown size={16} />
        </summary>
        <div className="assessment-list">
          {assessments.map((a) => (
            <article key={a.id}>
              <div>
                <h3>{a.title}</h3>
                <span className={`assessment-status ${a.status}`}>
                  {statusNames[a.status]}
                </span>
              </div>
              <p>{a.statement}</p>
              {a.missingInputs.length > 0 && (
                <p className="muted">尚缺：{a.missingInputs.join("、")}</p>
              )}
              <p className="assessment-caveat">{a.caveats.join(" ")}</p>
              <div className="evidence-links">
                {a.evidenceIds.map((id) => (
                  <a href={`#/sources/${id}`} key={id}>
                    核对原条 ↗
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

export function AiReading({
  report,
  currentVersion,
  onUpdate,
}: {
  report: Report;
  currentVersion: boolean;
  onUpdate: (patch: Partial<Report>) => void;
}) {
  const credential = useCredential();
  const [stage, setStage] = useState<Stage>("idle");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [pendingIntent, setPendingIntent] = useState<IntentAssessment | null>(
    null,
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const active = useRef<AbortController | null>(null);
  const submittedKey = useRef("");
  const locked = useRef(false);
  const busy = stage === "understanding" || stage === "interpreting";
  const explanation = report.interpretation ?? report.legacyInterpretation;
  const assessments = report.assessments ?? [];

  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
      locked.current = false;
    },
    [],
  );
  useEffect(() => {
    if (active.current && submittedKey.current !== credential.value.trim())
      cancel("密钥已更改或清除，本次解读已停止。");
  }, [credential.value]);

  function cancel(
    message = "已取消本次解读。已发送的模型请求可能仍消耗账户额度，网站不会自动重试。",
  ) {
    active.current?.abort();
    active.current = null;
    locked.current = false;
    setStage("idle");
    setPendingIntent(null);
    setError(message);
  }
  function isActive(controller: AbortController) {
    return active.current === controller && !controller.signal.aborted;
  }
  function applyIntent(
    intent: IntentAssessment,
    currentAnswers: Record<string, string>,
  ) {
    const nextAssessments = assessRules(report.chart, intent.category);
    const evidence = selectEvidence(report.chart, intent.category);
    onUpdate({
      intent,
      category: intent.category,
      assessments: nextAssessments,
      evidenceSnapshot: evidence,
      corpusVersion: CORPUS_VERSION,
      clarificationAnswers: currentAnswers,
    });
    return { nextAssessments, evidence };
  }
  async function complete(
    intent: IntentAssessment,
    currentAnswers: Record<string, string>,
    controller: AbortController,
  ) {
    if (!isActive(controller)) return;
    const { nextAssessments, evidence } = applyIntent(intent, currentAnswers);
    setStage("interpreting");
    const result = await requestInterpretation({
      apiKey: submittedKey.current,
      question: report.question,
      chart: report.chart,
      intent,
      answers: currentAnswers,
      assessments: nextAssessments,
      evidence,
      consultationMode: report.consultation?.mode,
      signal: controller.signal,
    });
    if (!isActive(controller)) return;
    onUpdate({
      interpretation: result.interpretation,
      legacyInterpretation: undefined,
      aiMeta: { ...result.meta },
    });
    setStage("success");
    setPendingIntent(null);
    active.current = null;
    locked.current = false;
  }
  function fail(e: unknown, controller: AbortController) {
    if (!isActive(controller)) return;
    setError(
      e instanceof Error ? e.message : "解读未完成，课盘和古籍原文仍可查看。",
    );
    setStage("error");
    active.current = null;
    locked.current = false;
  }
  async function start() {
    if (
      locked.current ||
      !credential.value.trim() ||
      !consent ||
      !currentVersion
    )
      return;
    locked.current = true;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    submittedKey.current = credential.value.trim();
    setError("");
    setAnswers({});
    setPendingIntent(null);
    setStage("understanding");
    onUpdate({
      interpretation: undefined,
      legacyInterpretation: undefined,
      aiMeta: undefined,
      clarificationAnswers: undefined,
    });
    try {
      const intent = await requestIntent({
        apiKey: submittedKey.current,
        question: report.question,
        categoryChoice: report.categoryChoice,
        signal: controller.signal,
      });
      if (!isActive(controller)) return;
      applyIntent(intent, {});
      if (intent.status === "needs_clarification") {
        setPendingIntent(intent);
        setStage("clarifying");
      } else await complete(intent, {}, controller);
    } catch (e) {
      fail(e, controller);
    } finally {
      if (active.current === controller) {
        locked.current = false;
        if (controller.signal.aborted) setStage("idle");
      }
    }
  }
  async function continueReading() {
    if (
      locked.current ||
      !pendingIntent ||
      !consent ||
      !credentialSnapshot().value.trim()
    )
      return;
    const controller = active.current;
    if (!controller || !isActive(controller)) return;
    locked.current = true;
    setError("");
    const supplied = Object.fromEntries(
      Object.entries(answers)
        .map(([id, value]) => [id, value.trim()])
        .filter(([, value]) => value),
    );
    try {
      await complete(
        resolveIntent(pendingIntent, supplied),
        supplied,
        controller,
      );
    } catch (e) {
      fail(e, controller);
    } finally {
      if (active.current === controller) locked.current = false;
    }
  }
  const intent = report.intent;
  return (
    <section
      className="reading-section ai-section"
      id="ai-reading"
      tabIndex={-1}
    >
      <div className="section-heading">
        <h2>当前问题的解读</h2>
        <Sparkles size={18} />
      </div>
      {report.legacyInterpretation && (
        <p className="notice">
          这是旧版保存的 AI 解读，未经过第二版条件校验；原课盘和引文保持不变。
        </p>
      )}
      {intent && (
        <div className="intent-summary">
          <span className="section-eyebrow">
            {intent.source === "model" ? "本次问题理解" : "本地初步识别"}
          </span>
          <p>{intent.coreQuestion}</p>
          <dl>
            <div>
              <dt>事项</dt>
              <dd>{categories.find((c) => c.id === intent.category)?.long}</dd>
            </div>
            <div>
              <dt>主体</dt>
              <dd>{intent.subject || "未明说"}</dd>
            </div>
            <div>
              <dt>对象</dt>
              <dd>{intent.object || "尚未明确"}</dd>
            </div>
            <div>
              <dt>目标</dt>
              <dd>{intent.goal || "尚未明确"}</dd>
            </div>
            <div>
              <dt>时间范围</dt>
              <dd>{intent.timeframe || "未指定"}</dd>
            </div>
          </dl>
          {intent.categoryReason && (
            <p className="intent-reason">{intent.categoryReason}</p>
          )}
          {intent.missingInformation.length > 0 && (
            <div className="scope-note">
              <strong>问题中的未知信息</strong>
              <ul>
                {intent.missingInformation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {intent.status === "needs_clarification" &&
            (stage === "interpreting" || explanation) && (
              <p className="notice">
                仍有事项或对象未确认，本次仅按已知信息作有限解释，不视为已经补齐条件。
              </p>
            )}
        </div>
      )}
      <AssessmentDetails assessments={assessments} />
      {explanation ? (
        <div className="interpretation">
          <h3>
            对当前问题的回答 <small>AI 现代解读</small>
          </h3>
          <p className="interpretation-summary">{explanation.summary}</p>
          <h3>依据与考虑因素</h3>
          {explanation.observations.map((o, i) => (
            <article className="observation" key={i}>
              <span className="observation-kind">
                {"kind" in o
                  ? o.kind === "traditional"
                    ? "传统解释"
                    : "现实背景分析 · 非古籍结论"
                  : "旧版解读"}
              </span>
              <p>{o.text}</p>
              <div className="evidence-links">
                {o.factIds.map((id) => (
                  <span key={id}>
                    {report.chart.facts.find((f) => f.id === id)?.label || id}
                  </span>
                ))}
                {o.evidenceIds.map((id) => (
                  <a key={id} href={`#/sources/${id}`}>
                    {report.evidenceSnapshot?.find((e) => e.id === id)?.title ||
                      id}{" "}
                    ↗
                  </a>
                ))}
              </div>
            </article>
          ))}
          <h3>
            行动建议 <small>现代建议</small>
          </h3>
          <ol>
            {explanation.advice.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
          {explanation.missingInformation.length > 0 && (
            <>
              <h3>仍需了解</h3>
              <ul>
                {explanation.missingInformation.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          <p className="interpretation-limits">
            {explanation.limitations.join(" ")}
          </p>
          <p className="version-line">
            {report.aiMeta?.model} · {report.aiMeta?.promptVersion} ·{" "}
            {report.aiMeta?.corpusVersion}
          </p>
        </div>
      ) : (
        <p className="ai-introduction">
          上方本地分析可直接使用。需要进一步结合你写下的具体背景展开时，可生成
          AI
          解读：逐项区分已知事实、传统条件与现实核查建议，无法判断的结果明确保留。
        </p>
      )}
      {!currentVersion ? (
        <p className="notice">
          这份报告使用较早的规则或文献版本，保留原课盘、引文及原有解读，暂不追加新版
          AI。可以导出复核，不必为版本更新重复占问同一件事。
        </p>
      ) : (
        <div className="ai-controls no-print">
          <Credentials
            busy={busy}
            onClear={() => {
              if (active.current) cancel("密钥已清除，本次解读已停止。");
            }}
          />
          <label className="check-label consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            同意将本次问题、补充信息和必要课盘资料发送到
            DeepSeek。浏览器直接调用；网站不上传保存问事记录，调用使用你的
            DeepSeek 账户额度。
          </label>
          {stage === "clarifying" && pendingIntent ? (
            <form
              className="clarification-form"
              onSubmit={(e) => {
                e.preventDefault();
                void continueReading();
              }}
            >
              <h3>先明确这件事</h3>
              <p>
                补充后仍使用刚才的起课时间。这一轮最多两个问题；不清楚的内容可以留空。
              </p>
              {pendingIntent.clarifications.map((q) => (
                <fieldset key={q.id}>
                  <legend>{q.question}</legend>
                  {q.options.length > 0 && (
                    <div className="clarification-options">
                      {q.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={
                            answers[q.id] === option
                              ? "choice active"
                              : "choice"
                          }
                          aria-pressed={answers[q.id] === option}
                          onClick={() =>
                            setAnswers((a) => ({ ...a, [q.id]: option }))
                          }
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    aria-label={q.question}
                    placeholder="也可以直接写下你的补充；不确定可留空"
                    maxLength={500}
                    rows={2}
                    value={answers[q.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                    }
                  />
                </fieldset>
              ))}
              <button
                type="submit"
                className="primary-button"
                disabled={!consent || !credential.value.trim()}
              >
                <Sparkles size={16} />
                确认并解读
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => cancel()}
              >
                取消本次解读
              </button>
            </form>
          ) : (
            <div className="ai-submit-row">
              <button
                type="button"
                className="primary-button"
                disabled={busy || !consent || !credential.value.trim()}
                onClick={() => void start()}
              >
                {busy ? (
                  <LoaderCircle size={18} className="loading-icon" />
                ) : (
                  <Sparkles size={18} />
                )}{" "}
                {stage === "understanding"
                  ? "正在理解问题…"
                  : stage === "interpreting"
                    ? "正在据课解读…"
                    : explanation
                      ? "重新生成解读"
                      : stage === "error"
                        ? "手动重试解读"
                        : "生成 AI 解读"}
              </button>
              {busy && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => cancel()}
                >
                  <X size={17} />
                  取消本次解读
                </button>
              )}
            </div>
          )}
          {busy && (
            <p role="status" className="ai-progress">
              {stage === "understanding"
                ? "正在提取所问事项与背景，必要时会向你澄清。"
                : "正在结合已核条件生成解释，并检查返回内容。"}
              切换页面或关闭标签页会停止等待。
            </p>
          )}
          {stage === "success" && (
            <p role="status" className="save-feedback">
              解读已完成，可保存到本机或导出报告。
            </p>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <p className="ai-footnote">
            一次问事最多两次模型请求；失败不会自动重试。断网时若答案未收到，无法从服务器取回。校验覆盖结构与已编码规则，现代解释仍需结合实际核实。
          </p>
        </div>
      )}
    </section>
  );
}
