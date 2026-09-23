import { expect, test, type Page } from "@playwright/test";

const records = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("guanxiang.reports.v2") || "[]"),
  );
async function fill(page: Page, question: string) {
  await page.goto("./");
  await page.getByLabel("此刻，你想问什么？").fill(question);
  await page.getByLabel("起课时间（北京时间）").fill("2026-09-23T10:30");
  await page.getByRole("button", { name: "标准时", exact: true }).click();
  await page.getByRole("checkbox", { name: /确认是不同的新事/ }).check();
}
async function submit(page: Page) {
  await page.getByRole("button", { name: "起课观象", exact: true }).click();
}
test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
});

test("same-hour standard prompt offers a real choice; living number preserves actual calendar", async ({
  page,
}) => {
  await fill(page, "我下周的工作面试需要准备什么？");
  await submit(page);
  const original = (await records(page))[0];
  await fill(page, "周末去上海的行程需要注意什么？");
  await submit(page);
  await expect(
    page.getByRole("heading", { name: "此时辰已有相同课盘" }),
  ).toBeVisible();
  expect(await records(page)).toHaveLength(1);
  await page.getByRole("button", { name: "改用报数活时", exact: true }).click();
  await page.getByLabel("心定一数（1—12）").selectOption("1");
  await submit(page);
  await expect(page.getByRole("heading", { name: "此课所见" })).toBeVisible();
  const living = (await records(page))[0];
  expect(living.chart.day).toEqual(original.chart.day);
  expect(living.chart.monthGeneral).toBe(original.chart.monthGeneral);
  expect(living.chart.daytime).toBe(original.chart.daytime);
  expect(living.chart.hourBranch).toBe("子");
  expect(living.chart.heavenPlate).not.toEqual(original.chart.heavenPlate);
  expect(living.consultation.mode).toBe("living");
  await page.reload();
  await expect(page.locator(".report-context")).toContainText("报数活时");
  expect((await records(page))[0].chart.casting.number).toBe(1);
});

test("continuation keeps the entire plate and separates question and personal context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fill(page, "今年我的工作安排有哪些要核查？");
  await submit(page);
  const original = (await records(page))[0];
  await page
    .getByText("高级选项 · 本盘继续占问新问题", { exact: true })
    .click();
  await page.getByLabel("本盘新问题").fill("朋友丢失的钥匙应如何寻找？");
  await page.getByLabel("本次求测人的本命").selectOption("午");
  await page.getByRole("checkbox", { name: /确认是不同的新事/ }).check();
  await page
    .getByRole("button", { name: "沿用本盘，解读新问题", exact: true })
    .click();
  const continued = (await records(page))[0];
  expect(continued.id).not.toBe(original.id);
  for (const field of [
    "id",
    "day",
    "monthGeneral",
    "hourBranch",
    "heavenPlate",
    "lessons",
    "transmissions",
    "generals",
    "trace",
    "time",
  ])
    expect(continued.chart[field]).toEqual(original.chart[field]);
  expect(continued.chart.input.natalBranch).toBe("午");
  expect(continued.chart.input.annualBranch).toBeUndefined();
  expect(continued.consultation).toMatchObject({
    mode: "reuse",
    sourceChartReportId: original.id,
  });
  expect(continued.interpretation).toBeUndefined();
  await expect(page.locator(".question-display")).toContainText(
    "朋友丢失的钥匙",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("unchanged matter is blocked across modes and changed circumstances retain the case", async ({
  page,
}) => {
  const question = "我的货款月底能到账吗？";
  await fill(page, question);
  await submit(page);
  const original = (await records(page))[0];
  await fill(page, question);
  await page.getByRole("button", { name: /报数活时/ }).click();
  await page.getByLabel("心定一数（1—12）").selectOption("3");
  await submit(page);
  await expect(page.getByRole("alert")).toContainText("本机已有这件问题");
  expect(await records(page)).toHaveLength(1);
  await page.getByLabel("这次所问", { exact: true }).selectOption(original.id);
  await page.getByLabel("已发生的现实变化").fill("今天对方发来了新的付款安排");
  await page.getByRole("checkbox", { name: /确认是不同的新事/ }).check();
  await submit(page);
  await expect(page.getByRole("heading", { name: "此课所见" })).toBeVisible();
  const changed = (await records(page))[0];
  expect(changed.consultation.matterId).toBe(original.consultation.matterId);
  expect(changed.consultation.changeNote).toBe("今天对方发来了新的付款安排");
});

test("same chart prompt does not lock out a new standard-time question", async ({
  page,
}) => {
  await fill(page, "周末计划去苏州旅行如何安排？");
  await submit(page);
  const original = (await records(page))[0];
  await fill(page, "下周的新岗位面试要注意哪些事项？");
  await submit(page);
  await page.getByRole("button", { name: "仍用正时起课" }).click();
  await expect(page.getByRole("heading", { name: "此课所见" })).toBeVisible();
  const next = (await records(page))[0];
  expect(next.chart.heavenPlate).toEqual(original.chart.heavenPlate);
  expect(next.consultation.mode).toBe("standard");
  expect(next.question).not.toBe(original.question);
});
