import { Body, HourAngle, Observer } from "astronomy-engine";
import { Solar } from "lunar-typescript";
import type { Branch, CastInput, Stem, TimeContext, TraceStep } from "./types";
import {
  BRANCHES,
  QI_GENERAL,
  RULE_VERSION,
  STEMS,
  branch,
  mod,
} from "./constants";

const MINUTE = 60_000;
const DAY = 86_400_000;
const BEIJING_OFFSET = 480 * MINUTE;

export interface CalendarResult {
  time: TimeContext;
  dayStem: Stem;
  dayBranch: Branch;
  monthGeneral: Branch;
  monthBranch: Branch;
  hourBranch: Branch;
  daytime: boolean;
  trace: TraceStep[];
}

/** Civil clock fields carried in UTC slots. Never use browser-local Date fields. */
function civilSolar(civil: Date): Solar {
  return Solar.fromYmdHms(
    civil.getUTCFullYear(),
    civil.getUTCMonth() + 1,
    civil.getUTCDate(),
    civil.getUTCHours(),
    civil.getUTCMinutes(),
    civil.getUTCSeconds(),
  );
}

function display(civil: Date): string {
  return civil.toISOString().slice(0, 19).replace("T", " ");
}

export function validateBranch(value: unknown, label: string): void {
  if (value !== undefined && !BRANCHES.includes(value as Branch))
    throw new Error(`${label}必须为十二地支之一`);
}

export function parseBeijing(input: CastInput): { utc: Date; civil: Date } {
  if (!input || typeof input.datetime !== "string")
    throw new Error("请填写北京时间");
  if (input.timeBasis !== "solar" && input.timeBasis !== "standard")
    throw new Error("请选择真太阳时或标准时");
  if (input.ruleVersion !== undefined && input.ruleVersion !== RULE_VERSION)
    throw new Error("不支持此规则版本，请刷新页面");
  // Reject offsets, Date's permissive normalisation, and browser-local time parsing.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    input.datetime,
  );
  if (!match)
    throw new Error("时间格式须为 YYYY-MM-DDTHH:mm[:ss]，按北京时间填写");
  const [year, month, day, hour, minute, second] = match
    .slice(1)
    .map((v) => Number(v ?? 0));
  if (year < 2000 || year > 2100)
    throw new Error("支持的占时范围为公历 2000—2100 年");
  const civil = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    civil.getUTCFullYear() !== year ||
    civil.getUTCMonth() + 1 !== month ||
    civil.getUTCDate() !== day ||
    civil.getUTCHours() !== hour ||
    civil.getUTCMinutes() !== minute ||
    civil.getUTCSeconds() !== second
  )
    throw new Error("日期或时间不存在");
  if (
    input.longitude !== undefined &&
    (typeof input.longitude !== "number" ||
      !Number.isFinite(input.longitude) ||
      input.longitude < -180 ||
      input.longitude > 180)
  )
    throw new Error("经度须在 -180° 至 180° 之间");
  if (
    input.latitude !== undefined &&
    (typeof input.latitude !== "number" ||
      !Number.isFinite(input.latitude) ||
      input.latitude < -90 ||
      input.latitude > 90)
  )
    throw new Error("纬度须在 -90° 至 90° 之间");
  if (input.timeBasis === "solar" && input.longitude === undefined)
    throw new Error("真太阳时需要占事地点的经度");
  validateBranch(input.natalBranch, "本命");
  validateBranch(input.annualBranch, "行年");
  return { civil, utc: new Date(civil.getTime() - BEIJING_OFFSET) };
}

/**
 * Apparent solar time = solar hour angle + 12 hours.
 * The hour angle wraps daily. Unwrap its date around local MEAN solar time,
 * not Beijing time, so longitudes near the date line retain the right day.
 */
export function solarClock(
  utc: Date,
  longitude: number,
  latitude = 0,
): {
  civil: Date;
  equationMinutes: number;
  longitudeMinutes: number;
  offsetMinutes: number;
} {
  const observer = new Observer(latitude, longitude, 0);
  const apparentHours = mod(HourAngle(Body.Sun, utc, observer) + 12, 24);
  const meanMs = utc.getTime() + longitude * 4 * MINUTE;
  const meanMinutes = mod(meanMs, DAY) / MINUTE;
  const equationMinutes =
    mod(apparentHours * 60 - meanMinutes + 720, 1440) - 720;
  const longitudeMinutes = 4 * (longitude - 120);
  return {
    civil: new Date(meanMs + equationMinutes * MINUTE),
    equationMinutes,
    longitudeMinutes,
    offsetMinutes: longitudeMinutes + equationMinutes,
  };
}

export function calendar(input: CastInput): CalendarResult {
  const { utc, civil } = parseBeijing(input);
  const apparent =
    input.longitude === undefined
      ? null
      : solarClock(utc, input.longitude, input.latitude ?? 0);
  const selected = input.timeBasis === "solar" ? apparent!.civil : civil;
  // Terms refer to the REAL instant, independent of the chosen local clock.
  const actualLunar = civilSolar(civil).getLunar();
  const selectedLunar = civilSolar(selected).getLunar();
  const qi = actualLunar.getPrevQi(false);
  const monthGeneral = QI_GENERAL[qi.getName()];
  if (!monthGeneral)
    throw new Error(`历法返回了无法识别的中气：${qi.getName()}`);
  const ganzhi = selectedLunar.getDayInGanZhiExact(); // Explicitly the 23:00 sect.
  const dayStem = ganzhi[0] as Stem;
  const dayBranch = ganzhi[1] as Branch;
  if (!STEMS.includes(dayStem) || !BRANCHES.includes(dayBranch))
    throw new Error("干支日计算失败");
  const monthBranch = actualLunar.getMonthZhiExact() as Branch;
  const hourIndex = Math.floor((selected.getUTCHours() + 1) / 2) % 12;
  const hourBranch = branch(hourIndex);
  const daytime = hourIndex >= 3 && hourIndex <= 8;
  const selectedMinute = mod(selected.getTime(), DAY) / MINUTE;
  const distanceInShichen = mod(selectedMinute + 60, 120);
  const nearHourBoundary =
    Math.min(distanceInShichen, 120 - distanceInShichen) <= 2;
  const nearTermBoundary = Object.values(actualLunar.getJieQiTable()).some(
    (term) => {
      const termMs = Date.UTC(
        term.getYear(),
        term.getMonth() - 1,
        term.getDay(),
        term.getHour(),
        term.getMinute(),
        term.getSecond(),
      );
      return Math.abs(termMs - civil.getTime()) <= 2 * MINUTE;
    },
  );
  const time: TimeContext = {
    utcIso: utc.toISOString(),
    beijing: display(civil),
    solar: apparent ? display(apparent.civil) : null,
    selected: display(selected),
    timeBasis: input.timeBasis,
    longitudeCorrectionMinutes: apparent?.longitudeMinutes ?? null,
    equationOfTimeMinutes: apparent?.equationMinutes ?? null,
    offsetMinutes: apparent?.offsetMinutes ?? null,
    nearBoundary: nearHourBoundary || nearTermBoundary,
  };
  const trace: TraceStep[] = [
    {
      id: "calendar-time",
      title: "统一时间基准",
      detail: `输入北京时间 ${display(civil)}；真实瞬间 ${utc.toISOString()}。${apparent ? `经度修正 ${apparent.longitudeMinutes.toFixed(3)} 分，均时差 ${apparent.equationMinutes.toFixed(3)} 分，真太阳时 ${display(apparent.civil)}。` : ""}本课采用${input.timeBasis === "solar" ? "真太阳时" : "北京时间标准时"}。`,
      sourceIds: [],
    },
    {
      id: "calendar-day",
      title: "定干支日、占时与昼夜",
      detail: `按所选时钟 23:00 子初换日，得 ${dayStem}${dayBranch}日、${hourBranch}时；卯至申为昼、酉至寅为夜，本课取${daytime ? "昼" : "夜"}贵。23:00 换日为本版本约定；昼夜界见《御定六壬直指》已核影印旁证。`,
      sourceIds: ["zhizhi-daynight"],
    },
    {
      id: "calendar-general",
      title: "中气换将，节令定月建",
      detail: `真实瞬间最近已交中气为 ${qi.getName()}（北京时间 ${qi.getSolar().toYmdHms()}），故用 ${monthGeneral}将；节令月建 ${monthBranch}。真太阳时修正不移动交节的真实瞬间。`,
      sourceIds: [],
    },
  ];
  return {
    time,
    dayStem,
    dayBranch,
    monthGeneral,
    monthBranch,
    hourBranch,
    daytime,
    trace,
  };
}
