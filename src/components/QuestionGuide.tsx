import { BookOpen } from "lucide-react";
import { assessRules } from "../ai/assessments";
import { localIntent } from "../ai/intent";
import type { Category, ChartResult } from "../core/types";
import { selectEvidence } from "../data/evidence";

interface QuestionProfile {
  title: string;
  focus: string;
  checks: { title: string; detail: string }[];
  actions: string[];
  boundary: string;
}

const profiles: Record<Category, QuestionProfile> = {
  career: {
    title: "求职与事业",
    focus:
      "把获得机会、通过筛选、接受条件、实际到岗分开看。进展到其中一步，不能替代后续步骤的确认。",
    checks: [
      {
        title: "对方的实际要求",
        detail:
          "核对岗位职责、必备资格、工作地点与考核方式；把自己已具备的证据与仍需补足的条件分别列出。",
      },
      {
        title: "当前走到哪一步",
        detail:
          "区分投递、面试、口头邀约与书面录用。没有收到的反馈保持未知，不把礼貌回应当成录用承诺。",
      },
      {
        title: "机会是否适合你",
        detail:
          "核查薪酬、试用期、入职日期及退出成本。能否获得机会，与是否值得接受，是两个需要分别核查的问题。",
      },
    ],
    actions: [
      "整理一页岗位要求与个人经历的对应证据，优先补齐最关键的一项。",
      "按招聘方公布的流程确认下一步与反馈时间，保留原始书面通知。",
      "在正式条件落实前保留其他可行选择，不仅依据课盘辞职或放弃申请。",
    ],
    boundary:
      "本课不能证明招聘方的决定、竞争者情况或录用日期；现实反馈出现后，记录进展再复盘。",
  },
  business: {
    title: "交易与合作",
    focus:
      "把对方的意愿、履约能力、合同条件与实际交付区分开。单一表态不足以证明整笔交易能够落实。",
    checks: [
      {
        title: "标的与责任",
        detail:
          "核对交易对象、数量质量、价格与验收标准，确认谁负责付款、交付及异常处理。",
      },
      {
        title: "可验证的承诺",
        detail:
          "检查合同、订单、往来记录与已经完成的履约动作；对未落实的口头承诺另作标记。",
      },
      {
        title: "损失与退出条件",
        detail:
          "明确预付款、截止日期、违约处理和退出方式，不因象义给具体人贴诚信或欺诈标签。",
      },
    ],
    actions: [
      "把尚未一致的条款写成清单，请相关方逐项书面确认。",
      "能分阶段验证的交付先做小规模核验，记录验收依据。",
      "涉及较大金额或权利义务时，依据合同和现实资料请专业人士核查。",
    ],
    boundary:
      "本课不能确认对方资金状况、履约能力或未来收益；条文命中也不能替代合同、资信与交付核验。",
  },
  relationship: {
    title: "感情与关系",
    focus:
      "把自己的期待、对方明确表达的意愿与双方持续的行动分开。对方没有说过的心理活动，课盘无法替其确认。",
    checks: [
      {
        title: "当前关系事实",
        detail:
          "整理最近真实发生的交流、约定和分歧；区分亲自观察、他人转述与自己的猜测。",
      },
      {
        title: "双方的意愿与边界",
        detail:
          "确认是否愿意继续沟通、希望怎样相处，以及哪些接触会让对方不适；尊重明确拒绝。",
      },
      {
        title: "可改变的部分",
        detail:
          "把需要自己调整的沟通方式与需要双方共同决定的问题分开，不把关系走向归结于某一个盘面符号。",
      },
    ],
    actions: [
      "选择合适时机，用具体事实和自己的感受表达一个核心问题。",
      "提出一次清晰、可拒绝的沟通邀请，根据对方实际回应调整安排。",
      "记录双方是否兑现约定；没有新现实变化时不重复起课揣测对方。",
    ],
    boundary:
      "本课不能读取他人内心，也不能证明忠诚、欺骗、复合或结婚时间；关系需要双方自主决定。",
  },
  travel: {
    title: "出行与迁移",
    focus:
      "把能否按计划出发、途中安排、到达后的条件分开核对。是否调整行程，应先看可查证的限制与替代方案。",
    checks: [
      {
        title: "计划是否可执行",
        detail:
          "确认日期、交通、证件、住宿或搬迁交接条件；页面不会替你查询实时班次、天气和政策。",
      },
      {
        title: "最容易中断的一环",
        detail:
          "检查转乘间隔、行李、接应人与退改规则，把需要依赖别人确认的事项单独列出。",
      },
      {
        title: "备选安排",
        detail:
          "明确延误、取消或改期时可采取的下一步，以及可接受的额外时间与费用。",
      },
    ],
    actions: [
      "临近出发再次核对官方交通通知与天气信息。",
      "保存票据、必要联系方式与可离线查看的路线。",
      "为关键衔接留出余量；确认替代方案后再决定是否改期。",
    ],
    boundary:
      "本课不能保证旅途安全或预测事故；出行和迁移安排以实时通知、身体状态与现实条件为准。",
  },
  lost: {
    title: "失物寻找",
    focus:
      "从最后一次确定见到物品的时间、地点与后续路径入手。课盘上的地支与天将不能直接当作已经核实的方位或持有人。",
    checks: [
      {
        title: "最后确认点",
        detail:
          "区分确定见过的位置与推测的位置，按时间顺序整理移动、换衣、乘车和物品转移记录。",
      },
      {
        title: "优先搜索区域",
        detail:
          "先查可接触的容器、夹层与遗落地点，再联系相关场所失物招领；每次搜索记录已查范围。",
      },
      {
        title: "现实损失控制",
        detail:
          "若涉及手机、证件或支付工具，及时按官方流程保护账户、挂失或补办；不等待占问结果才行动。",
      },
    ],
    actions: [
      "画出最后确认点到发现遗失之间的路线，逐段回查。",
      "向相关场所提供物品的可识别特征，保留可以证明归属的信息。",
      "记录找回线索与已排查位置，有新线索时更新搜索计划。",
    ],
    boundary:
      "本课不能确认物品一定能找回、确切方位或谁拿走了物品；不要据此指认他人。",
  },
  general: {
    title: "其他事项",
    focus:
      "先把本次问题限定为一个对象、一个目标和一个关注期限，再区分已知事实、待确认条件与自己可以采取的行动。",
    checks: [
      {
        title: "你希望确认什么",
        detail:
          "把“会怎样”换成一个可观察的问题，例如某一步是否完成、某项条件是否满足；不同目标分别记录。",
      },
      {
        title: "哪些信息已经核实",
        detail:
          "保留通知、记录与亲自观察到的事实，把听说、推测和未公开的信息标为未知。",
      },
      {
        title: "现实选择与代价",
        detail: "列出当前可选做法、各自的成本和需要什么新信息才会改变决定。",
      },
    ],
    actions: [
      "写下当前已经确定的三项事实，避免用期待补齐未知。",
      "优先核实最能影响决定的一个条件。",
      "选择一项可逆的小行动，记录结果后再决定下一步。",
    ],
    boundary:
      "当前资料只覆盖少量已核局部条件，尚不能对全部事项提供完整传统取用与应期判断。",
  },
};

const examProfile: QuestionProfile = {
  title: "考试与招录",
  focus:
    "把资格、准备程度、考试表现与最后公布的结果分开。普通学业考试与职业招录的筛选环节也不同，不能只用一个官鬼符号代替全部判断。",
  checks: [
    {
      title: "正式要求",
      detail:
        "核对考试范围、报名资格、时间地点和评分规则；涉及招录时还要区分笔试、面试与后续审查。",
    },
    {
      title: "已有能力证据",
      detail:
        "用近期练习、错题和模拟表现确认薄弱点，不依据愿望或盘面臆测排名和分数。",
    },
    {
      title: "剩余准备时间",
      detail:
        "按实际可用时间安排复习、休息与考前准备；问题未给期限时，不自行补出考试日期。",
    },
  ],
  actions: [
    "对照正式要求列出薄弱环节，先处理影响最大的一个。",
    "完成一次与实际形式相近的练习，再根据错因调整安排。",
    "以主办方正式通知核实考试与结果，不因课盘放弃报名、复习或必要准备。",
  ],
  boundary:
    "本课不能给出录取分数、排名、通过概率或保证考取；考试结果仍取决于准备、表现与实际规则。",
};

function concernsLostPet(question: string) {
  if (!/猫|狗|宠物/u.test(question)) return false;
  // Mentioning a pet is insufficient: its collar or the owner's phone can be lost.
  const object =
    "项圈|玩具|牵引绳|狗绳|猫包|背包|用品|手机|钱包|钥匙|证件|戒指|耳机";
  const lostObject = new RegExp(
    `(?:${object})[^，,。！？!?；;]{0,8}(?:丢失|遗失|(?<!走|跑)丢了|不见了|找不到)|(?:丢失|遗失|找不到)[^，,。！？!?；;]{0,8}(?:${object})`,
    "u",
  );
  if (lostObject.test(question)) return false;
  return (
    /走丢|走失|失踪|跑丢/u.test(question) ||
    /(?:猫|狗|宠物)(?:咪|狗|猫)?(?:好像|似乎|也|已经|突然|又|刚刚|刚才|昨天|前天|今天|上午|下午|晚上|早上|出去后|回家后|一直|都)*(?:丢了|不见了|找不到了|没回来)/u.test(
      question,
    ) ||
    /(?:找不到|找回|寻找)(?:我|我们|家的|家|的|那只|一只)*(?:猫|狗|宠物)/u.test(
      question,
    )
  );
}

function profileFor(question: string, category: Category): QuestionProfile {
  // Only route explicit topic words within the chosen category; do not infer a biography.
  const active = question.replace(
    /(?:不是|不问|不看|不想问|不用看|不考虑)(?:(?!而是|只问|只想问|但是|但)[^，,。！？!?；;\n])*/gu,
    "",
  );
  if (
    (category === "career" || category === "general") &&
    /考试|考公|考编|笔试|面试成绩|招录|成绩|学业|复习/u.test(active)
  )
    return examProfile;
  if (category === "business" && /回款|货款|欠款|收款|还款/u.test(active))
    return {
      ...profiles.business,
      title: "货款与欠款",
      focus:
        "把是否到期、付款义务是否明确、对方是否有具体安排与款项是否实际到账分开。承诺付款与已经到账是两种不同状态。",
      checks: [
        {
          title: "款项与期限",
          detail:
            "核对金额、币种、约定付款日期、发票与验收条件，确认是否存在尚未满足的付款前提。",
        },
        {
          title: "已有沟通证据",
          detail:
            "保存合同、对账单及对方已确认的付款安排；没有获得的回复或资金信息仍为未知。",
        },
        {
          title: "下一步处理",
          detail:
            "把正常提醒、书面对账、分期安排与争议处理区分开，依据真实逾期情况安排，不根据盘面指认对方欺诈。",
        },
      ],
      actions: [
        "先完成书面对账，列明未结金额、付款条件和约定日期。",
        "向对方确认可执行的付款安排，以银行或支付平台的实际到账记录为准。",
        "如有争议或逾期，保留材料并按合同、当地适用程序咨询专业人士。",
      ],
      boundary:
        "本课不能确认对方账户资金、是否会付款或精确到账日期；无法据此估算回款概率。",
    };
  if (category === "business" && /买房|卖房|房屋|房产/u.test(active))
    return {
      ...profiles.business,
      title: "房屋交易",
      focus:
        "把产权与房屋条件、双方出价、融资安排、合同签署与交接区分开；对某一环节满意不等于整笔交易已落实。",
      actions: [
        "通过正式资料核验产权、用途、限制和实际房屋状况。",
        "列明价格、税费、贷款条件、交接时间与解除条款，核实承担方。",
        "在签署或支付前，请当地有资质的专业人士复核重要文件。",
      ],
      boundary:
        "本课不能核验产权、判断市场价格或保证升值；房屋决定应依据实地查看、正式资料与可负担能力。",
    };
  if (category === "lost" && concernsLostPet(active))
    return {
      ...profiles.lost,
      title: "走失宠物",
      focus:
        "优先确定最后目击的位置、走失时间与可能的移动路径。宠物与静态失物不同，应持续收集可核实的目击线索。",
      checks: [
        {
          title: "最后目击线索",
          detail:
            "整理照片、显著特征、项圈或芯片信息，区分本人目击与未经核实的转述。",
        },
        {
          title: "周边实际环境",
          detail:
            "按最后目击点联系附近物业、救助组织或相关场所，核查线索时间与位置。",
        },
        {
          title: "有记录的寻找",
          detail:
            "与同行者分工并记录已查区域，避免反复搜索同一处；得到新线索时再调整范围。",
        },
      ],
      actions: [
        "尽快从最后目击点开始有序寻找，并请现场人员协助核实。",
        "在合适渠道发布清晰特征与联系办法，保护个人住址等不必要信息。",
        "验证每条目击信息，必要时寻求当地动物救助人员协助。",
      ],
      boundary:
        "本课不能定位宠物、确认其状态或保证找回；不能因为某个盘面判断而停止现实寻找。",
    };
  if (category === "general" && /健康|疾病|医院|症状|治疗|身体/u.test(active))
    return {
      ...profiles.general,
      title: "健康事项",
      focus:
        "这类问题需要症状、持续时间、检查与专业评估。课盘不能提供诊断，也不能评价治疗是否有效。",
      actions: [
        "记录实际症状、发生时间和已有检查资料。",
        "向合格医务人员说明情况并核实下一步，不据占问自行更改治疗。",
        "若出现急症或明显恶化，及时就医，不等待占问结果。",
      ],
      boundary:
        "本页不提供医疗诊断、用药或预后推断；传统条文不能替代专业诊疗。",
    };
  if (category === "general" && /法律|官司|诉讼|起诉|仲裁/u.test(active))
    return {
      ...profiles.general,
      title: "法律与争议事项",
      focus:
        "先区分事实经过、证据、已经收到的文书与希望达成的结果；适用规则和期限需要结合具体地区与程序核查。",
      actions: [
        "整理按日期排列的事实经过、原始证据与正式文书。",
        "通过文书载明的正式渠道核对程序和期限，不自行猜测。",
        "向当地合格法律专业人士说明完整情况，不据课盘放弃答辩或其他必要行动。",
      ],
      boundary: "本课不能判定责任、胜败或裁判日期，本页也不提供具体法律结论。",
    };
  return profiles[category];
}

/** Deterministic reading aid; it never asks a model or turns a chart into an event forecast. */
export function buildQuestionGuide(
  chart: ChartResult,
  question: string,
  category: Category,
) {
  const intent = localIntent(question, category);
  const selected = selectEvidence(chart, category);
  const verified = new Set(selected.map((item) => item.id));
  const assessments = assessRules(chart, category);
  const matched = assessments.filter(
    (item) =>
      item.kind === "judgement" &&
      item.status === "met" &&
      item.evidenceIds.length > 0 &&
      item.evidenceIds.every((id) => verified.has(id)),
  );
  return {
    profile: profileFor(question, category),
    timeframe: intent.timeframe,
    needsScope: intent.status === "needs_clarification",
    facts: chart.facts.filter((item) =>
      [
        "day",
        "month-general",
        "hour",
        "method",
        "transmission-1",
        "transmission-2",
        "transmission-3",
        "voids",
        "natal",
        "annual",
        "casting-mode",
      ].includes(item.id),
    ),
    matched,
    evidence: selected,
  };
}

export function QuestionGuide({
  chart,
  question,
  category,
}: {
  chart: ChartResult;
  question: string;
  category: Category;
}) {
  const guide = buildQuestionGuide(chart, question, category);
  return (
    <section
      className="reading-section question-guide"
      aria-labelledby="question-guide-heading"
    >
      <div className="section-heading">
        <h2 id="question-guide-heading">当前事项 · 本地详细分析</h2>
        <BookOpen size={18} />
      </div>
      <p className="section-intro">
        本地规则整理 ·
        无需密钥。以下分别说明可确认的盘面、已核条文与现实核查；这是事项分析提纲，不是
        AI 生成的个案预言。
      </p>
      <div className="intent-summary">
        <span className="section-eyebrow">{guide.profile.title}</span>
        <p>{guide.profile.focus}</p>
        <p className="muted">
          {guide.timeframe
            ? `问题中写明的时间范围：${guide.timeframe}。这只是你的关注期限，不是推算出的应验时间。`
            : "问题尚未说明关注期限；本页不会代填发生日期。"}
        </p>
        {guide.needsScope && (
          <p className="scope-note">
            问题可能包含多个事项、类别冲突或对象不明。以下仅按已选类别整理，不把这些条件视为已经确认。
          </p>
        )}
      </div>
      <h3>本课能确认的事实</h3>
      <dl className="guide-facts">
        {guide.facts.map((fact) => (
          <div key={fact.id}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className="scope-note">
        以上是程序排盘结果。初、中、末传不能直接当作现实事件已经发生的三个阶段，末传也不能单独决定所有问题的结局。
      </p>
      <h3>已核传统条件能说明多少</h3>
      {guide.matched.length ? (
        guide.matched.map((item) => (
          <article className="observation" key={item.id}>
            <span className="observation-kind">传统条件 · {item.title}</span>
            <p>{item.statement}</p>
            <p className="assessment-caveat">{item.caveats.join(" ")}</p>
            <div className="evidence-links">
              {item.evidenceIds.map((id) => (
                <a key={id} href={`#/sources/${id}`}>
                  {guide.evidence.find((source) => source.id === id)?.title ??
                    "核对原条"}{" "}
                  ↗
                </a>
              ))}
            </div>
          </article>
        ))
      ) : (
        <p>
          本课没有命中当前资料库已实现的判断条文。这不等于吉、不等于凶，也不等于没有传统论法；这里只是不把尚未核实的规则包装成结论。已展示的寄宫和取传口诀只用于核对排盘。
        </p>
      )}
      <p className="scope-note">
        事项类别用于切换分析重点。专门类神、年命填实和精确应期尚未完整核校，不能仅按“问财看财、考试看官、寻人看玄武”套成唯一答案。
      </p>
      <h3>
        围绕这件事，需要核实什么 <small>现实分析</small>
      </h3>
      {guide.profile.checks.map((check) => (
        <article className="observation" key={check.title}>
          <strong>{check.title}</strong>
          <p>{check.detail}</p>
        </article>
      ))}
      <h3>
        接下来可以做的事 <small>现代建议</small>
      </h3>
      <ol>
        {guide.profile.actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ol>
      <p className="interpretation-limits">{guide.profile.boundary}</p>
    </section>
  );
}
