import { useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, Sparkles, X } from "lucide-react";
import { requestIntentV3, requestReading } from "../ai/client";
import { localIntent, resolveIntent } from "../ai/intent";
import type { IntentAssessment } from "../ai/types";
import type { ReadingContext, ReadingReferences } from "../ai/reading-types";
import { readingBoundaryNotes } from "../ai/reading-validation";
import { buildReadingContext } from "../ai/reading-assessments";
import {
  activeReading,
  appendReading,
  type ReadingRevision,
} from "../lib/reading-report";
import { categories, timeText, type Report } from "../lib/report";
import { Credentials, useCredential } from "./Credentials";
import { imageHref } from "./Evidence";

function References({
  refs,
  context,
  quotes = true,
}: {
  refs: ReadingReferences;
  context: ReadingContext;
  quotes?: boolean;
}) {
  const clauses = context.sources.flatMap((source) =>
    source.clauses.map((clause) => ({ source, clause })),
  );
  const facts = new Map<string, string[]>();
  for (const id of refs.factIds) {
    const transmission = id.match(/^transmission-([1-3])$/);
    if (
      transmission &&
      refs.factIds.includes(`reading-transmission-${transmission[1]}-detail`)
    )
      continue;
    const fact = context.facts.find((f) => f.id === id);
    if (!fact) continue;
    const labels = facts.get(fact.value) ?? [];
    if (!labels.includes(fact.label)) labels.push(fact.label);
    facts.set(fact.value, labels);
  }
  return (
    <div className="reading-references">
      <dl className="reading-facts">
        {[...facts].map(([value, labels]) => (
          <div key={value}>
            <dt>{labels.join(" / ")}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {quotes &&
        refs.clauseIds.map((id) => {
          const entry = clauses.find((c) => c.clause.id === id);
          return (
            entry && (
              <figure className="reading-quote" key={id}>
                <blockquote>{entry.clause.text}</blockquote>
                <figcaption>
                  《{entry.source.work}》· {entry.source.volume} ·{" "}
                  {entry.source.page}
                  <a
                    href={imageHref(entry.source.imageUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    对照原页 ↗
                  </a>
                </figcaption>
              </figure>
            )
          );
        })}
    </div>
  );
}

function Understanding({ intent }: { intent: IntentAssessment }) {
  const m = intent.meaning;
  const subject = m?.subject.value ?? intent.subject;
  const values = [
    [
      "事项",
      m?.topicLabel.value ??
        categories.find((c) => c.id === intent.category)?.long,
    ],
    [
      "主体",
      subject
        ? `${subject}${m?.subject.basis === "default_self" ? "（默认）" : ""}`
        : null,
    ],
    ["所问", m?.action.value],
    [
      "对象",
      m?.objects
        .map((o) => o.value)
        .filter(Boolean)
        .join("、") || intent.object,
    ],
    ["目标", m?.goal.value ?? intent.goal],
    ["时间", m?.time.value ?? intent.timeframe],
  ].filter(([, value]) => value);
  return (
    <div className="intent-summary">
      <span className="section-eyebrow">
        {intent.source === "model" ? "本次问题理解" : "本地问题理解"}
      </span>
      <p>{m?.focus.value ?? intent.coreQuestion}</p>
      <dl>
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {m && (
        <details className="meaning-origins">
          <summary>核对理解依据</summary>
          {[m.topicLabel, m.subject, m.action, ...m.objects, m.goal, m.time]
            .filter((f) => f.value)
            .map((f, i) => (
              <p key={i}>
                <b>{f.value}</b> ·{" "}
                {f.basis === "explicit"
                  ? "原文明说"
                  : f.basis === "default_self"
                    ? "省略主体时默认本人，可在下方补充更正"
                    : "语义概括"}
                {f.refs.map((ref, j) => (
                  <span key={j}>
                    {" "}
                    · {ref.source === "question" ? "原问" : "补充"}：“
                    {ref.quote}”
                  </span>
                ))}
              </p>
            ))}
        </details>
      )}
    </div>
  );
}

function ReadingBody({ reading }: { reading: ReadingRevision }) {
  const { interpretation: result, context } = reading;
  const boundaries = [
    ...new Set([
      ...readingBoundaryNotes(context, result),
      ...result.limitations,
    ]),
  ];
  const contribution = {
    supports: "支持因素",
    opposes: "阻碍因素",
    limits: "制约条件",
    describes: "课象说明",
  };
  const backgroundOnly = (item: (typeof result.reasoning)[number]) =>
    item.contribution === "describes" &&
    item.assessmentIds.every((id) => {
      const assessment = context.assessments.find((a) => a.id === id);
      return (
        assessment?.kind === "procedure" || id === "principle-three-stages"
      );
    });
  const substantive = result.reasoning.filter((item) => !backgroundOnly(item));
  const mainReasoning = substantive.length ? substantive : result.reasoning;
  const background = substantive.length
    ? result.reasoning.filter(backgroundOnly)
    : [];
  const renderReason = (
    item: (typeof result.reasoning)[number],
    index: number,
  ) => (
    <article className="reasoning-card" key={item.id} id={`reason-${item.id}`}>
      <div className="reasoning-heading">
        <span className="reasoning-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h4>{item.title}</h4>
        <span className={`contribution ${item.contribution}`}>
          {contribution[item.contribution]}
        </span>
      </div>
      <References refs={item} context={context} />
      <div className="reading-explanation">
        <span>这句怎么理解</span>
        <p>{item.literalMeaning}</p>
      </div>
      <div className="reading-application">
        <span>落到你问的这件事</span>
        <p>{item.application}</p>
      </div>
    </article>
  );
  return (
    <div className="interpretation reading-v3">
      {result.focus.length > 0 && <h3>本问如何取用</h3>}
      {result.focus.map((item) => (
        <article className="reading-focus" key={item.id}>
          <h4>{item.title}</h4>
          <p>{item.explanation}</p>
          <details className="meaning-origins">
            <summary>取用依据</summary>
            <References refs={item} context={context} />
          </details>
        </article>
      ))}
      <h3>据课逐项推演</h3>
      {mainReasoning.map(renderReason)}
      <h3>合起来怎么看</h3>
      <p className="reading-synthesis">{result.synthesis.text}</p>
      {!!result.advice.length && (
        <>
          <h3>具体怎么做</h3>
          <ol className="reading-advice">
            {result.advice.map((a, i) => (
              <li key={i}>
                <strong>{a.action}</strong>
                <p>{a.purpose}</p>
                <div className="evidence-links">
                  {a.reasoningIds.map((id) => (
                    <button
                      className="text-button"
                      key={id}
                      onClick={() => {
                        const target = document.getElementById(`reason-${id}`);
                        const folded = target?.closest("details");
                        if (folded) folded.open = true;
                        target?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                    >
                      依据：{result.reasoning.find((r) => r.id === id)?.title}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {background.length > 0 && (
        <details className="fold-section">
          <summary>
            排盘与三传框架说明 <ChevronDown size={16} />
          </summary>
          {background.map(renderReason)}
        </details>
      )}
      {boundaries.length > 0 && (
        <details className="fold-section">
          <summary>
            本次推演的适用范围 <ChevronDown size={16} />
          </summary>
          <ul>
            {boundaries.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="version-line">
        AI 辅助据课推演 · {reading.meta.model} · {reading.meta.promptVersion} ·{" "}
        {timeText(reading.createdAt)} UTC
      </p>
    </div>
  );
}

export function Reading({
  report,
  currentVersion,
  onUpdate,
}: {
  report: Report;
  currentVersion: boolean;
  onUpdate: (patch: Partial<Report>) => void;
}) {
  const credential = useCredential();
  const [stage, setStage] = useState<
    | "idle"
    | "understanding"
    | "clarifying"
    | "interpreting"
    | "success"
    | "error"
  >("idle");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [correction, setCorrection] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<IntentAssessment | null>(null);
  const request = useRef<AbortController | null>(null);
  const submittedKey = useRef("");
  const initialObject = useRef("");
  const locked = useRef(false);
  const busy = stage === "understanding" || stage === "interpreting";
  const selected = activeReading(report);
  const old = report.interpretation ?? report.legacyInterpretation;
  const displayedIntent =
    selected?.intent ??
    (old ? report.intent : undefined) ??
    localIntent(report.question, report.categoryChoice);
  const currentReport = useRef(report);
  useEffect(() => {
    currentReport.current = report;
  }, [report]);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
      locked.current = false;
    },
    [],
  );
  useEffect(() => {
    if (request.current && credential.value.trim() !== submittedKey.current)
      cancel("密钥已更改或清除，本次解读已停止。");
  }, [credential.value]);
  const valid = (c: AbortController) =>
    request.current === c && !c.signal.aborted;
  function cancel(
    message = "已取消本次解读，原有课盘和答案保留。已发送的请求可能仍消耗账户额度。",
  ) {
    request.current?.abort();
    request.current = null;
    locked.current = false;
    setPending(null);
    setStage("idle");
    setError(message);
  }
  function fail(e: unknown, c: AbortController) {
    if (!valid(c)) return;
    setError(e instanceof Error ? e.message : "解读未完成，原有答案仍保留。");
    setStage("error");
    request.current = null;
    locked.current = false;
  }
  async function complete(
    intent: IntentAssessment,
    supplied: Record<string, string>,
    c: AbortController,
  ) {
    if (!valid(c)) return;
    setStage("interpreting");
    const context = buildReadingContext(report.chart, intent.category);
    const result = await requestReading({
      apiKey: submittedKey.current,
      question: report.question,
      questionAskedAt: report.createdAt,
      chart: report.chart,
      intent,
      answers: supplied,
      context,
      consultationMode: report.consultation?.mode,
      signal: c.signal,
    });
    if (!valid(c) || currentReport.current.id !== report.id) return;
    const revision: ReadingRevision = {
      id: crypto.randomUUID(),
      createdAt: result.meta.generatedAt,
      questionAskedAt: report.createdAt,
      intent,
      answers: supplied,
      context,
      interpretation: result.interpretation,
      meta: result.meta,
    };
    onUpdate(appendReading(currentReport.current, revision));
    setCorrection("");
    request.current = null;
    locked.current = false;
    setPending(null);
    setStage("success");
  }
  async function start() {
    if (
      locked.current ||
      !credential.value.trim() ||
      !consent ||
      !currentVersion
    )
      return;
    if ((report.readingRevisions?.length ?? 0) >= 100) {
      setError("此课已有100版解读，原记录已保留；请先导出备份。");
      return;
    }
    locked.current = true;
    request.current?.abort();
    const c = new AbortController();
    request.current = c;
    submittedKey.current = credential.value.trim();
    setError("");
    setPending(null);
    setStage("understanding");
    const supplied: Record<string, string> = {
      ...(selected?.answers ?? report.clarificationAnswers ?? {}),
    };
    if (correction.trim() && correction.trim() !== supplied.object) {
      const previous = supplied.object;
      const combined = previous
        ? `${previous}\n本次更正：${correction.trim()}`
        : correction.trim();
      if (combined.length > 500) {
        request.current = null;
        locked.current = false;
        setStage("error");
        setError(
          "已有补充与本次更正合计超过500字，请精简本次更正；原有解读保留。",
        );
        return;
      }
      supplied.object = combined;
    }
    setAnswers(supplied);
    initialObject.current = supplied.object ?? "";
    try {
      const intent = await requestIntentV3({
        apiKey: submittedKey.current,
        question: report.question,
        categoryChoice: report.categoryChoice,
        answers: supplied,
        signal: c.signal,
      });
      if (!valid(c)) return;
      if (intent.status === "needs_clarification") {
        setPending(intent);
        if (intent.clarifications.some((item) => item.id === "object")) {
          setAnswers({ ...supplied, object: "" });
        }
        setStage("clarifying");
        locked.current = false;
      } else await complete(intent, supplied, c);
    } catch (e) {
      fail(e, c);
    }
  }
  async function continueReading() {
    const c = request.current;
    if (locked.current || !c || !pending || !consent || !valid(c)) return;
    locked.current = true;
    setError("");
    const supplied = Object.fromEntries(
      Object.entries(answers)
        .map(([id, v]) => [id, v.trim()])
        .filter(([, v]) => v),
    );
    if (
      pending.clarifications.some((item) => item.id === "object") &&
      initialObject.current
    ) {
      supplied.object =
        supplied.object && supplied.object !== initialObject.current
          ? `${initialObject.current}\n补充答复：${supplied.object}`
          : initialObject.current;
      if (supplied.object.length > 500) {
        locked.current = false;
        setError("本次回答与已有补充合计超过500字，请精简回答；原记录保留。");
        return;
      }
    }
    const resolved = resolveIntent(pending, supplied, report.question);
    if (resolved.status === "needs_clarification") {
      locked.current = false;
      setError(
        "请先选择本次要解读的事项，或补充明确对象。原课盘和已有答案保留。",
      );
      return;
    }
    try {
      await complete(resolved, supplied, c);
    } catch (e) {
      fail(e, c);
    }
  }
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
      {((report.readingRevisions?.length ?? 0) > 1 ||
        ((report.readingRevisions?.length ?? 0) > 0 && old)) && (
        <label className="reading-version-select no-print">
          解读版本
          <select
            value={report.activeReadingId ?? "historical"}
            disabled={busy || stage === "clarifying"}
            onChange={(e) =>
              onUpdate({
                activeReadingId:
                  e.target.value === "historical" ? null : e.target.value,
              })
            }
          >
            {old && <option value="historical">历史解读（原版保留）</option>}
            {report.readingRevisions?.map((r, i) => (
              <option key={r.id} value={r.id}>
                第{i + 1}版 · {timeText(r.createdAt)} UTC
              </option>
            ))}
          </select>
        </label>
      )}
      <Understanding intent={displayedIntent} />
      {selected ? (
        <ReadingBody reading={selected} />
      ) : old ? (
        <details className="fold-section" open>
          <summary>
            历史解读 · 原版保留 <ChevronDown size={16} />
          </summary>
          <p className="muted small">
            以下依据旧版问题理解生成，可沿原盘更新为逐句推演。
          </p>
          <p>{old.summary}</p>
          {old.observations.map((o, i) => (
            <article className="observation" key={i}>
              <p>{o.text}</p>
            </article>
          ))}
          {!!old.advice.length && (
            <ol>
              {old.advice.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          )}
          {!!old.missingInformation.length && (
            <p className="muted">
              旧版未明信息：{old.missingInformation.join(" ")}
            </p>
          )}
          <p className="muted">{old.limitations.join(" ")}</p>
        </details>
      ) : (
        <p className="ai-introduction">
          原始课盘已列出。生成解读后，将围绕所问说明取用、三传发展与综合判断，并逐项附上对应古句。
        </p>
      )}
      {!currentVersion ? (
        <p className="notice">
          这份课盘使用未接入新版解释的旧引擎，原记录仍可阅读、打印和导出。
        </p>
      ) : (
        <div className="ai-controls no-print">
          <details className="fold-section">
            <summary>
              补充或更正问题理解（可选） <ChevronDown size={16} />
            </summary>
            <label>
              主体、对象或目标的补充
              <textarea
                aria-label="问题理解补充"
                rows={2}
                maxLength={500}
                value={correction}
                disabled={busy || stage === "clarifying"}
                onChange={(e) => setCorrection(e.target.value)}
                placeholder="例如代谁问、两个选项分别是什么；无需重复填写原问题"
              />
            </label>
          </details>
          <Credentials
            busy={busy}
            onClear={() => {
              if (request.current) cancel("密钥已清除，本次解读已停止。");
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
            DeepSeek。浏览器直接调用，使用你的账户额度。
          </label>
          {stage === "clarifying" && pending ? (
            <form
              className="clarification-form"
              onSubmit={(e) => {
                e.preventDefault();
                void continueReading();
              }}
            >
              <h3>先明确这件事</h3>
              <p>补充后仍沿用原课盘；不清楚的内容可以留空。</p>
              {pending.clarifications.map((q) => (
                <fieldset key={q.id}>
                  <legend>{q.question}</legend>
                  {!!q.options.length && (
                    <div className="clarification-options">
                      {q.options.map((option) => (
                        <button
                          type="button"
                          className={
                            answers[q.id] === option
                              ? "choice active"
                              : "choice"
                          }
                          key={option}
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
                    rows={2}
                    maxLength={500}
                    value={answers[q.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                    }
                  />
                </fieldset>
              ))}
              <button
                className="primary-button"
                disabled={!consent || !credential.value.trim()}
              >
                确认并解读
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => cancel()}
              >
                取消本次解读
              </button>
            </form>
          ) : (
            <div className="ai-submit-row">
              <button
                className="primary-button"
                disabled={busy || !consent || !credential.value.trim()}
                onClick={() => void start()}
              >
                {busy ? (
                  <LoaderCircle size={18} className="loading-icon" />
                ) : (
                  <Sparkles size={18} />
                )}
                {stage === "understanding"
                  ? "正在理解问题…"
                  : stage === "interpreting"
                    ? "正在据课推演…"
                    : selected || old
                      ? "沿用此课更新解读"
                      : stage === "error"
                        ? "手动重试解读"
                        : "生成 AI 解读"}
              </button>
              {busy && (
                <button className="text-button" onClick={() => cancel()}>
                  <X size={17} />
                  取消本次解读
                </button>
              )}
            </div>
          )}
          {busy && (
            <p role="status" className="ai-progress">
              {stage === "understanding"
                ? "正在识别本次事项、主体与所求判断。"
                : "正在结合原盘与古籍逐句推演。"}
              原有答案将在新版完成前保留。
            </p>
          )}
          {stage === "success" && (
            <p role="status" className="save-feedback">
              解读已完成。可在本机记录回看，或导出完整报告。
            </p>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <p className="ai-footnote">
            一次解读最多两次模型请求；失败不会自动重试。更新解释沿用原盘，不属于重新占问。
          </p>
        </div>
      )}
    </section>
  );
}
