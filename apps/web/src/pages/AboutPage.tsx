import { Link } from "react-router-dom";

import { CALENDAR_COLORS, textColorFor } from "../lib/calendarColors";

const features = [
  {
    title: "共享日历",
    text: "月/周/日三视图，按成员筛选；全天、跨天、23:30 等边界时间都按团队时区显示。",
  },
  {
    title: "邀请与 RSVP",
    text: "一次邀请多人或“邀请全员”；接受/待定/拒绝可反复修改，组织者看到每个人的状态。",
  },
  {
    title: "忙闲与冲突",
    text: "周视图叠加成员忙闲；建活动时提示冲突成员与时段，提醒但不阻止保存。",
  },
  {
    title: "我的日程",
    text: "个人事件跨团队保留，默认以“忙碌”参与团队忙闲；我参加/待回应的团队活动也会只读汇总到这里。",
  },
  {
    title: "任务截止",
    text: "看板式任务、负责人、优先级、逾期天数；截止日出现在日历“全天”行。",
  },
  {
    title: "提醒与实时",
    text: "事件前 15 分钟、任务截止前 1 小时提醒；WebSocket 实时刷新，断线自动重连。",
  },
  {
    title: "三端可用",
    text: "Web 全功能；Electron 桌面端托盘 + 系统通知；Android 本地定时通知。",
  },
];

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="tutorial-swatch" style={{ backgroundColor: color, color: textColorFor(color) }}>
      {label}
    </span>
  );
}

export default function AboutPage() {
  return (
    <section className="panel about-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">TeamSync · 同频</p>
          <h1>关于同频</h1>
          <p className="muted">面向 3–20 人小团队的共享日程 + 轻量任务协作工具。</p>
        </div>
      </div>

      <section className="about-hero" aria-labelledby="about-hero-title">
        <h2 id="about-hero-title">让小组的时间先“同频”</h2>
        <p>
          小团队最常见的摩擦不是“不知道要做什么”，而是“不知道大家什么时候有空”。
          同频把共享日历、邀请回应、忙闲冲突和任务截止放在同一个团队空间里，
          服务器是唯一数据源，不做离线写、不做后台推送，保证三端看到的是同一份日程。
        </p>
      </section>

      <section className="about-section" aria-labelledby="about-features-title">
        <h2 id="about-features-title">核心功能</h2>
        <div className="tutorial-steps">
          {features.map((feature) => (
            <article className="tutorial-step" key={feature.title}>
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-color-title">
        <h2 id="about-color-title">一眼看懂颜色</h2>
        <p className="muted">颜色只表达“我要不要处理”，不表示创建者。</p>
        <div className="tutorial-color-grid">
          <Swatch color={CALENDAR_COLORS.attending} label="蓝：需要我参加" />
          <Swatch color={CALENDAR_COLORS.notAttending} label="绿：不需要我参加" />
          <Swatch color={CALENDAR_COLORS.private} label="灰：私密活动" />
        </div>
        <div className="tutorial-color-grid about-color-row">
          <Swatch color={CALENDAR_COLORS.taskUrgent} label="红：逾期 / 24 小时内" />
          <Swatch color={CALENDAR_COLORS.taskSoon} label="黄：3 天内截止" />
          <Swatch color={CALENDAR_COLORS.taskNormal} label="白：正常 / 已完成" />
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-limits-title">
        <h2 id="about-limits-title">明确不做的</h2>
        <ul className="about-list">
          <li>不做 IM、视频会议、附件、评论、多日历。</li>
          <li>不做离线写入；断网时只读或等待重连。</li>
          <li>不做后台推送；Android 只有本地定时通知。</li>
          <li>不做企业级权限与审计、排班考勤。</li>
        </ul>
      </section>

      <section className="about-section" aria-labelledby="about-tech-title">
        <h2 id="about-tech-title">技术栈</h2>
        <p className="muted">
          FastAPI + SQLAlchemy 2.0 + Alembic + SQLite + asyncio 定时扫描 + WebSocket；
          React 19 + Vite + TypeScript + TanStack Query + react-big-calendar；
          Electron 桌面壳；Android 原生 Kotlin WebView 壳 + AlarmManager。
        </p>
      </section>

      <div className="panel-actions">
        <Link to="/app/tutorial" className="btn btn-primary">
          去看新手教程
        </Link>
        <Link to="/app" className="btn btn-secondary">
          返回团队
        </Link>
      </div>
    </section>
  );
}
