import { useState } from "react";
import { Link } from "react-router-dom";

const SEEN_KEY = "teamsync.tutorial.seen";

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // localStorage 不可用时只在本次隐藏，不阻塞页面。
  }
}

export default function TutorialPrompt() {
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(SEEN_KEY);
    } catch {
      return true;
    }
  });

  if (!visible) {
    return null;
  }

  const dismiss = () => {
    markSeen();
    setVisible(false);
  };

  return (
    <section className="tutorial-prompt" role="status" aria-label="新手教程提示">
      <div>
        <strong>第一次使用同频？</strong>
        <p>2 分钟看完新手教程：团队、日历颜色、活动 RSVP、任务和提醒。</p>
      </div>
      <div className="panel-actions">
        <Link to="/app/tutorial" className="btn btn-primary" onClick={dismiss}>
          开始教程
        </Link>
        <button type="button" className="btn btn-secondary" onClick={dismiss}>
          不再提示
        </button>
      </div>
    </section>
  );
}
