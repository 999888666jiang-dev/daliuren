import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Entirely isolated fake credentials and DeepSeek responses. No paid API calls.
const key = "sk-e2e-only-never-a-live-credential";
const updatedKey = "sk-e2e-updated-never-a-live-credential";
const originalQuestion = "下个月如何核查新的工作机会和岗位条件？";
const apiPattern = "https://api.deepseek.com/**";
const runtimeErrors = new WeakMap<Page, string[]>();
type Body = {
  messages: { role: string; content: string }[];
  max_tokens: number;
};
const payload = (body: Body) => JSON.parse(body.messages.at(-1)!.content);
const isIntent = (body: Body) => body.max_tokens === 1200;
function intent(body: Body, clarify = false) {
  const data = payload(body);
  return {
    category: data.categoryChoice === "auto" ? "career" : data.categoryChoice,
    coreQuestion: data.question.slice(0, 120),
    subject: null,
    object: null,
    goal: null,
    timeframe: null,
    background: [],
    missingInformation: [],
    categoryReason: "隔离测试：问题涉及岗位信息。",
    clarifications: clarify
      ? [
          {
            id: "scope",
            question: "这次先核查哪一件事？",
            options: ["如何核查新岗位条件？", "如何安排出行？"],
          },
        ]
      : [],
    status: clarify ? "needs_clarification" : "ready",
    source: "model",
  };
}
function interpretation(
  body: Body,
  summary = "隔离测试回答：先核查具体岗位条件。",
) {
  const data = payload(body);
  // Use a real supplied fact ID; never fabricate a chart or traditional citation.
  const fact =
    data.suppliedFacts.find((item: { id: string }) => item.id === "method") ??
    data.suppliedFacts[0];
  return {
    summary,
    observations: [
      {
        kind: "context",
        text: "岗位是否适合还需现实信息，先核对书面条件。",
        factIds: [fact.id],
        evidenceIds: [],
        assessmentIds: [],
      },
    ],
    advice: ["向对方索取书面职责和待遇条件。"],
    missingInformation: ["目前是否已有正式邀约？"],
    limitations: ["传统解释不能保证实际结果。"],
  };
}
async function reply(route: Route, answer: unknown) {
  await route
    .fulfill({
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
    })
    .catch(() => undefined); // A deliberately cancelled browser request can no longer be fulfilled.
}
async function cast(page: Page, question = originalQuestion) {
  await page.goto("./");
  const existing = await page
    .evaluate((q) => {
      const saved = JSON.parse(
        localStorage.getItem("guanxiang.reports.v2") || "[]",
      );
      return saved.some((r: { question: string }) => r.question === q);
    }, question)
    .catch(() => false);
  if (existing) {
    await page.goto("./#/history");
    await page
      .getByRole("button", { name: question, exact: true })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "此课所见" })).toBeVisible();
    return;
  }
  await page
    .getByRole("textbox", { name: "此刻，你想问什么？" })
    .fill(question);
  await page
    .getByRole("textbox", { name: "起课时间（北京时间）" })
    .fill("2026-01-02T20:30");
  await page.getByRole("button", { name: "标准时", exact: true }).click();
  await page.getByRole("checkbox", { name: /确认是不同的新事/ }).check();
  await page.getByRole("button", { name: "起课观象", exact: true }).click();
  const repeat = page.getByRole("button", {
    name: "仍用正时起课",
    exact: true,
  });
  if (await repeat.isVisible()) await repeat.click();
  await expect(page.getByRole("heading", { name: "此课所见" })).toBeVisible();
}
async function credentials(page: Page) {
  // Password inputs do not have the textbox role in every engine; use their explicit label.
  const field = page.getByLabel("DeepSeek API 密钥", { exact: true });
  await field.waitFor({ state: "attached" });
  if (!(await field.isVisible()))
    await page.getByText("本设备的 DeepSeek 密钥", { exact: true }).click();
  await expect(field).toBeVisible();
  return field;
}
async function authorize(page: Page) {
  await (await credentials(page)).fill(key);
  await page.getByRole("checkbox", { name: /同意将本次问题/ }).check();
}
async function widthFits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

test.beforeEach(async ({ context, page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  // A test cannot silently fall through to the real DeepSeek or any other external host.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === origin
      ? route.continue()
      : route.abort("blockedbyclient");
  });
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

test("auto is default; 320px forms, chart and source detail stay within viewport", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "自动识别", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await widthFits(page);
  await cast(page);
  await widthFits(page);
  await page.screenshot({
    path: testInfo.outputPath("mobile-320-chart.png"),
    fullPage: true,
  });
  await page.goto("./#/sources/bifa-031");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "三传递生人举荐", exact: true }),
  ).toBeVisible();
  await widthFits(page);
});

test("device key is saved, restored, updated and cleared without calling any model", async ({
  page,
}) => {
  let calls = 0;
  await page.route(apiPattern, (route) => {
    calls++;
    return route.abort();
  });
  await cast(page);
  await (await credentials(page)).fill(key);
  await page.getByRole("button", { name: "保存到此设备", exact: true }).click();
  await page.reload();
  await cast(page);
  await expect(await credentials(page)).toHaveValue(key);
  await (await credentials(page)).fill(updatedKey);
  await page.getByRole("button", { name: "更新密钥", exact: true }).click();
  await page.reload();
  await cast(page);
  await expect(await credentials(page)).toHaveValue(updatedKey);
  await page
    .getByRole("button", { name: "清除已保存密钥", exact: true })
    .click();
  await expect(await credentials(page)).toHaveValue("");
  await page.reload();
  await cast(page);
  await expect(await credentials(page)).toHaveValue("");
  expect(calls).toBe(0);
});

test("valid two-stage answer uses supplied facts and report export never includes the key", async ({
  page,
}, testInfo) => {
  const calls: Body[] = [];
  await page.route(apiPattern, async (route) => {
    const body = route.request().postDataJSON() as Body;
    calls.push(body);
    expect(JSON.stringify(body)).not.toContain(key);
    await reply(route, isIntent(body) ? intent(body) : interpretation(body));
  });
  await cast(page);
  await authorize(page);
  await page.getByRole("button", { name: "保存到此设备", exact: true }).click();
  await page.getByRole("button", { name: "生成 AI 解读", exact: true }).click();
  await expect(
    page
      .locator("#ai-reading")
      .getByText("隔离测试回答：先核查具体岗位条件。", { exact: true }),
  ).toBeVisible();
  expect(calls).toHaveLength(2);
  await page.getByRole("button", { name: "保存到本机", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const download = await downloadPromise;
  const target = testInfo.outputPath("report-without-credentials.json");
  await download.saveAs(target);
  const text = await readFile(target, "utf8");
  expect(text).not.toContain(key);
  expect(text).not.toContain('"apiKey"');
  const report = JSON.parse(text);
  expect(report.interpretation.observations[0].factIds).toContain("method");
  expect(report.aiMeta.model).toBe("deepseek-flash");
  expect(
    await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([name]) => name.includes("reports"))
        .map(([, value]) => value)
        .join(""),
    ),
  ).not.toContain(key);
});

test("one clarification round keeps the original chart and makes no repeated intent call", async ({
  page,
}) => {
  const calls: Body[] = [];
  await page.route(apiPattern, async (route) => {
    const body = route.request().postDataJSON() as Body;
    calls.push(body);
    await reply(
      route,
      isIntent(body)
        ? intent(body, true)
        : interpretation(body, "隔离测试回答：根据补充核查岗位。"),
    );
  });
  await cast(page, "新工作条件是否合适？下个月出行如何安排？");
  const plate = await page
    .getByRole("table", { name: "三传、遁干、六亲与天将" })
    .innerText();
  await authorize(page);
  await page.getByRole("button", { name: "生成 AI 解读", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "先明确这件事" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "如何核查新岗位条件？", exact: true })
    .click();
  await page.getByRole("button", { name: "确认并解读", exact: true }).click();
  await expect(
    page
      .locator("#ai-reading")
      .getByText("隔离测试回答：根据补充核查岗位。", { exact: true }),
  ).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls.filter(isIntent)).toHaveLength(1);
  expect(payload(calls[1]).intent.coreQuestion).toContain("如何核查新岗位条件");
  expect(
    await page
      .getByRole("table", { name: "三传、遁干、六亲与天将" })
      .innerText(),
  ).toBe(plate);
  await expect(page.getByRole("heading", { name: "先明确这件事" })).toHaveCount(
    0,
  );
});

test("invalid AI output leaves the chart intact and never retries automatically", async ({
  page,
}) => {
  let calls = 0;
  await page.route(apiPattern, async (route) => {
    calls++;
    const body = route.request().postDataJSON() as Body;
    const value = isIntent(body)
      ? intent(body)
      : {
          ...interpretation(body),
          observations: [
            {
              kind: "traditional",
              text: "此事必败。",
              factIds: ["invented"],
              evidenceIds: ["bifa-999"],
              assessmentIds: ["bifa-999"],
            },
          ],
        };
    await reply(route, value);
  });
  await cast(page);
  await authorize(page);
  const plate = await page
    .getByRole("table", { name: "三传、遁干、六亲与天将" })
    .innerText();
  await page.getByRole("button", { name: "生成 AI 解读", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("未通过");
  await expect(page.getByText("此事必败。", { exact: true })).toHaveCount(0);
  expect(
    await page
      .getByRole("table", { name: "三传、遁干、六亲与天将" })
      .innerText(),
  ).toBe(plate);
  await expect(
    page.getByRole("button", { name: "手动重试解读" }),
  ).toBeVisible();
  expect(calls).toBe(2);
});

test("cancelling a request discards its late answer and a new request can succeed", async ({
  page,
}) => {
  let held: Route | undefined;
  let calls = 0;
  await page.route(apiPattern, async (route) => {
    calls++;
    const body = route.request().postDataJSON() as Body;
    if (calls === 1) {
      held = route;
      return;
    }
    await reply(
      route,
      isIntent(body)
        ? intent(body)
        : interpretation(body, "隔离测试回答：新的请求已完成。"),
    );
  });
  await cast(page);
  await authorize(page);
  await page.getByRole("button", { name: "生成 AI 解读", exact: true }).click();
  await expect.poll(() => !!held).toBe(true);
  await page.getByRole("button", { name: "取消本次解读", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("已取消");
  const old = held!;
  await reply(old, intent(old.request().postDataJSON() as Body));
  await page.getByRole("button", { name: "生成 AI 解读", exact: true }).click();
  await expect(
    page
      .locator("#ai-reading")
      .getByText("隔离测试回答：新的请求已完成。", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(3);
});

test("navigating to a new report prevents an old answer from overwriting it", async ({
  page,
}) => {
  let oldInterpretation: Route | undefined;
  let intentCalls = 0;
  await page.route(apiPattern, async (route) => {
    const body = route.request().postDataJSON() as Body;
    if (isIntent(body)) {
      intentCalls++;
      await reply(route, intent(body));
    } else if (intentCalls === 1) oldInterpretation = route;
    else
      await reply(
        route,
        interpretation(body, "隔离测试回答：只属于第二份报告。"),
      );
  });
  await cast(page);
  await authorize(page);
  await page.getByRole("button", { name: "生成 AI 解读", exact: true }).click();
  await expect.poll(() => !!oldInterpretation).toBe(true);
  await page.getByRole("link", { name: "重新起课", exact: true }).click();
  await page
    .getByRole("textbox", { name: "此刻，你想问什么？" })
    .fill("第二份问题：我该怎样核查另一份工作邀约？");
  await page
    .getByRole("textbox", { name: "起课时间（北京时间）" })
    .fill("2026-01-02T20:30");
  await page.getByRole("button", { name: "标准时", exact: true }).click();
  await page.getByRole("checkbox", { name: /确认是不同的新事/ }).check();
  await page.getByRole("button", { name: "起课观象", exact: true }).click();
  await page.getByRole("button", { name: "仍用正时起课" }).click();
  await expect(page.getByRole("heading", { name: "此课所见" })).toBeVisible();
  await authorize(page);
  await page.getByRole("button", { name: "生成 AI 解读", exact: true }).click();
  await expect(
    page
      .locator("#ai-reading")
      .getByText("隔离测试回答：只属于第二份报告。", { exact: true }),
  ).toBeVisible();
  await reply(
    oldInterpretation!,
    interpretation(
      oldInterpretation!.request().postDataJSON() as Body,
      "隔离测试旧答案不得出现。",
    ),
  );
  await expect(
    page.getByText("隔离测试旧答案不得出现。", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator("#ai-reading")
      .getByText("隔离测试回答：只属于第二份报告。", { exact: true }),
  ).toBeVisible();
});

test("browser storage denial keeps a temporary key and never claims it was saved", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === "guanxiang.daliuren.credentials.v1")
        throw new DOMException("Denied by isolated test", "SecurityError");
      return original.call(this, name, value);
    };
  });
  let calls = 0;
  await page.route(apiPattern, (route) => {
    calls++;
    return route.abort();
  });
  await cast(page);
  await (await credentials(page)).fill(key);
  await page.getByRole("button", { name: "保存到此设备", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("保存失败");
  await expect(await credentials(page)).toHaveValue(key);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("guanxiang.daliuren.credentials.v1"),
    ),
  ).toBeNull();
  await page.reload();
  await cast(page);
  await expect(await credentials(page)).toHaveValue("");
  expect(calls).toBe(0);
});

test("blank clarification answers can continue with known information in one round", async ({
  page,
}) => {
  const calls: Body[] = [];
  await page.route(apiPattern, async (route) => {
    const body = route.request().postDataJSON() as Body;
    calls.push(body);
    await reply(
      route,
      isIntent(body)
        ? intent(body, true)
        : interpretation(body, "隔离测试回答：仅依据已知信息给出核查建议。"),
    );
  });
  await cast(page);
  await authorize(page);
  await page.getByRole("button", { name: "生成 AI 解读", exact: true }).click();
  await page
    .getByRole("textbox", { name: "这次先核查哪一件事？", exact: true })
    .fill("   ");
  await page.getByRole("button", { name: "确认并解读", exact: true }).click();
  await expect(
    page
      .locator("#ai-reading")
      .getByText("隔离测试回答：仅依据已知信息给出核查建议。", { exact: true }),
  ).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(payload(calls[1]).answers).toEqual({});
  expect(payload(calls[1]).intent.status).toBe("needs_clarification");
  await expect(page.getByRole("heading", { name: "先明确这件事" })).toHaveCount(
    0,
  );
});

test("printing hides credential controls even when the user revealed the key", async ({
  page,
}) => {
  await cast(page);
  const field = await credentials(page);
  await field.fill(key);
  await page.getByRole("button", { name: "显示密钥", exact: true }).click();
  await expect(field).toHaveAttribute("type", "text");
  await expect(field).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(field).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "清除已保存密钥", exact: true }),
  ).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "此课所见" })).toBeVisible();
  await expect(
    page.getByRole("table", { name: "三传、遁干、六亲与天将" }),
  ).toBeVisible();
});

for (const heldStage of ["intent", "interpretation"] as const) {
  test(`tab foreground switches preserve ${heldStage} waiting and the received answer without another request`, async ({
    page,
    context,
  }, testInfo) => {
    // Actual browser tabs and bringToFront; this does not simulate native OS suspension.
    testInfo.annotations.push({
      type: "scope",
      description:
        "Browser tab foreground switching only; no native OS suspension or mobile process eviction.",
    });
    const calls: Body[] = [];
    let held: Route | undefined;
    await page.route(apiPattern, async (route) => {
      const body = route.request().postDataJSON() as Body;
      calls.push(body);
      if ((heldStage === "intent") === isIntent(body)) {
        held = route;
        return;
      }
      await reply(
        route,
        isIntent(body)
          ? intent(body)
          : interpretation(body, "隔离测试回答：切回页面后仍保留结果。"),
      );
    });
    await cast(page);
    await authorize(page);
    await page
      .getByRole("button", { name: "生成 AI 解读", exact: true })
      .click();
    await expect.poll(() => !!held).toBe(true);
    const pendingCalls = heldStage === "intent" ? 1 : 2;
    const other = await context.newPage();
    await other.goto("about:blank");
    await other.bringToFront();
    const backgroundVisibility = await page.evaluate(
      () => document.visibilityState,
    );
    await page.bringToFront();
    await expect(
      page.getByRole("button", {
        name: heldStage === "intent" ? "正在理解问题…" : "正在据课解读…",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "取消本次解读", exact: true }),
    ).toBeVisible();
    expect(calls).toHaveLength(pendingCalls);
    await other.bringToFront();
    const body = held!.request().postDataJSON() as Body;
    await reply(
      held!,
      isIntent(body)
        ? intent(body)
        : interpretation(body, "隔离测试回答：切回页面后仍保留结果。"),
    );
    await expect(
      page
        .locator("#ai-reading")
        .getByText("隔离测试回答：切回页面后仍保留结果。", { exact: true }),
    ).toBeVisible();
    await page.bringToFront();
    await expect(
      page
        .locator("#ai-reading")
        .getByText("隔离测试回答：切回页面后仍保留结果。", { exact: true }),
    ).toBeVisible();
    await other.bringToFront();
    await page.bringToFront();
    await expect(
      page
        .locator("#ai-reading")
        .getByText("隔离测试回答：切回页面后仍保留结果。", { exact: true }),
    ).toBeVisible();
    expect(calls).toHaveLength(2);
    await expect(
      page.getByRole("button", { name: "取消本次解读", exact: true }),
    ).toHaveCount(0);
    await testInfo.attach("tab-visibility-scope", {
      contentType: "application/json",
      body: JSON.stringify({
        heldStage,
        backgroundVisibility,
        foregroundVisibility: await page.evaluate(
          () => document.visibilityState,
        ),
        scope: "bringToFront only, not OS suspension",
      }),
    });
    await other.close();
  });
}

test("a closed browser context restores only an explicitly saved device key from storageState", async ({
  browser,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  let apiCalls = 0;
  const errors: string[] = [];
  const freshContext = async (
    storageState?: Awaited<
      ReturnType<import("@playwright/test").BrowserContext["storageState"]>
    >,
  ) => {
    const value = await browser.newContext({
      baseURL,
      storageState,
      serviceWorkers: "block",
    });
    await value.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === "https://api.deepseek.com") apiCalls++;
      return url.origin === origin
        ? route.continue()
        : route.abort("blockedbyclient");
    });
    value.on("page", (p) =>
      p.on("pageerror", (error) => errors.push(error.message)),
    );
    return value;
  };
  const original = await freshContext();
  const first = await original.newPage();
  await cast(first);
  await (await credentials(first)).fill(key);
  await first
    .getByRole("button", { name: "保存到此设备", exact: true })
    .click();
  const stored = await original.storageState();
  await original.close();
  const reopened = await freshContext(stored);
  try {
    const second = await reopened.newPage();
    await cast(second);
    await expect(await credentials(second)).toHaveValue(key);
    await expect(
      second.getByRole("button", { name: "清除已保存密钥", exact: true }),
    ).toBeVisible();
    await second
      .getByRole("button", { name: "清除已保存密钥", exact: true })
      .click();
    expect(JSON.stringify(await reopened.storageState())).not.toContain(key);
    expect(apiCalls).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await reopened.close();
  }
});
