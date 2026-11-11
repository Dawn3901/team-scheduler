import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CalendarTimeline from "./CalendarTimeline";
import { buildSegments, positionAt, layoutEvents, minutes, type TimelineItem } from "../lib/calendarTimeline";

const days = ["2026-11-06"];
const event: TimelineItem = {id:"event",title:"团队会议",start:new Date("2026-11-06T10:00"),end:new Date("2026-11-06T11:00"),color:"#6155e8",allDay:false};

describe("adaptive timeline", () => {
  it("folds long gaps without hiding occupied time and expands a complete gap", () => {
    const occupied = [{start:600,end:660},{start:1080,end:1140}];
    const segments = buildSegments(60,occupied);
    expect(segments.filter(s => s.folded).map(s => [s.start,s.end])).toEqual([[0,600],[660,1080],[1140,1440]]);
    expect(positionAt(segments,660)-positionAt(segments,600)).toBe(56);
    const expanded = buildSegments(60,occupied,["660-1080"]);
    expect(expanded.some(s => s.folded && s.start < 1080 && s.end > 660)).toBe(false);
    expect(positionAt(expanded,1080)-positionAt(expanded,660)).toBe(7*56);
  });

  it("keeps overlapping activities in separate lanes and clips cross-day coordinates", () => {
    const overlap = {...event,id:"overlap",start:new Date("2026-11-06T10:30"),end:new Date("2026-11-06T11:30")};
    const later = {...event,id:"later",start:new Date("2026-11-06T12:00"),end:new Date("2026-11-06T13:00")};
    const layout = layoutEvents([later,overlap,event],days[0]);
    expect(layout.map(entry => [entry.item.id,entry.lane,entry.lanes])).toEqual([["event",0,2],["overlap",1,2],["later",0,1]]);
    expect(minutes(new Date("2026-11-05T23:30"),days[0])).toBe(0);
    expect(minutes(new Date("2026-11-07T00:00"),days[0])).toBe(1440);
    expect(minutes(new Date("2026-11-06T23:30"),days[0])).toBe(1410);
  });

  it("uses wheel zoom, clamps the scale and keeps event selection and slot creation", async () => {
    const onSelect = vi.fn(); const onCreate = vi.fn();
    const user = userEvent.setup();
    render(<CalendarTimeline days={days} items={[event]} today={days[0]} onSelect={onSelect} onCreate={onCreate} />);
    const eventButton = screen.getByRole("button", { name: /团队会议/ });
    expect(eventButton.style.getPropertyValue("--event-text")).toBe("#111827");
    const viewport = screen.getByLabelText(/可缩放时间轴/);
    expect(screen.getByRole("status")).toHaveTextContent("1 小时");
    fireEvent.wheel(viewport,{deltaY:-100,clientY:100});
    expect(screen.getByRole("status")).toHaveTextContent("30 分钟");
    fireEvent.wheel(viewport,{deltaY:-100});
    expect(screen.getByRole("status")).toHaveTextContent("15 分钟");
    fireEvent.wheel(viewport,{deltaY:-100});
    expect(screen.getByRole("button",{name:"放大时间轴"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:/团队会议/}));
    expect(onSelect).toHaveBeenCalledWith(event);
    await user.click(screen.getByRole("button",{name:"2026-11-06 10:15 新建活动"}));
    expect(onCreate).toHaveBeenCalledWith(new Date("2026-11-06T10:15"));
    for (let i=0;i<4;i++) fireEvent.wheel(viewport,{deltaY:100});
    expect(screen.getByRole("status")).toHaveTextContent("2 小时");
    expect(screen.getByRole("button",{name:"缩小时间轴"})).toBeDisabled();
  });

  it("keeps cross-midnight events and all-day deadlines visible", () => {
    const overnight = {...event,id:"night",title:"跨天活动",start:new Date("2026-11-05T23:00"),end:new Date("2026-11-06T01:00")};
    const task = {...event,id:"task",title:"任务截止",allDay:true,start:new Date("2026-11-06T00:00"),end:new Date("2026-11-07T00:00")};
    render(<CalendarTimeline days={days} items={[overnight,task]} today={days[0]} onSelect={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByRole("button",{name:/跨天活动/})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"任务截止"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"2026-11-06 00:00 新建活动"})).toBeInTheDocument();
  });

  it("keeps member columns, assigned deadlines and private busy blocks separate", () => {
    const first = {...event,resourceId:1};
    const second = {...event,id:"second",title:"另一个成员的会议",resourceId:2};
    const task = {...event,id:"task",title:"任务 · 截止",allDay:true,resourceId:2};
    const busy = {...event,id:"private",title:"私密忙碌",resourceId:2};
    const {container} = render(<CalendarTimeline days={days} items={[first,second,task]} backgroundItems={[busy]} today={days[0]}
      columns={[{id:"one",day:days[0],resourceId:1,header:"成员一"},{id:"two",day:days[0],resourceId:2,header:"成员二"}]}
      onSelect={vi.fn()} onCreate={vi.fn()} />);
    const columns = container.querySelectorAll<HTMLElement>(".timeline-event-column");
    expect(within(columns[0]).getByRole("button",{name:/团队会议/})).toBeInTheDocument();
    expect(within(columns[0]).queryByRole("button",{name:/另一个成员的会议/})).not.toBeInTheDocument();
    expect(within(columns[1]).getByRole("button",{name:/另一个成员的会议/})).toBeInTheDocument();
    expect(columns[0].querySelector(".timeline-busy-block")).toBeNull();
    expect(columns[1].querySelector(".timeline-busy-block")).toHaveAttribute("title","私密忙碌");
    const deadlineColumns = container.querySelectorAll<HTMLElement>(".timeline-allday > div");
    expect(within(deadlineColumns[0]).queryByRole("button")).toBeNull();
    expect(within(deadlineColumns[1]).getByRole("button",{name:"任务 · 截止"})).toBeInTheDocument();
  });

  it("expands folded gaps and supports button zoom without a mouse wheel", async () => {
    const user = userEvent.setup();
    render(<CalendarTimeline days={days} items={[event]} today={days[0]} onSelect={vi.fn()} onCreate={vi.fn()} />);
    await user.click(screen.getByRole("button",{name:/00:00 — 10:00/}));
    expect(screen.getByRole("button",{name:"2026-11-06 03:00 新建活动"})).toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:"重新折叠空闲时段"}));
    expect(screen.queryByRole("button",{name:"2026-11-06 03:00 新建活动"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:"放大时间轴"}));
    expect(screen.getByRole("status")).toHaveTextContent("30 分钟");
  });
});
