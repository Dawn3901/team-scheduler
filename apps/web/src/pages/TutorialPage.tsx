import { Link } from "react-router-dom";

import { CALENDAR_COLORS, textColorFor } from "../lib/calendarColors";

const steps = [
  {
    title: "建团队 / 加入团队",
    text: "创建团队后把 8 位邀请码发给队友；队友注册后输入邀请码加入。Owner 管理角色，Admin 协助管理成员。",
  },
  {
    title: "看懂日历颜色",
    text: "蓝色活动需要你参加，绿色不需要，灰色是私密活动；任务红色最紧急、黄色临近、白色正常。",
  },
  {
    title: "建活动并邀请",
    text: "点“新建活动”填时间；邀请成员可逐个勾选或“邀请全员”。保存时冲突只提示，不阻止你强制创建。",
  },
  {
    title: "回应邀请与忙闲",
    text: "活动详情里接受 / 待定 / 拒绝。周视图勾选“显示周忙闲”可看成员忙碌块；私密活动只显示忙碌。",
  },
  {
    title: "任务与截止",
    text: "任务看板建任务、指派负责人、设截止；截止日会出现在日历。逾期或临近截止会变色并提醒。",
  },
  {
    title: "通知与三端",
    text: "铃铛看未读通知；桌面端关窗进托盘并弹系统通知；Android 用本地定时通知，点通知打开对应活动/任务。",
  },
];

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="tutorial-swatch" style={{ backgroundColor: color, color: textColorFor(color) }}>
      {label}
    </span>
  );
}

export default function TutorialPage() {
  return (
    <section className="panel tutorial-page">
      <div className="page-head compact">
        <div>
          <p className="eyebrow">新手教程</p>
          <h1>5 分钟上手同频</h1>
          <p className="muted">按顺序看一遍，再回到团队开始用。</p>
        </div>
        <Link to="/app" className="btn btn-secondary">
          返回团队
        </Link>
      </div>

      <div className="tutorial-steps">
        {steps.map((step, index) => (
          <article className="tutorial-step" key={step.title}>
            <span className="tutorial-step-number" aria-hidden="true">{index + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </article>
        ))}
      </div>

      <section className="tutorial-colors" aria-labelledby="tutorial-colors-title">
        <h2 id="tutorial-colors-title">日历颜色速查</h2>
        <h3>活动</h3>
        <div className="tutorial-color-grid">
          <Swatch color={CALENDAR_COLORS.attending} label="蓝色：需要我参加（含我自己的私密活动）" />
          <Swatch color={CALENDAR_COLORS.notAttending} label="绿色：不需要我参加 / 已拒绝" />
          <Swatch color={CALENDAR_COLORS.private} label="灰色：别人的私密活动（只看到忙碌）" />
        </div>
        <h3>任务截止</h3>
        <div className="tutorial-color-grid">
          <Swatch color={CALENDAR_COLORS.taskUrgent} label="红色：已逾期 / 24 小时内" />
          <Swatch color={CALENDAR_COLORS.taskSoon} label="黄色：3 天内截止" />
          <Swatch color={CALENDAR_COLORS.taskNormal} label="白色：正常 / 已完成" />
        </div>
      </section>

      <div className="panel-actions">
        <Link to="/app" className="btn btn-primary">
          开始使用
        </Link>
      </div>
    </section>
  );
}
