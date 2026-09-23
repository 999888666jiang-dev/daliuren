import { useState } from "react";
import { ArrowLeft, Search, ExternalLink } from "lucide-react";
import { bibliography, evidence } from "../data/evidence";
import { readingEvidence } from "../data/reading-evidence";
import { bifaIndex } from "../data/bifa-index";
import { Evidence, imageHref } from "./Evidence";
export function Library({ sourceId }: { sourceId?: string }) {
  const catalog = [
    ...new Map(
      [...evidence, ...readingEvidence].map((item) => [item.id, item]),
    ).values(),
  ];
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"quotes" | "bifa">("quotes");
  const selected = sourceId ? catalog.find((e) => e.id === sourceId) : null;
  const found = catalog.filter((e) =>
    `${e.title}${e.quote}${e.work}`.includes(query.trim()),
  );
  if (sourceId)
    return (
      <div className="page-width library-page source-detail">
        <a className="back-link" href="#/sources">
          <ArrowLeft size={15} />
          返回典籍
        </a>
        <h1>原文有出处</h1>
        {selected ? (
          <Evidence record={selected} key={sourceId} expanded />
        ) : (
          <p className="notice">
            该依据尚未收录为已核引文。它可能是历法资料、产品约定或待校条文，请参阅
            <a href="#/rules">规则说明</a>；本页不补造原文。
          </p>
        )}
      </div>
    );
  return (
    <div className="page-width library-page">
      <div className="page-heading">
        <h1>典籍有据，字句可溯。</h1>
        <p>从原书影像到可用条文，每一步都保留来处。</p>
      </div>
      <div className="library-layout">
        <aside className="bibliography">
          <h2>底本与参考书目</h2>
          {bibliography.map((b) => (
            <article key={b.id}>
              <div className="book-status">{b.status}</div>
              <h3>《{b.title}》</h3>
              <p className="book-edition">{b.edition}</p>
              <p>{b.description}</p>
              <a href={b.url} target="_blank" rel="noreferrer">
                查看来源 <ExternalLink size={12} />
              </a>
            </article>
          ))}
          <p className="muted small">
            书目存在不等于全书已校勘。八字、风水书目不参与本工具的六壬计算。
          </p>
        </aside>
        <section className="library-text">
          <div className="section-heading">
            <h2>{tab === "quotes" ? "已核原文" : "毕法百则索引"}</h2>
            <span className="muted small">
              {tab === "quotes"
                ? `${catalog.filter((e) => e.verification === "verified").length} 条可回查`
                : "100 条题名 · 逐项标注"}
            </span>
          </div>
          <div className="library-tabs" role="group" aria-label="典籍视图">
            <button
              className={tab === "quotes" ? "active" : ""}
              onClick={() => setTab("quotes")}
            >
              已核条文
            </button>
            <button
              className={tab === "bifa" ? "active" : ""}
              onClick={() => setTab("bifa")}
            >
              毕法百则
            </button>
          </div>
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="搜索古籍原文"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索条文、课法或书名"
            />
          </label>
          {tab === "quotes" ? (
            found.length ? (
              found.map((e) => <Evidence key={e.id} record={e} />)
            ) : (
              <p className="empty-state">
                暂无匹配的已收录条文。可换一个关键词查找。
              </p>
            )
          ) : (
            <>
              <p className="index-help">
                题名校对、正文校对和自动判断是不同进度。只有明确列出的已核摘句参与解读。
              </p>
              <div className="bifa-index">
                {bifaIndex
                  .filter((e) => `${e.number}${e.title}`.includes(query.trim()))
                  .map((e) => (
                    <details key={e.id}>
                      <summary>
                        <span>{String(e.number).padStart(2, "0")}</span>
                        <strong>{e.title}</strong>
                        <small>
                          {e.implemented
                            ? "部分条件已实现"
                            : e.titleVerification === "pending"
                              ? "题名待核"
                              : "正文待校"}
                        </small>
                      </summary>
                      <div>
                        <p>{e.note}</p>
                        <p>{e.page}</p>
                        <a
                          className="text-link"
                          href={imageHref(e.imageUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          查看题名原页 ↗
                        </a>
                        {e.evidenceIds.map((id) => (
                          <a
                            key={id}
                            className="text-link"
                            href={`#/sources/${id}`}
                          >
                            已核摘句 ↗
                          </a>
                        ))}
                      </div>
                    </details>
                  ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
