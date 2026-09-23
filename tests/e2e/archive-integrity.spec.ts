import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { assessRules } from "../../src/ai/assessments";
import type {
  IntentAssessment,
  InterpretationV2,
  RuleAssessment,
} from "../../src/ai/types";
import { selectEvidence } from "../../src/data/evidence";
import type { Report } from "../../src/lib/report";

// Every external request is blocked unless fulfilled by this test's local mock.
const fakeKey = "sk-archive-test-only-never-a-live-credential";
const apiPattern = "https://api.deepseek.com/**";
const runtimeErrors = new WeakMap<Page, string[]>();
const question = "下周岗位面试怎么准备？这份合作合同应该先核查哪些条款？";
const selectedQuestion = "这份合作合同应该先核查哪些条款？";
const summary = "归档测试：核查合作条款与付款条件。";

type Body = {
  messages: { role: string; content: string }[];
  max_tokens: number;
};
type InterpretationPayload = {
  intent: IntentAssessment;
  answers: Record<string, string>;
  suppliedFacts: { id: string }[];
  ruleAssessments: RuleAssessment[];
};
const payload = (body: Body) => JSON.parse(body.messages.at(-1)!.content);
const records = (page: Page): Promise<Report[]> =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("guanxiang.reports.v2") || "[]"),
  );

async function fill(page: Page, text: string, datetime = "2026-09-23T10:30") {
  await page.goto("./");
  await page.getByLabel("此刻，你想问什么？").fill(text);
  await page.getByLabel("起课时间（北京时间）").fill(datetime);
  await page.getByRole("button", { name: "标准时", exact: true }).click();
  await page.getByRole("checkbox", { name: /确认是不同的新事/ }).check();
}
async function submit(page: Page) {
  await page.getByRole("button", { name: "起课观象", exact: true }).click();
}
async function result(page: Page, expectedQuestion: string, id?: string) {
  await expect(page.getByRole("heading", { name: "此课所见" })).toBeVisible();
  await expect(page.locator(".question-display")).toContainText(
    expectedQuestion,
  );
  if (id) await expect(page).toHaveURL(new RegExp(`#/result/${id}$`));
}
async function reply(route: Route, answer: unknown) {
  await route.fulfill({
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization,content-type",
    },
    body: JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: JSON.stringify(answer) },
        },
      ],
    }),
  });
}
async function authorize(page: Page) {
  const field = page.getByLabel("DeepSeek API 密钥", { exact: true });
  if (!(await field.isVisible()))
    await page.getByText("本设备的 DeepSeek 密钥", { exact: true }).click();
  await field.fill(fakeKey);
  await page.getByRole("checkbox", { name: /同意将本次问题/ }).check();
}

test.beforeEach(async ({ context, page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

for (const clarify of [false, true]) {
  test(`async ${clarify ? "clarification" : "reclassification"} keeps the final intent, category, assessments and answer together`, async ({
    page,
  }, testInfo) => {
    const calls: Body[] = [];
    let held: { route: Route; body: Body } | undefined;
    await page.route(apiPattern, async (route) => {
      const body = route.request().postDataJSON() as Body;
      calls.push(body);
      if (body.max_tokens !== 1200) {
        held = { route, body };
        return;
      }
      const extracted: IntentAssessment = {
        category: clarify ? "career" : "business",
        coreQuestion: payload(body).question,
        subject: null,
        object: null,
        goal: null,
        timeframe: null,
        background: [],
        missingInformation: [],
        categoryReason: "隔离测试，核验类别更新的保存一致性。",
        clarifications: clarify
          ? [
              {
                id: "scope",
                question: "本次先分析哪件事情？",
                options: [selectedQuestion, "下周岗位面试怎么准备？"],
              },
            ]
          : [],
        status: clarify ? "needs_clarification" : "ready",
        source: "model",
      };
      await reply(route, extracted);
    });

    await fill(page, question, "2026-01-02T20:30");
    await submit(page);
    await result(page, question);
    const original = (await records(page))[0];
    expect(original.category).toBe("general");
    await authorize(page);
    await page
      .getByRole("button", { name: "生成 AI 解读", exact: true })
      .click();
    if (clarify) {
      await expect(
        page.getByRole("heading", { name: "先明确这件事" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: selectedQuestion, exact: true })
        .click();
      await page
        .getByRole("button", { name: "确认并解读", exact: true })
        .click();
    }
    await expect.poll(() => held !== undefined).toBe(true);
    const sent = payload(held!.body) as InterpretationPayload;
    expect(sent.intent.category).toBe("business");
    expect(sent.intent.status).toBe("ready");
    expect(sent.answers).toEqual(clarify ? { scope: selectedQuestion } : {});

    // Observe the intermediate saved update before allowing the async answer to finish.
    // The old onUpdate closure would overwrite this state with the initial general category.
    await expect
      .poll(async () => (await records(page))[0].category)
      .toBe("business");
    const intermediate = (await records(page))[0];
    expect(intermediate.intent).toEqual(sent.intent);
    const answer: InterpretationV2 = {
      summary,
      observations: [
        {
          kind: "context",
          text: "合作条件需依据书面资料核实，可先逐项核对付款约定。",
          factIds: [sent.suppliedFacts.find((f) => f.id === "method")!.id],
          evidenceIds: [],
          assessmentIds: [],
        },
      ],
      advice: ["向对方确认书面付款条件。"],
      missingInformation: ["双方是否已确认合同版本？"],
      limitations: ["传统解释不能保证实际结果。"],
    };
    await reply(held!.route, answer);
    await expect(
      page.locator("#ai-reading").getByText(summary, { exact: true }),
    ).toBeVisible();
    expect(calls).toHaveLength(2);
    const saved = (await records(page))[0];
    expect(saved.id).toBe(original.id);
    expect(saved.createdAt).toBe(original.createdAt);
    expect(saved.category).toBe("business");
    expect(saved.intent).toEqual(sent.intent);
    expect(saved.clarificationAnswers).toEqual(sent.answers);
    expect(saved.assessments).toEqual(assessRules(original.chart, "business"));
    expect(saved.evidenceSnapshot).toEqual(
      selectEvidence(original.chart, "business"),
    );
    expect(saved.interpretation).toEqual(answer);
    expect(saved.chart).toEqual(original.chart);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出", exact: true }).click();
    const download = await downloadPromise;
    const target = testInfo.outputPath("consistent-report.json");
    await download.saveAs(target);
    const serialized = await readFile(target, "utf8");
    expect(serialized).not.toContain(fakeKey);
    expect(JSON.parse(serialized)).toEqual(saved);
    await page.reload();
    await result(page, question, original.id);
    await expect(
      page.locator("#ai-reading").getByText(summary, { exact: true }),
    ).toBeVisible();
    expect((await records(page))[0]).toEqual(saved);
  });
}

test("an older report stays attached to its ID through refresh and browser back/forward", async ({
  page,
}) => {
  const olderQuestion = "下周的工作面试需要准备哪些材料？";
  const newerQuestion = "周末去杭州的旅行要核对哪些安排？";
  await fill(page, olderQuestion);
  await submit(page);
  await result(page, olderQuestion);
  const older = (await records(page))[0];
  await fill(page, newerQuestion, "2026-09-23T12:30");
  await submit(page);
  await result(page, newerQuestion);
  const newer = (await records(page))[0];
  const before = await records(page);
  expect(newer.id).not.toBe(older.id);

  await page
    .getByRole("navigation")
    .getByRole("link", { name: "本机记录" })
    .click();
  await page.getByRole("button", { name: olderQuestion, exact: true }).click();
  await result(page, olderQuestion, older.id);
  await page.reload();
  await result(page, olderQuestion, older.id);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "本机记录" })
    .click();
  await page.getByRole("button", { name: newerQuestion, exact: true }).click();
  await result(page, newerQuestion, newer.id);
  await page.goBack();
  await expect(page).toHaveURL(/#\/history$/);
  await page.goBack();
  await result(page, olderQuestion, older.id);
  await page.goForward();
  await expect(page).toHaveURL(/#\/history$/);
  await page.goForward();
  await result(page, newerQuestion, newer.id);
  expect(await records(page)).toEqual(before);
});

test("editing the form discards the stale same-period draft before any continuation action", async ({
  page,
}) => {
  await fill(page, "我的合作合同接下来要确认哪些条款？");
  await submit(page);
  await result(page, "我的合作合同接下来要确认哪些条款？");
  const abandoned = "朋友下周面试需要准备什么材料？";
  const revised = "周末出行需要先确认哪些车票信息？";
  await fill(page, abandoned);
  await submit(page);
  await expect(
    page.getByRole("heading", { name: "此时辰已有相同课盘" }),
  ).toBeVisible();
  await page.getByLabel("此刻，你想问什么？").fill(revised);
  await expect(
    page.getByRole("button", { name: "沿用已有课盘", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "仍用正时起课", exact: true }),
  ).toHaveCount(0);
  expect(await records(page)).toHaveLength(1);
  await submit(page);
  await page.getByRole("button", { name: "仍用正时起课", exact: true }).click();
  await result(page, revised);
  const saved = await records(page);
  expect(saved).toHaveLength(2);
  expect(saved[0].question).toBe(revised);
  expect(saved.some((r) => r.question === abandoned)).toBe(false);
});

test("reusing the same-period chart keeps its original place consistent with its coordinates", async ({
  page,
}) => {
  await fill(page, "这份北京的合作合同要注意什么事项？");
  await page.getByLabel("所在地", { exact: true }).selectOption("北京");
  await submit(page);
  await result(page, "这份北京的合作合同要注意什么事项？");
  const original = (await records(page))[0];
  expect(original.place).toBe("北京");
  expect(original.chart.input!.longitude).toBe(116.3972);

  const nextQuestion = "朋友下周的新工作面试应准备哪些材料？";
  await fill(page, nextQuestion);
  await page.getByLabel("所在地", { exact: true }).selectOption("上海");
  await submit(page);
  await expect(
    page.getByRole("heading", { name: "此时辰已有相同课盘" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "沿用已有课盘", exact: true }).click();
  await result(page, nextQuestion);
  const reused = (await records(page))[0];
  expect(reused.consultation).toMatchObject({
    mode: "reuse",
    sourceChartReportId: original.id,
  });
  expect(reused.place).toBe(original.place);
  expect(reused.chart.input).toEqual(original.chart.input);
  expect(reused.chart.time).toEqual(original.chart.time);
  expect(reused.chart.id).toBe(original.chart.id);
  expect(reused.comparison).toBeUndefined();
  await expect(page.locator(".report-context")).toContainText("北京");
  await expect(page.locator(".report-context")).not.toContainText("上海");
  await page.reload();
  await result(page, nextQuestion, reused.id);
  expect((await records(page))[0]).toEqual(reused);
});
