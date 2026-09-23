import type { Branch, Stem } from "./types";

export const BRANCHES: readonly Branch[] = [
  "子",
  "丑",
  "寅",
  "卯",
  "辰",
  "巳",
  "午",
  "未",
  "申",
  "酉",
  "戌",
  "亥",
];
export const STEMS: readonly Stem[] = [
  "甲",
  "乙",
  "丙",
  "丁",
  "戊",
  "己",
  "庚",
  "辛",
  "壬",
  "癸",
];
export const RULE_VERSION = "daquan-v1.0.0";
export const ENGINE_VERSION = "0.2.0";
export const mod = (n: number, size = 12): number => ((n % size) + size) % size;
export const branch = (n: number): Branch => BRANCHES[mod(n)];
export const bi = (b: Branch): number => BRANCHES.indexOf(b);
export const si = (s: Stem): number => STEMS.indexOf(s);

// Element order: 木、火、土、金、水. 生 advances one; 克 advances two.
export const BRANCH_ELEMENTS = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4] as const;
export const STEM_PALACES = [2, 4, 5, 7, 5, 7, 8, 10, 11, 1] as const;
export const controls = (a: number, b: number): boolean => mod(a + 2, 5) === b;
export const generates = (a: number, b: number): boolean => mod(a + 1, 5) === b;
export const ELEMENT_NAMES = ["木", "火", "土", "金", "水"] as const;
export const PUNISHMENT = [3, 10, 5, 0, 4, 8, 6, 1, 2, 9, 7, 11] as const;
export const GENERAL_ORDER = [
  "贵人",
  "螣蛇",
  "朱雀",
  "六合",
  "勾陈",
  "青龙",
  "天空",
  "白虎",
  "太常",
  "玄武",
  "太阴",
  "天后",
] as const;
export const DAY_NOBLE = [1, 0, 11, 11, 1, 0, 1, 6, 5, 5] as const;
export const NIGHT_NOBLE = [7, 8, 9, 9, 7, 8, 7, 2, 3, 3] as const;
export const QI_GENERAL: Record<string, Branch> = {
  雨水: "亥",
  春分: "戌",
  谷雨: "酉",
  小满: "申",
  夏至: "未",
  大暑: "午",
  处暑: "巳",
  秋分: "辰",
  霜降: "卯",
  小雪: "寅",
  冬至: "丑",
  大寒: "子",
};
