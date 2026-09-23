import type { Category } from "../../src/core/types";
import type { IntentMeaning } from "../../src/ai/meaning";

// Independent language cases, not a statistical accuracy claim. No brand list is
// shared with the local parser; the same name deliberately spans several topics.
export const meaningCases: {
  question: string;
  category: Category;
  topic?: string;
  object?: string;
  subject?: string | null;
  basis?: IntentMeaning["subject"]["basis"];
  time?: string | null;
  dateBasis?: IntentMeaning["time"]["dateBasis"];
  questionKind?: IntentMeaning["questionKind"];
  scope?: boolean;
}[] = [
  {
    question: "晚上我吃麦当劳怎么样",
    category: "general",
    topic: "饮食选择",
    object: "麦当劳",
    subject: "我",
    basis: "explicit",
    time: "晚上",
    dateBasis: "unspecified",
  },
  {
    question: "晚上吃麦当劳怎么样",
    category: "general",
    topic: "饮食选择",
    object: "麦当劳",
    subject: "本人",
    basis: "default_self",
    time: "晚上",
    dateBasis: "unspecified",
  },
  {
    question: "今晚吃云边小馆合适吗",
    category: "general",
    topic: "饮食选择",
    object: "云边小馆",
    time: "今晚",
    dateBasis: "relative",
  },
  {
    question: "下午我喝奶茶怎么样",
    category: "general",
    object: "奶茶",
    subject: "我",
    time: "下午",
    dateBasis: "unspecified",
  },
  {
    question: "明天去望江楼吃饭怎么样",
    category: "general",
    topic: "饮食选择",
    object: "望江楼",
    subject: "本人",
    basis: "default_self",
    time: "明天",
  },
  {
    question: "上午用青岚X7怎么样",
    category: "general",
    object: "青岚X7",
    time: "上午",
    dateBasis: "unspecified",
  },
  {
    question: "去星河咖啡面试能录取吗",
    category: "career",
    object: "星河咖啡",
    questionKind: "outcome",
  },
  {
    question: "买星河咖啡股票合适吗",
    category: "business",
    object: "星河咖啡股票",
    questionKind: "evaluation",
  },
  {
    question: "去星河咖啡吃饭怎么样",
    category: "general",
    topic: "饮食选择",
    object: "星河咖啡",
  },
  {
    question: "给朋友买书还是耳机更合适",
    category: "general",
    subject: "本人",
    basis: "default_self",
    questionKind: "comparison",
  },
  {
    question: "晚上吃米饭还是面条",
    category: "general",
    questionKind: "comparison",
    time: "晚上",
  },
  { question: "我还是该辞职吗", category: "career", questionKind: "advice" },
  {
    question: "不是我，是姐姐周五去复查顺利吗",
    category: "general",
    topic: "健康就医",
    subject: "姐姐",
    basis: "explicit",
    time: "周五",
  },
  {
    question: "我替朋友问，他下周转正有希望吗",
    category: "career",
    subject: "朋友",
    basis: "explicit",
    time: "下周",
    questionKind: "outcome",
  },
  {
    question: "我帮妈妈问，周末搬家顺利吗",
    category: "travel",
    subject: "妈妈",
    basis: "explicit",
    time: "周末",
  },
  {
    question: "她明天去复试能过吗",
    category: "career",
    subject: "她",
    basis: "explicit",
    time: "明天",
  },
  {
    question: "不问回款，只问周日相亲怎么样",
    category: "relationship",
    time: "周日",
  },
  {
    question: "不是旅行的事，我的行李落在车站能找回吗",
    category: "lost",
    object: "行李",
  },
  {
    question: "我把钥匙落在诊所了，能找回来吗",
    category: "lost",
    object: "钥匙",
  },
  {
    question: "明天笔试，今晚去望江楼吃饭好吗",
    category: "general",
    topic: "饮食选择",
    time: "今晚",
  },
  {
    question: "昨晚丢了手表，今天能找回吗",
    category: "lost",
    object: "手表",
    time: "今天",
  },
  {
    question: "下周面试能过吗？下个月能入职吗",
    category: "career",
    scope: true,
  },
  { question: "今晚吃什么？明天演讲顺利吗", category: "general", scope: true },
  {
    question: "我想问驾照考试，下月能通过吗",
    category: "general",
    topic: "考试学业",
    time: "下月",
  },
  {
    question: "周一开庭要注意什么",
    category: "general",
    topic: "诉讼法律",
    questionKind: "advice",
  },
];
