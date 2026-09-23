import { useState, useSyncExternalStore } from "react";
import { Check, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import {
  credentialSnapshot,
  subscribeCredentials,
  editCredential,
  saveCredential,
  clearCredential,
} from "../lib/credentials";

export function useCredential() {
  return useSyncExternalStore(
    subscribeCredentials,
    credentialSnapshot,
    credentialSnapshot,
  );
}
export function Credentials({
  busy = false,
  onClear,
}: {
  busy?: boolean;
  onClear: () => void;
}) {
  const credential = useCredential();
  const [visible, setVisible] = useState(false);
  return (
    <details className="credential-panel" open={!credential.saved || undefined}>
      <summary>
        <KeyRound size={17} />
        <span>本设备的 DeepSeek 密钥</span>
        <small>
          {credential.saved
            ? "已保存"
            : credential.value
              ? "仅本次使用"
              : "尚未填写"}
        </small>
      </summary>
      <div className="credential-content">
        <label className="field" htmlFor="deepseek-key">
          API 密钥
        </label>
        <div className="key-input-row">
          <input
            id="deepseek-key"
            aria-label="DeepSeek API 密钥"
            type={visible ? "text" : "password"}
            value={credential.value}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={512}
            placeholder="sk-…"
            disabled={busy}
            onChange={(e) => editCredential(e.target.value)}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={visible ? "隐藏密钥" : "显示密钥"}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="credential-actions">
          <button
            type="button"
            className="outline-button"
            disabled={!credential.value.trim() || busy || credential.saved}
            onClick={saveCredential}
          >
            <Check size={15} />
            {credential.hasSaved ? "更新密钥" : "保存到此设备"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onClear();
              clearCredential();
              setVisible(false);
            }}
          >
            <Trash2 size={15} />
            清除已保存密钥
          </button>
        </div>
        {credential.message && (
          <p className="credential-feedback" role="status">
            {credential.message}
          </p>
        )}
        <p className="credential-note">
          仅在自己的设备保存。同一浏览器与同源网页脚本可读取本机存储，它不是加密保险库。密钥只发送到
          DeepSeek 官方接口，不进入报告或 GitHub。
        </p>
      </div>
    </details>
  );
}
