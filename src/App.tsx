import { useEffect, useState } from "react";
import { FileClock, Menu, X } from "lucide-react";
import { cast, castManual } from "./core";
import { CORPUS_VERSION, selectEvidence } from "./data/evidence";
import type { CastInput, Category, ManualInput } from "./core/types";
import { comparedInput, type Report } from "./lib/report";
import { Plate, Seal } from "./components/Plate";
import { CastForm } from "./components/CastForm";
import { Result } from "./components/Result";
import { Library } from "./components/Library";
import { Rules } from "./components/Rules";
import { History } from "./components/History";
const getRoute = () => window.location.hash.slice(1) || "/";
export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const change = () => {
      setRoute(getRoute());
      setMenu(false);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  function finish(r: Report) {
    setReport(
      r.corpusVersion
        ? r
        : {
            ...r,
            corpusVersion: CORPUS_VERSION,
            evidenceSnapshot: selectEvidence(r.chart, r.category),
          },
    );
    setError("");
    window.location.hash = "/result";
  }
  function onCast(
    input: CastInput,
    question: string,
    category: Category,
    place: string,
  ) {
    try {
      if (question.length < 4)
        throw new Error("请至少用四个字描述你想问的事情。");
      const chart = cast(input);
      const comparison =
        input.longitude !== undefined ? cast(comparedInput(input)) : undefined;
      finish({
        schemaVersion: 1,
        question,
        category,
        place,
        createdAt: new Date().toISOString(),
        chart,
        comparison,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法排盘，请检查输入。");
    }
  }
  function onManual(input: ManualInput, question: string, category: Category) {
    try {
      if (question.length < 4) throw new Error("请填写至少四个字的课例说明。");
      finish({
        schemaVersion: 1,
        question,
        category,
        place: "古课复核",
        createdAt: new Date().toISOString(),
        chart: castManual(input),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "请检查人工课例输入。");
    }
  }
  const resultRoute = route === "/result";
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
              <CastForm onCast={onCast} onManual={onManual} error={error} />
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
              key={report.createdAt}
              report={report}
              onUpdate={(patch) =>
                setReport((r) => (r ? { ...r, ...patch } : r))
              }
            />
          ) : (
            <div className="page-width empty-state">
              <h1>还没有待查看的课盘。</h1>
              <p>未保存的课盘不会在刷新后保留，可到本机记录查找已保存报告。</p>
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
          <History onOpen={finish} />
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
