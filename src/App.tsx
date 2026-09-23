import { useEffect, useRef, useState } from "react";
import { FileClock, Menu, X } from "lucide-react";
import {
  cast,
  castManual,
  hasEquivalentChart,
  withPersonalContext,
} from "./core";
import { CORPUS_VERSION, selectEvidence } from "./data/evidence";
import type { CastInput, ManualInput } from "./core/types";
import type { CategoryChoice } from "./ai/types";
import { localIntent } from "./ai/intent";
import { assessRules } from "./ai/assessments";
import {
  comparedInput,
  readReports,
  saveReport,
  type Report,
} from "./lib/report";
import {
  realPeriod,
  resolveMatter,
  type MatterInput,
} from "./lib/consultation";
import type { ContinueInput } from "./components/ContinueQuestion";
import { Plate, Seal } from "./components/Plate";
import { CastForm } from "./components/CastForm";
import { Result } from "./components/Result";
import { Library } from "./components/Library";
import { Rules } from "./components/Rules";
import { History } from "./components/History";
const getRoute = () => window.location.hash.slice(1) || "/";
function reportForRoute(route: string, items: Report[]): Report | null {
  if (!route.startsWith("/result/")) return items[0] ?? null;
  try {
    return (
      items.find((r) => r.id === decodeURIComponent(route.slice(8))) ?? null
    );
  } catch {
    return null;
  }
}
export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [report, setReport] = useState<Report | null>(() =>
    reportForRoute(getRoute(), readReports()),
  );
  const [reports, setReports] = useState(readReports);
  const reportRef = useRef(report);
  useEffect(() => {
    reportRef.current = report;
  }, [report]);
  const [pending, setPending] = useState<{
    draft: Report;
    previous: Report;
  } | null>(null);
  const [requestedMode, setRequestedMode] = useState<{
    mode: "standard" | "living";
    revision: number;
  }>();
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const change = () => {
      const nextRoute = getRoute();
      setRoute(nextRoute);
      if (nextRoute.startsWith("/result/"))
        setReport((current) =>
          reportForRoute(nextRoute, [
            ...(current ? [current] : []),
            ...readReports(),
          ]),
        );
      setMenu(false);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  function finish(r: Report) {
    try {
      saveReport(r);
      setReports(readReports());
    } catch {
      r = {
        ...r,
        warnings: [
          ...(r.warnings ?? []),
          "本机存储不可用，本次报告仅保留在当前页面；请导出保存。",
        ],
      };
      setReports((items) =>
        [r, ...items.filter((item) => item.id !== r.id)].slice(0, 30),
      );
    }
    setReport(r);
    reportRef.current = r;
    setPending(null);
    setError("");
    window.location.hash = `/result/${encodeURIComponent(r.id)}`;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function onCast(
    input: CastInput,
    question: string,
    categoryChoice: CategoryChoice,
    place: string,
    matter: MatterInput,
  ) {
    try {
      if (question.length < 4)
        throw new Error("请至少用四个字描述你想问的事情。");
      const matterRecord = resolveMatter(question, matter, reports);
      const chart = cast(input);
      const intent = localIntent(question, categoryChoice);
      const category = intent.category;
      const comparison =
        input.longitude !== undefined ? cast(comparedInput(input)) : undefined;
      const draft: Report = {
        schemaVersion: 2,
        id: crypto.randomUUID(),
        categoryChoice,
        intent,
        assessments: assessRules(chart, category),
        evidenceSnapshot: selectEvidence(chart, category),
        corpusVersion: CORPUS_VERSION,
        question,
        category,
        place,
        createdAt: new Date().toISOString(),
        chart,
        comparison,
        consultation: { ...matterRecord, mode: input.castMode ?? "standard" },
      };
      const previous = reports.find(
        (r) =>
          r.chart.input &&
          r.chart.input.castMode !== "living" &&
          realPeriod(r.chart) === realPeriod(chart) &&
          hasEquivalentChart(r.chart, chart),
      );
      if (input.castMode !== "living" && previous) {
        setPending({ draft, previous });
        setError("");
      } else finish(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法排盘，请检查输入。");
    }
  }
  function onManual(
    input: ManualInput,
    question: string,
    categoryChoice: CategoryChoice,
  ) {
    try {
      if (question.length < 4) throw new Error("请填写至少四个字的课例说明。");
      const chart = castManual(input);
      const intent = localIntent(question, categoryChoice);
      const category = intent.category;
      finish({
        schemaVersion: 2,
        id: crypto.randomUUID(),
        categoryChoice,
        intent,
        assessments: assessRules(chart, category),
        evidenceSnapshot: selectEvidence(chart, category),
        corpusVersion: CORPUS_VERSION,
        question,
        category,
        place: "古课复核",
        createdAt: new Date().toISOString(),
        chart,
        consultation: { mode: "manual", matterId: crypto.randomUUID() },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "请检查人工课例输入。");
    }
  }
  function reuse(base: Report, input: ContinueInput): string | void {
    try {
      if (input.question.length < 4)
        throw new Error("请至少用四个字描述新事情。");
      const matter = resolveMatter(input.question, input.matter, reports);
      const chart = withPersonalContext(base.chart, input.natal, input.annual);
      const intent = localIntent(input.question, input.category);
      finish({
        schemaVersion: 2,
        id: crypto.randomUUID(),
        question: input.question,
        categoryChoice: input.category,
        category: intent.category,
        intent,
        createdAt: new Date().toISOString(),
        place: base.place,
        chart,
        consultation: {
          ...matter,
          mode: "reuse",
          sourceChartReportId: base.id,
        },
        assessments: assessRules(chart, intent.category),
        evidenceSnapshot: selectEvidence(chart, intent.category),
        corpusVersion: CORPUS_VERSION,
      });
    } catch (e) {
      return e instanceof Error ? e.message : "无法续问，请核对新问题。";
    }
  }
  const resultRoute = route === "/result" || route.startsWith("/result/");
  const home = route === "/" || route === "";
  return (
    <div className={`app-shell ${home ? "home-shell" : ""}`}>
      <div className="scene-background" aria-hidden="true" />
      <header className="site-header">
        <a className="brand" href="#/" aria-label="观象 · 大六壬，返回起课">
          <Seal />
          <span>观象</span>
          <small>大六壬</small>
        </a>
        <button
          className="mobile-menu icon-button"
          aria-label={menu ? "关闭导航" : "打开导航"}
          onClick={() => setMenu((v) => !v)}
        >
          {menu ? <X /> : <Menu />}
        </button>
        <nav
          className={menu ? "navigation open" : "navigation"}
          aria-label="主导航"
        >
          <a href="#/" className={home || resultRoute ? "active" : ""}>
            起课
          </a>
          <a
            href="#/sources"
            className={route.startsWith("/sources") ? "active" : ""}
          >
            典籍
          </a>
          <a href="#/rules" className={route === "/rules" ? "active" : ""}>
            规则
          </a>
          <a
            href="#/history"
            className={`history-link ${route === "/history" ? "active" : ""}`}
          >
            <FileClock size={19} />
            本机记录
          </a>
        </nav>
      </header>
      <main id="main-content">
        {home ? (
          <div className="home-layout page-width">
            <section className="cast-column">
              <h1>
                观天地之象，
                <br className="heading-break" />
                明进退之机。
              </h1>
              <p className="hero-copy">
                以真太阳时起课，循古法推演。
                <br />
                古籍原文可溯，取法有据，知来处，亦见本心。
              </p>
              <CastForm
                onCast={(...args) => {
                  setPending(null);
                  onCast(...args);
                }}
                onManual={onManual}
                onEdit={() => setPending(null)}
                error={error}
                reports={reports}
                requestedMode={requestedMode}
              />
              {pending && (
                <section
                  className="same-chart-notice"
                  role="alert"
                  aria-label="同一时辰课盘提示"
                >
                  <h2>此时辰已有相同课盘</h2>
                  <p>
                    日干支、月将和占时相同，继续正时起课会得到相同天地盘。不同的新事情可以选择：
                  </p>
                  <div className="repeat-actions">
                    <button
                      className="outline-button"
                      onClick={() => {
                        setRequestedMode({
                          mode: "living",
                          revision: Date.now(),
                        });
                        setPending(null);
                        document.querySelector(".mode-picker")?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                    >
                      改用报数活时
                    </button>
                    <button
                      className="outline-button"
                      onClick={() => {
                        const chart = withPersonalContext(
                          pending.previous.chart,
                          pending.draft.chart.input?.natalBranch,
                          pending.draft.chart.input?.annualBranch,
                        );
                        finish({
                          ...pending.draft,
                          chart,
                          place: pending.previous.place,
                          comparison: undefined,
                          consultation: {
                            ...pending.draft.consultation!,
                            mode: "reuse",
                            sourceChartReportId: pending.previous.id,
                          },
                          assessments: assessRules(
                            chart,
                            pending.draft.category,
                          ),
                          evidenceSnapshot: selectEvidence(
                            chart,
                            pending.draft.category,
                          ),
                        });
                      }}
                    >
                      沿用已有课盘
                    </button>
                    <button
                      className="text-button"
                      onClick={() => finish(pending.draft)}
                    >
                      仍用正时起课
                    </button>
                  </div>
                  <p className="muted small">
                    只是提示，不锁死正时按钮。同一件事不要重复占问；换模式不保证不同或更好的结果。
                  </p>
                </section>
              )}
            </section>
            <aside className="observatory">
              <Plate />
              <div className="three-steps">
                {[
                  ["1", "填写所问", "明确问题与背景"],
                  ["2", "观象起课", "依所选时间口径推演"],
                  ["3", "对照古籍", "查阅原文，综合参考"],
                ].map(([n, title, desc]) => (
                  <div key={n}>
                    <span>{n}</span>
                    <h2>{title}</h2>
                    <p>{desc}</p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        ) : resultRoute ? (
          report ? (
            <Result
              key={report.id}
              report={report}
              reports={reports}
              onContinue={(input) => reuse(report, input)}
              onUpdate={(patch) => {
                const current = reportRef.current;
                if (!current || current.id !== report.id) return;
                const updated = { ...current, ...patch };
                reportRef.current = updated;
                setReport(updated);
                try {
                  saveReport(updated);
                  setReports(readReports());
                } catch {
                  const retained = {
                    ...updated,
                    warnings: [
                      ...new Set([
                        ...(updated.warnings ?? []),
                        "本次更新未能写入本机存储，请在离开页面前导出报告保存。",
                      ]),
                    ],
                  };
                  reportRef.current = retained;
                  setReport(retained);
                }
              }}
            />
          ) : (
            <div className="page-width empty-state">
              <h1>还没有待查看的课盘。</h1>
              <p>
                此浏览器没有这份记录。报告只在起课设备保存，可到本机记录查找；分享网址不会上传你的问题或报告。
              </p>
              <a className="outline-button" href="#/">
                返回起课
              </a>
              <a className="text-link" href="#/history">
                本机记录
              </a>
            </div>
          )
        ) : route.startsWith("/sources") ? (
          <Library sourceId={route.split("/")[2]} key={route} />
        ) : route === "/rules" ? (
          <Rules />
        ) : route === "/history" ? (
          <History onOpen={finish} onChange={setReports} />
        ) : (
          <div className="page-width empty-state">
            <h1>此页未收录。</h1>
            <a href="#/">返回起课</a>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <span>
          传统术数参考 <i>·</i> <a href="#/rules">规则与版本公开</a>
        </span>
        <span className="footer-signature">观象 · 大六壬</span>
      </footer>
    </div>
  );
}
