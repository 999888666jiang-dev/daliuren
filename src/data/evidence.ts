import type { Category, ChartResult, EvidenceRecord } from "../core/types";
import {
  BRANCH_ELEMENTS,
  BRANCHES,
  bi,
  si,
  controls,
  generates,
} from "../core/constants";

export const CORPUS_VERSION = "2026-09-23.1";
export const bibliography = [
  {
    id: "wyg-0808",
    title: "景印文渊阁四库全书 · 第808册",
    edition: "台湾商务印书馆影印本 · Commons 公版标记影像",
    description:
      "98,547,126字节整册已归档；含六壬大全与数种风水文献。已看封面、卷首、九宗门与总钤局部；不等于全册已校。",
    url: "https://commons.wikimedia.org/wiki/File:文淵閣四庫全書_0808冊.djvu",
    status: "整册影像已存·局部核对",
  },
  {
    id: "daquan",
    title: "六壬大全",
    edition: "四库全书影像本 · CADAL 06054168 等（阁本待考）",
    description:
      "已下载卷一、七、九、十一至十二；卷一九宗门摘录经扫描图逐条核对。未完成全书校勘。",
    url: "https://commons.wikimedia.org/wiki/File:CADAL06054168_六壬大全·卷一.djvu",
    status: "部分已核",
  },
  {
    id: "zhizhi",
    title: "御定六壬直指",
    edition: "清康熙抄本 · 华盛顿大学来源",
    description:
      "已取得 Commons 公版标记扫描；机构目录可核。尚未逐课核对，不能称七百二十课已校。",
    url: "https://catalog.hathitrust.org/Record/102334182",
    status: "影像已存·待校",
  },
  {
    id: "cuiyan",
    title: "六壬粹言",
    edition: "国家图书馆06574号钞本",
    description:
      "整本扫描已归档；PDF第41页的逐干昼夜贵人表经目视核对，作为当前规则表的明确旁证。未完成全书校勘。",
    url: "https://catalog.digitalarchives.tw/item/00/07/ed/4e.html",
    status: "影像已存·贵人表已核",
  },
  {
    id: "bifa",
    title: "六壬毕法赋",
    edition: "采用《六壬大全》所收版本",
    description: "百法逐条登记校对状态；正文可信度与规则实现状态分别记录。",
    url: "https://commons.wikimedia.org/wiki/File:CADAL06054175_六壬大全·卷九.djvu",
    status: "校对中",
  },
  {
    id: "jiying",
    title: "六壬集应钤",
    edition: "明弘治十五年序 · 黄宾廷 · 六十卷",
    description:
      "国会图书馆有影像，注明其在线许可不自动延伸第三方使用。本项目仅存书目。",
    url: "https://www.loc.gov/resource/lcnclscd.2012402528.1A001/",
    status: "书目已核",
  },
  {
    id: "duanan",
    title: "六壬断案",
    edition: "底本待核",
    description:
      "已见网络转录，但尚未落实可核馆藏影像及版本；不作已校原文引用。",
    url: "https://ctext.org/wiki.pl?chapter=130164&if=gb",
    status: "待核底本",
  },
  {
    id: "sanming",
    title: "三命通会",
    edition: "明万民英 · 万历六年刊本 · 国家图书馆06590",
    description: "八字扩展书目；不参与六壬起课或判断。",
    url: "https://catalog.digitalarchives.tw/item/00/19/3c/14.html",
    status: "书目已核",
  },
  {
    id: "zangshu",
    title: "葬书",
    edition: "文渊阁四库全书本 · 故库017979",
    description: "馆藏目录署晋郭璞撰；风水扩展书目，不参与六壬算法。",
    url: "https://catalog.digitalarchives.tw/item/00/61/16/bf.html",
    status: "书目已核",
  },
  {
    id: "yangzhai",
    title: "阳宅十书",
    edition: "王君荣纂辑 · 万历二十五年三多斋刻本",
    description:
      "国会图书馆藏四卷本；卷一缺叶六至二十八，不能标为完整本。仅作扩展书目。",
    url: "https://www.loc.gov/item/c68002496/",
    status: "书目已核·有缺叶",
  },
];

const ED = "四库全书影像本（CADAL 06054168，阁本待考）";
const SOURCE =
  "https://commons.wikimedia.org/wiki/File:CADAL06054168_六壬大全·卷一.djvu";
function rule(
  id: string,
  title: string,
  quote: string,
  page: number,
  ruleIds: string[],
  note = "",
): EvidenceRecord {
  return {
    id,
    title,
    quote,
    work: "六壬大全",
    edition: ED,
    volume: "卷一 · 入手法",
    page: `扫描第 ${page} 页`,
    sourceUrl: SOURCE,
    imageUrl: `sources/daquan-v1-p${page}.jpg`,
    verification: "verified",
    reviewNote: `2026-09-23 逐字目视比对本地扫描页；标点为本项目添加，原书小字注不混入正文。${note}`,
    ruleIds,
  };
}

export const evidence: EvidenceRecord[] = [
  rule(
    "daquan-jigong",
    "十干寄宫",
    "甲課寅兮乙課辰，丙戊課巳不須論。丁己課未庚申上，辛戌壬亥是其真。癸課原來丑宮坐，分明不用四正神。",
    11,
    ["jigong"],
  ),
  rule(
    "daquan-zeike",
    "贼尅法",
    "取課先從下賊呼，如無下賊上尅初。",
    11,
    ["贼克"],
    "本条只证明先下贼、后上尅的取用顺序；不是整课吉凶断语。",
  ),
  rule(
    "daquan-biyong",
    "比用法",
    "常將天日比神用，陽日用陽陰用陰。若或俱比俱不比，立法別有涉害陳。",
    12,
    ["比用"],
  ),
  rule(
    "daquan-shehai",
    "涉害法",
    "涉害行來本家止，路逢多尅為用取。孟深仲淺季當休，復等柔辰剛日宜。",
    12,
    ["涉害"],
  ),
  rule(
    "daquan-yaoke",
    "遥尅法",
    "四課無尅號為遙，日與神兮遞互招。先取神遙尅其日，如無方取日來遙。",
    13,
    ["遥克"],
  ),
  rule(
    "daquan-maoxing",
    "昴星法",
    "無遙無尅昴星窮，陽仰陰俯酉位中。剛日先辰而後日，柔日先日而後辰。",
    13,
    ["昴星"],
  ),
  rule(
    "daquan-bieze",
    "别责法",
    "四課不全三課備，無遙無尅別責例。剛日干合上頭神，柔日支前三合取。",
    13,
    ["别责"],
    "末句位于相邻扫描第14页；该页也已目视核对。",
  ),
  rule(
    "daquan-bazhuan",
    "八专法",
    "兩課無尅號八專，陽日日陽順行三，陰日辰陰逆三位，中末總向日上眠。",
    14,
    ["八专"],
    "原书夹注注明连本位数。",
  ),
  rule(
    "daquan-fuyin",
    "伏吟法",
    "伏吟有尅還為用，無尅剛干柔取辰。",
    15,
    ["伏吟"],
    "后续三传刑冲细则须结合完整上下文，不能仅凭这两句自行外推。",
  ),
  rule("daquan-fanyin", "返吟法", "返吟有尅亦為用，無尅別有井欄名。", 15, [
    "返吟",
  ]),
  zhizhi(
    "zhizhi-daynight",
    "昼夜贵人的时段",
    "正時自卯至申用晝貴，自酉至寅用夜貴。",
    18,
    "起例七叶",
    "原书夹注“即阳贵”“即阴贵”未并入正文。仅证明昼夜时段；本页细分贵人表与本项目采用的通行表有异，不能据此声称整张贵人表已核。",
  ),
  zhizhi(
    "zhizhi-generals",
    "十二天将的顺逆",
    "貴人加於亥子丑寅卯辰六位則順行，加於巳午未申酉戌則逆行。",
    19,
    "起例七叶末至八叶首",
    "句首“贵人加”在前页，已连续核对。仅证明天将顺逆，并不证明不同底本的昼夜贵人取值一致。",
  ),
  {
    id: "cuiyan-guiren",
    title: "逐干昼夜贵人表",
    quote:
      "甲戊庚日晝貴丑夜貴未。乙己日晝貴子夜貴申。丙丁日晝貴亥夜貴酉。六辛日晝貴午夜貴寅。壬癸日晝貴巳夜貴卯。",
    work: "六壬粹言",
    edition: "国家图书馆06574号钞本",
    volume: "卷一 · 立课 · 十二天将旦暮治",
    page: "PDF第41页左半，原书叶十九",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:NCL-06574_六壬粹言.pdf",
    imageUrl: "sources/cuiyan-041.jpg",
    verification: "verified",
    reviewNote:
      "2026-09-23 由rule_audit与source_audit分别目视比对本地PDF渲染页，标点后加。本条是《粹言》旁证；《直指》同题的细分贵人表存在异文，不能混称所有典籍一致。",
    ruleIds: ["cuiyan-guiren"],
  },
  bifa(
    "bifa-016",
    "空上乘空事莫追",
    "謂上見旬空乘天空者，凡占指空話空全無實象。",
    50,
    "采用正文标题“空上乘空”，卷首目录作“空上逢空”。只匹配日上神旬空且乘天空；不把所有空亡泛作同一格。",
  ),
  bifa(
    "bifa-031",
    "三传递生人举荐",
    "此格有二等：一者自初傳生中，中生末傳，末傳生日干；二者自末生中傳，中傳生初傳，初傳生日干。",
    102,
    "定义跨扫描102–103页。必须有传递相生并最终生日干；103页另戒空亡。只在事业、经营、综合问题且三传均不旬空、不坐旬空时选取；未实现年命填实。",
  ),
  bifa(
    "bifa-031-void",
    "递生遇空亡的限制",
    "惟宜詳者末空亡，如值空亡者，雖有舉薦之心，終無成就之實，乃便作閒話多赤心少之話也。",
    103,
    "必须先满足第31条完整相生链，再遇三传旬空或坐空，才展示这项限制。原文后列年命填实例；本条尚未判断年命填实，不能据空亡断定事情必败，也不声称已排除填实。",
  ),
  bifa(
    "bifa-032",
    "三传互克众人欺",
    "此例亦有二等：一者初尅中，中尅末，末尅日干；二者末尅中，中尅初，初尅日干。",
    105,
    "只匹配两种连环克且最终克日干的结构。原书断语是传统象义；本条不证明现实中有人欺骗，也不能据此指认具体人物。",
  ),
];

function zhizhi(
  id: string,
  title: string,
  quote: string,
  page: number,
  volume: string,
  note: string,
): EvidenceRecord {
  return {
    id,
    title,
    quote,
    work: "御定六壬直指",
    edition: "华盛顿大学来源清代抄本（Commons UW-000BF1868C5Y821662）",
    volume,
    page: `PDF 第 ${page} 页`,
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:UW-000BF1868C5Y821662_御定六壬直指.pdf",
    imageUrl: `sources/zhizhi-${String(page).padStart(3, "0")}.jpg`,
    verification: "verified",
    reviewNote: `2026-09-23 本地 PDF 渲染页经两名任务代理目视核对；标点后加。${note}`,
    ruleIds: [id],
  };
}
function bifa(
  id: string,
  title: string,
  quote: string,
  page: number,
  reviewNote: string,
): EvidenceRecord {
  return {
    id,
    title,
    quote,
    work: "六壬大全 · 毕法赋",
    edition: "四库全书影像本（CADAL 06054175，阁本待考）",
    volume: "卷九 · 毕法赋上",
    page: `扫描第 ${page} 页`,
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:CADAL06054175_六壬大全·卷九.djvu",
    imageUrl: `sources/daquan-v9-p${page}.jpg`,
    verification: "verified",
    reviewNote: `2026-09-23 逐字目视比对扫描；仅添加标点。${reviewNote}`,
    ruleIds: [id],
  };
}

export interface EvidenceMatch {
  evidenceId: string;
  condition: string;
}

/** These explicit predicates cover only the reviewed clauses, never the 100-item index. */
export function matchBifa(
  chart: ChartResult,
  category: Category = "general",
): EvidenceMatch[] {
  const [a, b, c] = chart.transmissions.map(
    (t) => BRANCH_ELEMENTS[bi(t.branch)],
  );
  const dayElement = Math.floor(si(chart.day.stem) / 2);
  const forwardLife =
    generates(a, b) && generates(b, c) && generates(c, dayElement);
  const reverseLife =
    generates(c, b) && generates(b, a) && generates(a, dayElement);
  const forwardControl =
    controls(a, b) && controls(b, c) && controls(c, dayElement);
  const reverseControl =
    controls(c, b) && controls(b, a) && controls(a, dayElement);
  const empty = chart.transmissions.some(
    (t) =>
      t.isVoid ||
      chart.voids.includes(
        // heavenPlate[earth position] = heaven branch; inverse gives the seat.
        BRANCHES[chart.heavenPlate.indexOf(t.branch)],
      ),
  );
  const matches: EvidenceMatch[] = [];
  if (
    (forwardLife || reverseLife) &&
    ["career", "business", "general"].includes(category)
  ) {
    matches.push({
      evidenceId: empty ? "bifa-031-void" : "bifa-031",
      condition: `${forwardLife ? "初生中、中生末、末生日干" : "末生中、中生初、初生日干"}；${empty ? "三传有旬空或坐旬空；年命填实未判" : "三传无旬空或坐旬空"}`,
    });
  }
  if (forwardControl || reverseControl)
    matches.push({
      evidenceId: "bifa-032",
      condition: forwardControl
        ? "初克中、中克末、末克日干"
        : "末克中、中克初、初克日干",
    });
  const upper = chart.lessons[0].upper;
  if (
    chart.voids.includes(upper) &&
    chart.generals[chart.heavenPlate.indexOf(upper)] === "天空"
  )
    matches.push({
      evidenceId: "bifa-016",
      condition: "日上神旬空，同时乘天空",
    });
  return matches;
}

/** Only editorially reviewed quotations whose rule actually applies to this chart. */
export function selectEvidence(
  chart: ChartResult,
  category: Category = "general",
): EvidenceRecord[] {
  const applicable = new Set(
    matchBifa(chart, category).map((match) => match.evidenceId),
  );
  return evidence.filter(
    (record) =>
      record.verification === "verified" &&
      (record.id === "daquan-jigong" ||
        record.ruleIds.includes(chart.method.name) ||
        applicable.has(record.id)),
  );
}
