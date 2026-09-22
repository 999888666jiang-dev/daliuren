/**
 * Index of all 100 headings in CADAL 06054175, scan pp. 3–9.
 * A checked heading is NOT a checked chapter or an implemented rule.
 * Only clauses explicitly listed in evidence.ts may enter a reading.
 */
export interface BifaIndexEntry {
  number: number;
  id: string;
  title: string;
  titleVerification: "verified" | "pending";
  verification: "verified" | "pending";
  implemented: boolean;
  page: string;
  imageUrl: string;
  evidenceIds: string[];
  note: string;
}

const titles = `前後引從陞遷吉
首尾相見始終宜
簾幕貴人高甲第
催官使者赴官期
六陽數足須公用
六陰相繼儘昏迷
旺祿臨身徒妄作
權攝不正祿臨支
避難逃生須棄舊
朽木難雕別作為
衆鬼雖彰全不畏
須憂狐假虎威儀
鬼賊當時無畏忌
傳財太旺返財虧
脫上逢脫防虛詐
空上逢空事莫追
進茹空亡宜退步
脚踏空亡進用宜
胎財生氣妻懷孕
胎財死氣損胎推
交車相合交關利
上下相合兩心齊
彼求我事支傳干
我求彼事干傳支
金日逢丁凶禍動
水日逢丁財動之
傳財化鬼財休覓
傳鬼化財財險危
眷屬豐盈居狹宅
屋宅寬廣致人衰
三傳遞生人舉薦
三傳互尅衆人欺
有始無終難變易
苦去甘來樂裏悲
人宅受脫俱招盜
干支皆敗勢傾頹
末助初兮三等論
閉口卦體兩般推
太陽照武宜擒賊
后合占婚豈用媒
富貴干支逢祿馬
尊崇傳內遇三奇
害貴訟直遭曲斷
課傳俱貴轉無依
晝夜貴加求兩貴
貴人蹉跌事參差
貴雖坐獄宜臨干
鬼乘天乙乃神祇
兩貴受尅難干貴
二貴皆空虛喜期
魁度天門關隔定
罡塞鬼戶任謀為
兩蛇夾墓凶難免
虎視逢虎力難施
所謀多拙逢羅網
天網自裹己招非
費有餘而得不足
用破身心無所歸
華蓋覆日人昏晦
太陽射宅屋陽曦
干乘墓虎無占病
支乘墓虎有伏屍
彼此全傷防兩損
夫妻蕪淫各有私
干墓併關人宅廢
支墳財墓旅程稽
受虎尅神為病症
制鬼之位乃良醫
虎乘遁鬼殃非淺
鬼臨三四訟災隨
病符尅宅全家患
喪吊全逢挂縞衣
前後逼迫難進退
空空如也事休追
賓主不投刑在上
彼此猜忌害相隨
互生俱生凡事益
互旺皆旺坐謀宜
干支值絕凡謀決
人宅皆死各衰羸
傳墓入墓分憎愛
不行傳者考初時
萬事喜忻三六合
合中犯煞蜜中砒
初遭夾尅不由己
將逢內戰所謀危
人宅坐墓甘招晦
干支乘墓各昏迷
任信丁馬須言動
來去俱空宜動移
虎臨干鬼凶速速
龍加生氣吉遲遲
妄用三傳災福異
喜懼空亡乃妙機
六爻現卦防其尅
旬內空亡逐類推
所筮不入仍憑類
非占現類勿言之
常問不應逢吉象
已災凶兆返無疑`.split("\n");

const reviewedClauses: Record<number, string[]> = {
  16: ["bifa-016"],
  31: ["bifa-031", "bifa-031-void"],
  32: ["bifa-032"],
};
const uncertainHeadings = new Set([42, 52, 66, 84]);
export const bifaIndex: BifaIndexEntry[] = titles.map((title, index) => {
  const number = index + 1;
  const page = number <= 10 ? 3 : 4 + Math.floor((number - 11) / 16);
  const evidenceIds = reviewedClauses[number] ?? [];
  return {
    number,
    id: `bifa-${String(number).padStart(3, "0")}`,
    title,
    titleVerification: uncertainHeadings.has(number) ? "pending" : "verified",
    verification: evidenceIds.length ? "verified" : "pending",
    implemented: evidenceIds.length > 0,
    page: `卷九扫描第 ${page} 页`,
    imageUrl: `sources/daquan-v9-p${page}.jpg`,
    evidenceIds,
    note: uncertainHeadings.has(number)
      ? "题名有待复核字形；仅供检索，不能作为已校引文。"
      : evidenceIds.length
        ? "题名及所列摘句已核；只实现 evidenceIds 指定的局部条件，并非整条全部例外均实现。"
        : "仅题名已逐字目视核对；释文、课例与适用条件尚待校勘，不参与占断结果。",
  };
});
