import {
  createPersonalEvent,
  localInput,
  shiftDate,
  toUtc,
  updatePersonalEvent,
  type PersonalEvent,
} from "@teamsync/shared";
import { useState } from "react";

import { useEscapeKey } from "../hooks/useEscapeKey";
import { useAction } from "../hooks/useWork";

/** 个人日程编辑弹窗（CR-013）：已移除“参与团队忙闲”开关，默认 share_busy=true。 */
export default function PersonalEventDialog({
  zone,
  event,
  initialStart,
  initialEnd,
  onClose,
  onSaved,
}: {
  zone: string;
  event: PersonalEvent | null;
  initialStart?: string;
  initialEnd?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const action = useAction();
  useEscapeKey(!action.pending, onClose);
  const [defaults] = useState(() => {
    const start = initialStart ?? new Date().toISOString();
    const end = initialEnd ?? new Date(Date.parse(start) + 3600000).toISOString();
    return { start, end };
  });

  return (
    <div className="modal-backdrop">
      <section
        className="work-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={event ? "编辑个人事件" : "新建个人事件"}
      >
        <h3>{event ? "编辑个人事件" : "新建个人事件"}</h3>
        <form
          className="work-form"
          onSubmit={submitEvent => {
            submitEvent.preventDefault();
            const form = new FormData(submitEvent.currentTarget);
            const allDay = form.get("all_day") === "on";
            const startLocal = String(form.get("start"));
            const endLocal = String(form.get("end"));
            const start = allDay ? toUtc(`${startLocal}T00:00`, zone) : toUtc(startLocal, zone);
            const end = allDay ? toUtc(`${shiftDate(endLocal, 1)}T00:00`, zone) : toUtc(endLocal, zone);
            const data = {
              title: String(form.get("title")),
              description: String(form.get("description")) || null,
              location: String(form.get("location")) || null,
              start_at: start,
              end_at: end,
              all_day: allDay,
              share_busy: true,
            };
            void action
              .run(async () => {
                if (event) await updatePersonalEvent(event.id, data);
                else await createPersonalEvent(data);
                onClose();
                await onSaved();
              })
              .catch(() => {});
          }}
        >
          <label>
            标题
            <input name="title" maxLength={100} defaultValue={event?.title} required autoFocus />
          </label>
          <label>
            开始时间
            <input
              name="start"
              type="datetime-local"
              defaultValue={localInput(event?.start_at ?? defaults.start, zone)}
              required
            />
          </label>
          <label>
            结束时间
            <input
              name="end"
              type="datetime-local"
              defaultValue={localInput(event?.end_at ?? defaults.end, zone)}
              required
            />
          </label>
          <label className="checkbox-row">
            <input name="all_day" type="checkbox" defaultChecked={event?.all_day} />
            全天（按你的时区 00:00 到次日 00:00）
          </label>
          <label>
            地点
            <input name="location" maxLength={200} defaultValue={event?.location ?? ""} />
          </label>
          <label>
            描述
            <textarea name="description" maxLength={2000} defaultValue={event?.description ?? ""} />
          </label>
          <p className="muted">
            个人日程默认以“忙碌”参与团队忙闲，队友只能看到时间段、看不到标题（CR-013 起不再提供逐条开关）。
          </p>
          <div className="panel-actions">
            <button className="btn btn-primary" disabled={action.pending}>
              保存
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
