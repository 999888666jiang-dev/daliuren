import { useState } from "react";
import { BookOpen, ExternalLink, ChevronDown } from "lucide-react";
import type { EvidenceRecord } from "../core/types";
export const imageHref = (path: string) =>
  /^https?:\/\//.test(path)
    ? path
    : import.meta.env.BASE_URL + path.replace(/^\//, "");
export function Evidence({
  record,
  expanded = false,
}: {
  record: EvidenceRecord;
  expanded?: boolean;
}) {
  const [showImage, setShowImage] = useState(expanded);
  return (
    <article className="evidence-record" id={record.id}>
      <div className="evidence-heading">
        <span className="source-label">
          <BookOpen size={14} />《{record.work}》
        </span>
        <span className="verification">
          {record.verification === "verified" ? "原页已核" : "待校录"}
        </span>
      </div>
      <h3>{record.title}</h3>
      {record.verification === "verified" ? (
        <blockquote>{record.quote}</blockquote>
      ) : (
        <p className="muted">此条尚未完成原页校核，不参与自动解读。</p>
      )}
      <p className="source-location">
        {record.volume} · {record.page}
      </p>
      <div className="source-actions">
        <button
          type="button"
          className="text-button"
          onClick={() => setShowImage((v) => !v)}
          aria-expanded={showImage}
        >
          对照影印原页 <ChevronDown size={14} />
        </button>
        <a href={record.sourceUrl} target="_blank" rel="noreferrer">
          来源档案 <ExternalLink size={13} />
        </a>
      </div>
      {showImage && (
        <div className="source-image">
          <a href={imageHref(record.imageUrl)} target="_blank" rel="noreferrer">
            <img
              src={imageHref(record.imageUrl)}
              alt={`${record.work} ${record.volume} ${record.page}，点击查看完整原页`}
              loading="lazy"
            />
          </a>
          <p>{record.edition}</p>
          <p>{record.reviewNote}</p>
        </div>
      )}
    </article>
  );
}
