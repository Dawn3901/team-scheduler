import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** 兜底渲染异常，避免整页白屏；数据仍在服务端，刷新即可重试。 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 只记录组件栈，便于本地排查；不打印用户数据。
    if (import.meta.env.DEV) {
      console.error("页面渲染失败", error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-main">
          <section className="panel" role="alert">
            <h2>页面出错了</h2>
            <p>页面渲染遇到问题，刷新后重试；你的数据仍在服务器上。</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              重新加载
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
