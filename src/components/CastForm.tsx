import { useEffect, useState } from "react";
import {
  ArrowRight,
  Clock3,
  LocateFixed,
  ChevronDown,
  MapPin,
} from "lucide-react";
import { BRANCHES, RULE_VERSION, STEMS } from "../core";
import type {
  Branch,
  CastInput,
  ManualInput,
  Stem,
  TimeBasis,
} from "../core/types";
import type { CategoryChoice } from "../ai/types";
import { categories, nowBeijing, type Report } from "../lib/report";
import type { MatterInput } from "../lib/consultation";
import { MatterFields } from "./MatterFields";
import { cities } from "../lib/cities";
interface Props {
  onCast: (
    input: CastInput,
    question: string,
    category: CategoryChoice,
    place: string,
    matter: MatterInput,
  ) => void;
  onManual: (
    input: ManualInput,
    question: string,
    category: CategoryChoice,
  ) => void;
  error: string;
  onEdit: () => void;
  reports: Report[];
  requestedMode?: { mode: "standard" | "living"; revision: number };
}
export function CastForm({
  onCast,
  onManual,
  onEdit,
  error,
  reports,
  requestedMode,
}: Props) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<CategoryChoice>("auto");
  const [datetime, setDatetime] = useState(nowBeijing);
  const [useNow, setUseNow] = useState(true);
  const [mode, setMode] = useState<"standard" | "living">("standard");
  const [number, setNumber] = useState("");
  const [matter, setMatter] = useState<MatterInput>({ acknowledged: false });
  useEffect(() => {
    if (requestedMode) setMode(requestedMode.mode);
  }, [requestedMode]);
  const [basis, setBasis] = useState<TimeBasis>("solar");
  const [city, setCity] = useState("");
  const [lon, setLon] = useState("");
  const [lat, setLat] = useState("");
  const [manualCoords, setManualCoords] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [natal, setNatal] = useState("");
  const [annual, setAnnual] = useState("");
  const [manual, setManual] = useState(false);
  const [dayStem, setDayStem] = useState<Stem>("甲");
  const [dayBranch, setDayBranch] = useState<Branch>("子");
  const [monthGeneral, setMonthGeneral] = useState<Branch>("亥");
  const [hourBranch, setHourBranch] = useState<Branch>("子");
  const [daytime, setDaytime] = useState(true);
  function chooseCity(name: string) {
    setCity(name);
    const found = cities.find((c) => c.name === name);
    if (found) {
      setLon(String(found.longitude));
      setLat(String(found.latitude));
      setLocationMessage("城市中心参考坐标；可手动调整到实际地点。");
    } else {
      setLon("");
      setLat("");
      setLocationMessage("");
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocationMessage("当前浏览器不支持定位，请选择城市或填写经纬度。");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLon(p.coords.longitude.toFixed(5));
        setLat(p.coords.latitude.toFixed(5));
        setCity("");
        setManualCoords(true);
        setLocationMessage(
          `使用本次定位，误差约 ${Math.round(p.coords.accuracy)} 米。`,
        );
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationMessage("未取得定位权限，请选择城市或手动填写经纬度。");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }
  const branchSelect = (
    value: string,
    change: (v: string) => void,
    label: string,
  ) => (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => change(e.target.value)}>
        <option value="">未提供</option>
        {BRANCHES.map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      className="cast-form"
      onChangeCapture={onEdit}
      onSubmit={(e) => {
        e.preventDefault();
        if (manual) {
          onManual(
            {
              dayStem,
              dayBranch,
              monthGeneral,
              hourBranch,
              daytime,
              natalBranch: (natal as Branch) || undefined,
              annualBranch: (annual as Branch) || undefined,
            },
            question.trim(),
            category,
          );
        } else {
          onCast(
            {
              datetime: useNow ? nowBeijing() : datetime,
              castMode: mode,
              ...(mode === "living" ? { livingNumber: Number(number) } : {}),
              timeBasis: basis,
              longitude: lon === "" ? undefined : Number(lon),
              latitude: lat === "" ? undefined : Number(lat),
              natalBranch: (natal as Branch) || undefined,
              annualBranch: (annual as Branch) || undefined,
              ruleVersion: RULE_VERSION,
            },
            question.trim(),
            category,
            city || (lon !== "" ? "自定坐标" : "未提供地点"),
            matter,
          );
        }
      }}
    >
      <label htmlFor="question" className="question-label">
        此刻，你想问什么？
      </label>
      <div className="textarea-wrap">
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="描述你所关心的事情，以及目前的处境……"
          required
          minLength={4}
          maxLength={1200}
          rows={3}
        />
        <span className="character-count">{question.length} / 1200</span>
      </div>
      <div className="form-row category-row">
        <span className="row-label" id="category-label">
          问题类别
        </span>
        <div
          role="group"
          aria-labelledby="category-label"
          className="categories"
        >
          {[{ id: "auto" as const, label: "自动识别" }, ...categories].map(
            (c) => (
              <button
                key={c.id}
                type="button"
                className={category === c.id ? "choice active" : "choice"}
                onClick={() => setCategory(c.id)}
                aria-pressed={category === c.id}
              >
                {c.label}
              </button>
            ),
          )}
        </div>
      </div>
      {!manual && (
        <>
          <fieldset className="mode-picker">
            <legend>起课方式</legend>
            <div className="mode-options">
              <button
                type="button"
                className={
                  mode === "standard" ? "mode-option active" : "mode-option"
                }
                aria-pressed={mode === "standard"}
                onClick={() => setMode("standard")}
              >
                <b>正时起课</b>
                <span>按真实时间 · 默认</span>
              </button>
              <button
                type="button"
                className={
                  mode === "living" ? "mode-option active" : "mode-option"
                }
                aria-pressed={mode === "living"}
                onClick={() => setMode("living")}
              >
                <b>报数活时</b>
                <span>同辰不同新事 · 备选</span>
              </button>
            </div>
            {mode === "living" ? (
              <div className="living-controls">
                <label className="field">
                  心定一数（1—12）
                  <select
                    required
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                  >
                    <option value="">请先确定所问，再选一个数字</option>
                    {BRANCHES.map((b, i) => (
                      <option key={b} value={i + 1}>
                        {i + 1} → {b}时
                      </option>
                    ))}
                  </select>
                </label>
                <p className="field-help">
                  只替换虚拟占时，日干支、月将仍取真实历法；昼夜天将按真实占时。此为本站明确采用的备选口径，不宣称唯一古法。同数可能同盘，不为求吉反复改数。
                </p>
              </div>
            ) : (
              <p className="field-help">
                同一时辰不同问题可能同盘。起课后可在高级选项中沿用本盘续问新事情；问题文字不会随机改变四课三传。
              </p>
            )}
          </fieldset>
          <div className="form-row">
            <label className="row-label" htmlFor="datetime">
              起课时间 <small>北京时间</small>
            </label>
            <div className="date-controls">
              <input
                id="datetime"
                aria-label="起课时间（北京时间）"
                type="datetime-local"
                step="1"
                min="2000-01-01T00:00"
                max="2100-12-31T23:59:59"
                value={datetime}
                onChange={(e) => {
                  setDatetime(e.target.value);
                  setUseNow(false);
                }}
                required
              />
              <button
                type="button"
                className="outline-button now-button"
                onClick={() => {
                  setDatetime(nowBeijing());
                  setUseNow(true);
                }}
              >
                <Clock3 size={16} />
                <span>此刻</span>
              </button>
            </div>
          </div>
          <p className="field-help">
            {useNow
              ? "提交时自动取最新北京时间；也可手动指定时间复核。"
              : "当前使用手动指定的北京时间；点「此刻」恢复实时起课。"}
          </p>
          <div className="form-row location-row">
            <label className="row-label" htmlFor="city">
              所在地
            </label>
            <div className="location-controls">
              <div className="location-select">
                <MapPin size={16} />
                <select
                  id="city"
                  value={city}
                  onChange={(e) => chooseCity(e.target.value)}
                >
                  <option value="">选择城市</option>
                  {cities.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="使用我的位置"
                title="使用我的位置"
                onClick={locate}
                disabled={locating}
              >
                <LocateFixed size={18} />
              </button>
              <button
                type="button"
                className="text-button coordinates-toggle"
                onClick={() => setManualCoords((v) => !v)}
                aria-expanded={manualCoords}
              >
                经纬度 <ChevronDown size={14} />
              </button>
            </div>
          </div>
          {manualCoords && (
            <div className="coordinates-fields">
              <label className="field">
                经度（东经为正）
                <input
                  aria-label="经度"
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={lon}
                  onChange={(e) => {
                    setLon(e.target.value);
                    setCity("");
                  }}
                  placeholder="例如 116.3972"
                  required={basis === "solar"}
                />
              </label>
              <label className="field">
                纬度（北纬为正）
                <input
                  aria-label="纬度"
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={lat}
                  onChange={(e) => {
                    setLat(e.target.value);
                    setCity("");
                  }}
                  placeholder="例如 39.9075"
                />
              </label>
            </div>
          )}
          <p className="location-caption" aria-live="polite">
            {locating
              ? "正在获取位置…"
              : locationMessage ||
                (lon
                  ? `东经 ${lon}° · 北纬 ${lat}°`
                  : "真太阳时需所在地；地点仅用于排盘。")}
          </p>
          <div className="form-row">
            <span className="row-label" id="time-basis">
              时间口径
            </span>
            <div
              className="segmented"
              role="group"
              aria-labelledby="time-basis"
            >
              <button
                type="button"
                aria-pressed={basis === "solar"}
                className={basis === "solar" ? "active" : ""}
                onClick={() => setBasis("solar")}
              >
                真太阳时
              </button>
              <button
                type="button"
                aria-pressed={basis === "standard"}
                className={basis === "standard" ? "active" : ""}
                onClick={() => setBasis("standard")}
              >
                标准时
              </button>
            </div>
          </div>
          <p className="field-help">
            {basis === "solar"
              ? "按经度与均时差校正，保留标准时课盘供对照。"
              : "使用北京时间 UTC+8；有坐标时同时提供真太阳时对照。"}
          </p>
        </>
      )}
      <details className="advanced">
        <summary>
          更多起课选项 <ChevronDown size={14} />
        </summary>
        <div className="advanced-body">
          <div className="coordinates-fields">
            {branchSelect(natal, setNatal, "本命地支（可选）")}
            {branchSelect(annual, setAnnual, "行年地支（可选）")}
          </div>
          <p className="muted small">
            仅填写已知年命，不提供时不使用相关断语。
          </p>
          <p className="muted small">
            本盘续问在结果页的高级选项中。古籍次客移时、移将存在异说，尚未完成版本校勘，暂不提供自动算法。
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={manual}
              onChange={(e) => setManual(e.target.checked)}
            />
            古课复核：人工指定干支、月将与占时
          </label>
          {manual && (
            <div className="manual-fields">
              <label className="field">
                日干
                <select
                  value={dayStem}
                  onChange={(e) => setDayStem(e.target.value as Stem)}
                >
                  {STEMS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                日支
                <select
                  value={dayBranch}
                  onChange={(e) => setDayBranch(e.target.value as Branch)}
                >
                  {BRANCHES.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                月将
                <select
                  value={monthGeneral}
                  onChange={(e) => setMonthGeneral(e.target.value as Branch)}
                >
                  {BRANCHES.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                占时
                <select
                  value={hourBranch}
                  onChange={(e) => setHourBranch(e.target.value as Branch)}
                >
                  {BRANCHES.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                昼夜
                <select
                  value={daytime ? "day" : "night"}
                  onChange={(e) => setDaytime(e.target.value === "day")}
                >
                  <option value="day">昼占</option>
                  <option value="night">夜占</option>
                </select>
              </label>
            </div>
          )}
        </div>
      </details>
      {!manual && (
        <MatterFields value={matter} onChange={setMatter} reports={reports} />
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button cast-submit" type="submit">
        {manual ? "复核此课" : "起课观象"}
        <ArrowRight size={20} />
      </button>
    </form>
  );
}
