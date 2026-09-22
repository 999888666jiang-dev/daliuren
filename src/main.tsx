import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
class AppBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div
        style={{
          padding: "15vh 8vw",
          color: "#eee4d2",
          background: "#0c1014",
          minHeight: "100vh",
        }}
      >
        <h1>页面暂时无法显示</h1>
        <p>请刷新重试。已保存的本机报告不会被主动删除。</p>
        <button
          onClick={() => {
            window.location.hash = "/";
            window.location.reload();
          }}
        >
          返回起课
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </React.StrictMode>,
);
