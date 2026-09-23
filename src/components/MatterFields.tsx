import type { MatterInput } from "../lib/consultation";
import type { Report } from "../lib/report";

export function MatterFields({
  value,
  onChange,
  reports,
}: {
  value: MatterInput;
  onChange: (value: MatterInput) => void;
  reports: Report[];
}) {
  return (
    <div className="matter-fields">
      {reports.length > 0 && (
        <label className="field">
          这次所问
          <select
            aria-label="这次所问"
            value={value.previousReportId ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                previousReportId: e.target.value || undefined,
                changeNote: "",
                acknowledged: false,
              })
            }
          >
            <option value="">不同的新事情</option>
            {reports.map((r) => (
              <option value={r.id} key={r.id}>
                原事情有新变化：{r.question.slice(0, 45)}
              </option>
            ))}
          </select>
        </label>
      )}
      {value.previousReportId && (
        <label className="field">
          已发生的现实变化
          <textarea
            rows={2}
            value={value.changeNote ?? ""}
            required
            minLength={6}
            maxLength={500}
            placeholder="例如：对方今天发来了正式报价，与上次条件不同……"
            onChange={(e) => onChange({ ...value, changeNote: e.target.value })}
          />
        </label>
      )}
      <label className="check-label matter-ack">
        <input
          type="checkbox"
          required
          checked={value.acknowledged}
          onChange={(e) =>
            onChange({ ...value, acknowledged: e.target.checked })
          }
        />
        <span>
          确认是不同的新事，或已有实际变化；不为同一件未变化的事反复起课。
        </span>
      </label>
      <p className="muted small">
        问题和报告保存在本设备，最多 30
        份；不跨设备同步。相同文字会检查，改写同一件事仍需自己遵守一事不二占。
      </p>
    </div>
  );
}
