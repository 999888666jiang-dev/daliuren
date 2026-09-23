import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fake keys only; no test reads the user's browser profile or a live credential.
const firstKey = "sk-test-only-device-first-credential";
const nextKey = "sk-test-only-device-next-credential";
let store: Map<string, string>;
let storage: Storage;
let tab: EventTarget;
let credentials: typeof import("../src/lib/credentials");
let fetchSpy: ReturnType<typeof vi.fn>;
let logSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(async () => {
  vi.resetModules();
  store = new Map();
  storage = {
    get length() {
      return store.size;
    },
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear()),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
  };
  tab = new EventTarget();
  fetchSpy = vi.fn(() =>
    Promise.reject(new Error("Tests must not call any network")),
  );
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", tab);
  vi.stubGlobal("fetch", fetchSpy);
  logSpies = ["log", "info", "debug", "warn", "error"].map((method) =>
    vi.spyOn(console, method as "log").mockImplementation(() => undefined),
  );
  credentials = await import("../src/lib/credentials");
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  for (const spy of logSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function saved(key: string) {
  return JSON.stringify({ schemaVersion: 1, apiKey: key });
}
function changed(key: string | null) {
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: key });
  tab.dispatchEvent(event);
}

describe("explicit device credential storage", () => {
  it("starts empty and preserves snapshot identity until a change", () => {
    const value = credentials.credentialSnapshot();
    expect(value).toMatchObject({ value: "", saved: false, hasSaved: false });
    expect(credentials.credentialSnapshot()).toBe(value);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });
  it("reads a saved key once and marks it as saved", () => {
    store.set(credentials.CREDENTIAL_KEY, saved(firstKey));
    expect(credentials.credentialSnapshot()).toMatchObject({
      value: firstKey,
      saved: true,
      hasSaved: true,
    });
  });
  it.each([
    "{}",
    '{"schemaVersion":2,"apiKey":"ignored"}',
    '{"schemaVersion":1,"apiKey":123}',
    JSON.stringify({ schemaVersion: 1, apiKey: "x".repeat(513) }),
  ])("ignores incompatible saved data: %s", (raw) => {
    store.set(credentials.CREDENTIAL_KEY, raw);
    expect(credentials.credentialSnapshot()).toMatchObject({
      value: "",
      hasSaved: false,
    });
  });
  it("editing is transient until the user explicitly saves", () => {
    credentials.editCredential(firstKey);
    expect(credentials.credentialSnapshot()).toMatchObject({
      value: firstKey,
      saved: false,
      hasSaved: false,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    credentials.saveCredential();
    expect(JSON.parse(store.get(credentials.CREDENTIAL_KEY)!)).toEqual({
      schemaVersion: 1,
      apiKey: firstKey,
    });
    expect(credentials.credentialSnapshot()).toMatchObject({
      saved: true,
      hasSaved: true,
    });
  });
  it("trims a key, updates explicitly, and retains the previous saved key until the update", () => {
    credentials.editCredential(`  ${firstKey}  `);
    credentials.saveCredential();
    credentials.editCredential(nextKey);
    expect(credentials.credentialSnapshot()).toMatchObject({
      value: nextKey,
      saved: false,
      hasSaved: true,
    });
    expect(JSON.parse(store.get(credentials.CREDENTIAL_KEY)!).apiKey).toBe(
      firstKey,
    );
    credentials.saveCredential();
    expect(JSON.parse(store.get(credentials.CREDENTIAL_KEY)!).apiKey).toBe(
      nextKey,
    );
    expect(credentials.credentialSnapshot()).toMatchObject({
      value: nextKey,
      saved: true,
    });
  });
  it("does not replace the persisted key when a proposed value has invalid format", () => {
    store.set(credentials.CREDENTIAL_KEY, saved(firstKey));
    credentials.editCredential("not-a-key");
    credentials.saveCredential();
    expect(JSON.parse(store.get(credentials.CREDENTIAL_KEY)!).apiKey).toBe(
      firstKey,
    );
    expect(credentials.credentialSnapshot().message).toContain("有效格式");
  });
  it("clears memory and only its own storage entry", () => {
    store.set(credentials.CREDENTIAL_KEY, saved(firstKey));
    store.set("guanxiang.reports.v2", "[test report]");
    credentials.credentialSnapshot();
    credentials.clearCredential();
    expect(store.has(credentials.CREDENTIAL_KEY)).toBe(false);
    expect(store.get("guanxiang.reports.v2")).toBe("[test report]");
    expect(credentials.credentialSnapshot()).toMatchObject({
      value: "",
      saved: false,
      hasSaved: false,
    });
  });
  it("supports page-only use when reading storage is denied", () => {
    vi.mocked(storage.getItem).mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(credentials.credentialSnapshot().message).toContain("存储不可用");
    credentials.editCredential(firstKey);
    expect(credentials.credentialSnapshot().value).toBe(firstKey);
  });
  it("keeps the edited in-memory key after save denial without claiming success", () => {
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw new DOMException("blocked", "QuotaExceededError");
    });
    credentials.editCredential(firstKey);
    credentials.saveCredential();
    expect(credentials.credentialSnapshot()).toMatchObject({
      value: firstKey,
      saved: false,
      hasSaved: false,
    });
    expect(credentials.credentialSnapshot().message).toContain("保存失败");
  });
  it("clears memory but accurately warns when disk deletion is denied", () => {
    store.set(credentials.CREDENTIAL_KEY, saved(firstKey));
    credentials.credentialSnapshot();
    vi.mocked(storage.removeItem).mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    credentials.clearCredential();
    expect(credentials.credentialSnapshot().value).toBe("");
    expect(credentials.credentialSnapshot().hasSaved).toBe(true);
    expect(credentials.credentialSnapshot().saved).toBe(false);
    expect(credentials.credentialSnapshot().message).toContain("拒绝删除");
    expect(store.has(credentials.CREDENTIAL_KEY)).toBe(true);
  });
  it("notifies subscribers about local edits, save and clear without exposing values in arguments", () => {
    const listener = vi.fn();
    const stop = credentials.subscribeCredentials(listener);
    credentials.credentialSnapshot();
    listener.mockClear();
    credentials.editCredential(firstKey);
    credentials.saveCredential();
    credentials.clearCredential();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls).toEqual([[], [], []]);
    stop();
    credentials.editCredential(nextKey);
    expect(listener).toHaveBeenCalledTimes(3);
  });
  it("loads another tab's update and clear, ignores unrelated events, and unsubscribes", () => {
    const listener = vi.fn();
    const stop = credentials.subscribeCredentials(listener);
    credentials.credentialSnapshot();
    listener.mockClear();
    store.set(credentials.CREDENTIAL_KEY, saved(nextKey));
    changed("some-other-key");
    expect(listener).not.toHaveBeenCalled();
    changed(credentials.CREDENTIAL_KEY);
    expect(credentials.credentialSnapshot()).toMatchObject({
      value: nextKey,
      saved: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    store.clear();
    changed(null);
    expect(credentials.credentialSnapshot()).toMatchObject({
      value: "",
      hasSaved: false,
    });
    stop();
    listener.mockClear();
    store.set(credentials.CREDENTIAL_KEY, saved(firstKey));
    changed(credentials.CREDENTIAL_KEY);
    expect(listener).not.toHaveBeenCalled();
    expect(credentials.credentialSnapshot().value).toBe("");
  });
});
