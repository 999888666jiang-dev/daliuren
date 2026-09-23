import { useState } from "react";
import { ArrowRight, Trash2, Download } from "lucide-react";
import {
  readReports,
  removeReport,
  exportReport,
  timeText,
  type Report,
} from "../lib/report";
export function History({
  onOpen,
  onChange,
}: {
  onOpen: (r: Report) => void;
  onChange: (reports: Report[]) => void;
}) {
  const [items, setItems] = useState(readReports);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <div className="page-width history-page">
      <div className="page-heading">
        <h1>留一课，待日后回看。</h1>
        <p>仅保存在当前浏览器，不会自动上传。最多保留最近 30 份报告。</p>
      </div>
      {error && <p className="error-message">{error}</p>}
      {!items.length ? (
        <div className="empty-state">
          <p>这里还没有保存的课。</p>
          <a href="#/" className="outline-button">
            起一课 <ArrowRight size={16} />
          </a>
        </div>
      ) : (
        <div className="history-list">
          {items.map((r) => (
            <article key={r.id}>
              <div>
                <span className="small muted">
                  {r.chart.time ? timeText(r.chart.time.beijing) : "古课复核"} ·{" "}
                  {r.chart.method.name}
                </span>
                <h2>
                  <button onClick={() => onOpen(r)}>{r.question}</button>
                </h2>
                <p>
                  {r.chart.day.stem}
                  {r.chart.day.branch}日 · 三传{" "}
                  {r.chart.transmissions.map((t) => t.branch).join(" → ")}
                </p>
              </div>
              <div className="history-actions">
                <button
                  className="icon-button"
                  onClick={() => exportReport(r)}
                  aria-label="导出这份报告"
                >
                  <Download size={17} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setPending(r.id)}
                  aria-label="删除这份本机报告"
                >
                  <Trash2 size={17} />
                </button>
                <button className="text-button" onClick={() => onOpen(r)}>
                  查看 <ArrowRight size={16} />
                </button>
                {pending === r.id && (
                  <div className="delete-confirm">
                    <span>删除这份本机记录？</span>
                    <button
                      onClick={() => {
                        try {
                          removeReport(r.id);
                          const remaining = readReports();
                          setItems(remaining);
                          onChange(remaining);
                          setPending(null);
                        } catch {
                          setError("无法修改本机存储。");
                        }
                      }}
                    >
                      删除
                    </button>
                    <button onClick={() => setPending(null)}>取消</button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
