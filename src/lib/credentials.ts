export const CREDENTIAL_KEY = "guanxiang.daliuren.credentials.v1";
export interface CredentialState {
  value: string;
  saved: boolean;
  hasSaved: boolean;
  message: string;
}
let initialized = false;
let savedValue = "";
let state: CredentialState = {
  value: "",
  saved: false,
  hasSaved: false,
  message: "",
};
const listeners = new Set<() => void>();
function publish(value: string, message = "") {
  state = {
    value,
    saved: !!value && value === savedValue,
    hasSaved: !!savedValue,
    message,
  };
  listeners.forEach((listener) => listener());
}
function load() {
  initialized = true;
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    const item = raw ? JSON.parse(raw) : null;
    savedValue =
      item?.schemaVersion === 1 &&
      typeof item.apiKey === "string" &&
      item.apiKey.length <= 512
        ? item.apiKey
        : "";
    publish(savedValue, savedValue ? "已从此设备读取密钥。" : "");
  } catch {
    savedValue = "";
    publish(state.value, "本机存储不可用，仍可填写密钥临时使用。");
  }
}
export function credentialSnapshot(): CredentialState {
  if (!initialized) load();
  return state;
}
function onStorage(event: StorageEvent) {
  if (event.key === CREDENTIAL_KEY || event.key === null) load();
}
export function subscribeCredentials(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined")
    window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== "undefined")
      window.removeEventListener("storage", onStorage);
  };
}
export function editCredential(value: string) {
  credentialSnapshot();
  publish(
    value,
    savedValue && value !== savedValue ? "当前修改尚未保存到此设备。" : "",
  );
}
export function saveCredential() {
  const value = credentialSnapshot().value.trim();
  if (!/^sk-[A-Za-z0-9_-]{12,256}$/u.test(value)) {
    publish(state.value, "请填写有效格式的 DeepSeek API 密钥。");
    return;
  }
  try {
    localStorage.setItem(
      CREDENTIAL_KEY,
      JSON.stringify({ schemaVersion: 1, apiKey: value }),
    );
    savedValue = value;
    publish(value, "已保存到此设备。下次打开将自动填写；保存不会调用模型。");
  } catch {
    publish(
      value,
      "保存失败：浏览器不允许本机存储。密钥仍可用于本次页面会话。",
    );
  }
}
export function clearCredential() {
  let message = "已清除本页密钥和此设备保存的密钥。";
  try {
    localStorage.removeItem(CREDENTIAL_KEY);
    savedValue = "";
  } catch {
    message =
      "本页密钥已清空，但浏览器拒绝删除本机记录。请在浏览器设置中清除此网站的数据。";
  }
  publish("", message);
}
