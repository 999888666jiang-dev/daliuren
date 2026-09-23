import type { ReadingSource } from "../ai/reading-types";
import { evidence } from "./evidence";

const cuiyan = (
  id: string,
  title: string,
  quote: string,
  page: number,
  volume = "卷一 · 立课",
): ReadingSource => ({
  id,
  title,
  quote,
  work: "六壬粹言",
  edition: "国家图书馆 NCL-06574 号钞本",
  volume,
  page: `PDF 第 ${page} 页`,
  sourceUrl:
    "https://commons.wikimedia.org/wiki/File:NCL-06574_%E5%85%AD%E5%A3%AC%E7%B2%B9%E8%A8%80.pdf",
  imageUrl: `sources/cuiyan-${String(page).padStart(3, "0")}.jpg`,
  verification: "verified",
  reviewNote:
    "逐字对照 NCL-06574 原页影像核读此摘句，标点为今加。只核本条所摘范围；天将条文后续另有旺相、休囚、生克等条件，未将这些条件省略为无条件吉凶。",
  ruleIds: [id],
  clauses: [{ id: `${id}:quote`, text: quote }],
});

/** Exact clauses are client-owned snapshots, never model-authored quotations. */
export const readingEvidence: ReadingSource[] = [
  ...evidence
    .filter((source) => source.verification === "verified")
    .map((source) => ({
      ...source,
      ruleIds: [source.id],
      clauses: [{ id: `${source.id}:quote`, text: source.quote }],
    })),
  cuiyan(
    "cuiyan-three-stages",
    "三传的发端、转移与归结",
    "初傳為發端，中傳為轉移，末傳為歸結。",
    24,
  ),
  cuiyan(
    "cuiyan-combined-conditions",
    "三传须合看生合与空墓克冲",
    "得位祿生合等神則吉，陷空墓克沖絕等神則凶。",
    24,
  ),
  cuiyan("cuiyan-general-guiren", "贵人的田土、财帛类象", "田土財帛之事。", 42),
  cuiyan(
    "cuiyan-general-tengshe",
    "螣蛇的惊恐、怪异类象",
    "主火燭血光驚恐怪異之事。",
    42,
  ),
  cuiyan(
    "cuiyan-general-gouchen",
    "勾陈的争端、勾留类象",
    "主戰鬪詞訟爭端勾留",
    42,
  ),
  cuiyan(
    "cuiyan-general-taiyin",
    "太阴的妇女、财帛、嫁娶类象",
    "主婦女奴婢財帛嫁娶陰私之事。",
    43,
  ),
  cuiyan(
    "cuiyan-general-zhuque",
    "朱雀的文书、消息类象",
    "主文書勅命消息口舌詞訟之事。",
    42,
  ),
  cuiyan(
    "cuiyan-general-liuhe",
    "六合的和合、交易类象",
    "主和合交易婚姻子孫朋友之事。",
    42,
  ),
  cuiyan(
    "cuiyan-general-qinglong",
    "青龙的官府、财帛、喜庆类象",
    "主官府升遷書契財帛穀米婚姻喜慶之事。",
    43,
  ),
  cuiyan(
    "cuiyan-general-tianhou",
    "天后的庆赏、恩泽类象",
    "主慶賞恩澤陰私之事。",
    43,
  ),
  cuiyan(
    "cuiyan-general-xuanwu",
    "玄武的亡失、奸诈类象",
    "主盜賊亡失爭鬪奸詐之事。",
    43,
  ),
  cuiyan(
    "cuiyan-general-taichang",
    "太常的印绶、饮食、婚姻类象",
    "主印綬冠裳飲食婚姻財物五穀之事。",
    43,
  ),
  cuiyan(
    "cuiyan-general-baihu",
    "白虎的道路、疾病、刑戮类象",
    "主道路殺伐疾病刑戮血光之事。",
    44,
  ),
  cuiyan(
    "cuiyan-general-tiankong",
    "天空的市井、约契、虚诈类象",
    "主市井約契奴僕虛詐之事。",
    44,
  ),
  cuiyan(
    "cuiyan-wealth-qinglong",
    "求财以青龙为重要取象",
    "求財最要視青龍。",
    172,
    "求财 · 章首",
  ),
];

export const generalReadingSourceIds: Record<string, string> = {
  贵人: "cuiyan-general-guiren",
  螣蛇: "cuiyan-general-tengshe",
  勾陈: "cuiyan-general-gouchen",
  太阴: "cuiyan-general-taiyin",
  朱雀: "cuiyan-general-zhuque",
  六合: "cuiyan-general-liuhe",
  青龙: "cuiyan-general-qinglong",
  天后: "cuiyan-general-tianhou",
  玄武: "cuiyan-general-xuanwu",
  太常: "cuiyan-general-taichang",
  白虎: "cuiyan-general-baihu",
  天空: "cuiyan-general-tiankong",
};
