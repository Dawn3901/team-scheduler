/* TeamSync static demo — all data is fictional, all state is in-memory. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- constants
  const CURRENT_USER = 'lin';
  const DEMO_TODAY = new Date(2026, 10, 4); // Wednesday, 2026-11-04
  const HOUR_START = 8;
  const HOUR_END = 20;
  const HOURS = HOUR_END - HOUR_START;
  const HOUR_H = 54;
  const VIEW_LABELS = { calendar: '团队日历', tasks: '任务看板', members: '团队成员', notifications: '通知中心', settings: '团队设置' };
  const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', member: 'Member' };
  const STATUS_LABELS = { pending: '待回应', accepted: '已接受', declined: '已拒绝', tentative: '待定' };
  const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const WEEKDAY_NARROW = ['日', '一', '二', '三', '四', '五', '六'];

  const members = [
    { id: 'lin', name: '林知远', short: '林', role: 'owner', title: '产品 & 前端', color: '#5b5bd6', joined: '2026-10-20' },
    { id: 'chen', name: '陈一诺', short: '陈', role: 'admin', title: '后端 & 数据', color: '#0f9f8f', joined: '2026-10-21' },
    { id: 'wang', name: '王可', short: '王', role: 'member', title: '测试 & 三端', color: '#d97706', joined: '2026-10-23' }
  ];

  const team = {
    name: '软工大作业',
    description: '6 周课程项目 · 团队日程与轻量任务',
    inviteCode: 'TS8K2M4Q',
    timezone: 'Asia/Shanghai'
  };

  function dt(value) {
    const [date, time] = value.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }

  const seedEvents = [
    {
      id: 'e1', title: '团队周会', start: dt('2026-11-02T09:30'), end: dt('2026-11-02T10:30'),
      creator: 'lin', location: '图书馆 3F 讨论间', visibility: 'team',
      description: '同步本周目标、分工与风险。每人用 2 分钟说明进展和阻塞。',
      participants: [{ id: 'lin', status: 'accepted' }, { id: 'chen', status: 'accepted' }, { id: 'wang', status: 'accepted' }]
    },
    {
      id: 'e2', title: '需求评审', start: dt('2026-11-02T14:00'), end: dt('2026-11-02T15:30'),
      creator: 'chen', location: '线上 · 腾讯会议', visibility: 'team',
      description: '过一遍 PRD 的 P0 范围，确认「不做清单」。',
      participants: [{ id: 'chen', status: 'accepted' }, { id: 'lin', status: 'pending' }, { id: 'wang', status: 'accepted' }]
    },
    {
      id: 'e3', title: '课程实验', start: dt('2026-11-03T10:00'), end: dt('2026-11-03T11:30'),
      creator: 'wang', location: '实验楼 B204', visibility: 'team',
      description: '操作系统实验，带上实验报告。',
      participants: [{ id: 'wang', status: 'accepted' }]
    },
    {
      id: 'e4', title: '组队讨论', start: dt('2026-11-03T16:00'), end: dt('2026-11-03T17:00'),
      creator: 'lin', location: '图书馆 2F', visibility: 'team',
      description: '确定演示脚本和分工。',
      participants: [{ id: 'lin', status: 'accepted' }, { id: 'wang', status: 'accepted' }]
    },
    {
      id: 'e5', title: '英语课', start: dt('2026-11-04T09:00'), end: dt('2026-11-04T10:00'),
      creator: 'chen', location: '教学楼 A301', visibility: 'team',
      description: '',
      participants: [{ id: 'chen', status: 'accepted' }]
    },
    {
      id: 'e6', title: '课程实验', start: dt('2026-11-04T14:00'), end: dt('2026-11-04T16:00'),
      creator: 'wang', location: '实验楼 B204', visibility: 'team',
      description: '数据库实验，验收第 3 次作业。',
      participants: [{ id: 'wang', status: 'accepted' }]
    },
    {
      id: 'e7', title: '产品草图', start: dt('2026-11-04T15:00'), end: dt('2026-11-04T16:00'),
      creator: 'lin', location: '宿舍 · 线上', visibility: 'team',
      description: '把日历页和忙闲视图的线框补完。',
      participants: [{ id: 'lin', status: 'accepted' }, { id: 'chen', status: 'tentative' }]
    },
    {
      id: 'e8', title: '医院复查', start: dt('2026-11-05T10:00'), end: dt('2026-11-05T11:00'),
      creator: 'chen', location: '市一医院', visibility: 'private',
      description: '个人安排，不公开详情。',
      participants: [{ id: 'chen', status: 'accepted' }]
    },
    {
      id: 'e9', title: '软工答疑', start: dt('2026-11-05T14:00'), end: dt('2026-11-05T15:30'),
      creator: 'lin', location: '教学楼 A301', visibility: 'team',
      description: '带着问题和进度去，别空手。',
      participants: [{ id: 'lin', status: 'accepted' }, { id: 'chen', status: 'accepted' }, { id: 'wang', status: 'accepted' }]
    },
    {
      id: 'e10', title: '迭代评审', start: dt('2026-11-06T09:30'), end: dt('2026-11-06T11:00'),
      creator: 'chen', location: '图书馆 3F 讨论间', visibility: 'team',
      description: '过一遍本周完成项，确认下周排期。',
      participants: [{ id: 'chen', status: 'accepted' }, { id: 'lin', status: 'pending' }, { id: 'wang', status: 'accepted' }]
    },
    {
      id: 'e11', title: '小组自习', start: dt('2026-11-06T15:00'), end: dt('2026-11-06T16:30'),
      creator: 'wang', location: '图书馆 2F', visibility: 'team',
      description: '各自写文档，最后 20 分钟互相 review。',
      participants: [{ id: 'wang', status: 'accepted' }, { id: 'lin', status: 'accepted' }]
    },
    {
      id: 'e12', title: '项目冲刺', start: dt('2026-11-07T10:00'), end: dt('2026-11-07T12:00'),
      creator: 'lin', location: '线上', visibility: 'team',
      description: '把演示链路完整跑通，留录屏。',
      participants: [{ id: 'lin', status: 'accepted' }, { id: 'chen', status: 'accepted' }, { id: 'wang', status: 'accepted' }]
    },
    {
      id: 'e13', title: '需求冻结', start: dt('2026-11-06T00:00'), end: dt('2026-11-07T00:00'),
      creator: 'chen', location: '', visibility: 'team', allDay: true,
      description: 'P0 范围不再新增，只修 bug。',
      participants: [{ id: 'chen', status: 'accepted' }, { id: 'lin', status: 'accepted' }, { id: 'wang', status: 'accepted' }]
    }
  ];

  const seedTasks = [
    { id: 't1', title: '完成概要设计', assignee: 'lin', due: dt('2026-11-06T18:00'), priority: 'high', status: 'doing', tag: '文档' },
    { id: 't2', title: '接口契约评审', assignee: 'chen', due: dt('2026-11-03T20:00'), priority: 'high', status: 'todo', tag: '后端' },
    { id: 't3', title: '准备演示数据', assignee: 'wang', due: dt('2026-11-05T18:00'), priority: 'normal', status: 'todo', tag: '演示' },
    { id: 't4', title: '整理会议纪要', assignee: 'lin', due: dt('2026-11-02T20:00'), priority: 'low', status: 'done', tag: '协作' },
    { id: 't5', title: 'Android 通知联调', assignee: 'chen', due: dt('2026-11-07T12:00'), priority: 'high', status: 'todo', tag: '三端' },
    { id: 't6', title: '写用户手册', assignee: 'wang', due: dt('2026-11-08T20:00'), priority: 'normal', status: 'doing', tag: '文档' },
    { id: 't7', title: '确认演示账号', assignee: 'lin', due: dt('2026-11-04T21:00'), priority: 'normal', status: 'todo', tag: '演示' }
  ];

  const seedNotifications = [
    { id: 'n1', type: 'invite', title: '陈一诺邀请你参加「需求评审」', body: '11月2日 14:00 · 线上 · 腾讯会议', time: '10 分钟前', read: false, eventId: 'e2' },
    { id: 'n2', type: 'task', title: '林知远把「完成概要设计」指派给你', body: '截止 11月6日 18:00 · 高优先级', time: '1 小时前', read: false, taskId: 't1' },
    { id: 'n3', type: 'reminder', title: '「团队周会」将在 15 分钟后开始', body: '11月2日 09:30 · 图书馆 3F 讨论间', time: '昨天', read: false, eventId: 'e1' },
    { id: 'n4', type: 'member', title: '王可加入了团队', body: '角色：Member · 通过邀请码加入', time: '2 天前', read: true }
  ];

  // ---------------------------------------------------------------- state
  const state = {
    view: 'calendar',
    calendarView: 'week',
    currentDate: new Date(DEMO_TODAY),
    selectedMembers: new Set(members.map(m => m.id)),
    onlyMine: false,
    taskFilter: 'all',
    notificationFilter: 'all',
    search: '',
    events: [],
    tasks: [],
    notifications: [],
    pendingEvent: null,
    settings: { invites: true, tasks: true, digest: false },
    sidebarOpen: false
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const modalRoot = $('#modal-root');
  const toastRoot = $('#toast-root');
  const content = $('#content');
  const searchInput = $('#global-search');
  const searchResults = $('#search-results');
  const notificationPopover = $('#notification-popover');
  const sidebar = $('#sidebar');
  const sidebarScrim = $('#sidebar-scrim');

  function cloneEvent(event) {
    return {
      ...event,
      start: new Date(event.start),
      end: new Date(event.end),
      participants: event.participants.map(p => ({ ...p }))
    };
  }

  function resetData() {
    state.events = seedEvents.map(cloneEvent);
    state.tasks = seedTasks.map(t => ({ ...t, due: new Date(t.due) }));
    state.notifications = seedNotifications.map(n => ({ ...n }));
  }

  // ---------------------------------------------------------------- helpers
  const pad = n => String(n).padStart(2, '0');
  const memberById = id => members.find(m => m.id === id);
  const memberName = id => memberById(id)?.name || '未知成员';
  const memberShort = id => memberById(id)?.short || '?';
  const memberColor = id => memberById(id)?.color || '#6366f1';
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timeKey = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const isWeekend = d => d.getDay() === 0 || d.getDay() === 6;
  const isToday = d => sameDay(d, DEMO_TODAY);

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function startOfWeek(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return d;
  }

  function weekDays(date = state.currentDate) {
    const start = startOfWeek(date);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  function fmtDateShort(d) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function fmtDateFull(d) {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function fmtTime(d) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtWeekRange(date = state.currentDate) {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`;
  }

  function fmtMonthTitle(date = state.currentDate) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  }

  function fmtDayTitle(date = state.currentDate) {
    return `${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAY_SHORT[date.getDay()]}`;
  }

  function durationLabel(start, end) {
    const mins = Math.max(0, Math.round((end - start) / 60000));
    if (mins < 60) return `${mins} 分钟`;
    const hours = mins / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
  }

  function dueLabel(date) {
    if (sameDay(date, DEMO_TODAY)) return `今天 ${fmtTime(date)}`;
    if (sameDay(date, addDays(DEMO_TODAY, 1))) return `明天 ${fmtTime(date)}`;
    return `${fmtDateShort(date)} ${fmtTime(date)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function icon(name, cls = '') {
    return `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function avatar(member, size = '') {
    if (!member) return '';
    return `<span class="avatar avatar-${member.id} ${size}" title="${escapeHtml(member.name)}">${escapeHtml(member.short)}</span>`;
  }

  function rolePill(role) {
    const cls = role === 'owner' ? 'pill-indigo' : role === 'admin' ? 'pill-teal' : 'pill-gray';
    return `<span class="pill ${cls}">${ROLE_LABELS[role] || role}</span>`;
  }

  function statusPill(status) {
    return `<span class="status-chip status-${status}">${STATUS_LABELS[status] || status}</span>`;
  }

  function isParticipant(event, userId = CURRENT_USER) {
    return event.creator === userId || event.participants.some(p => p.id === userId);
  }

  function participantStatus(event, userId = CURRENT_USER) {
    return event.participants.find(p => p.id === userId)?.status || null;
  }

  function canView(event, userId = CURRENT_USER) {
    if (event.visibility !== 'private') return true;
    return event.creator === userId || event.participants.some(p => p.id === userId);
  }

  function isMasked(event) {
    return !canView(event);
  }

  function eventMemberIds(event) {
    return new Set([event.creator, ...event.participants.map(p => p.id)]);
  }

  function eventOverlaps(event, start, end) {
    return event.start < end && event.end > start;
  }

  function eventsForDay(day) {
    return state.events
      .filter(e => !e.allDay && eventOverlaps(e, new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0), addDays(day, 1)))
      .sort((a, b) => a.start - b.start);
  }

  function filteredEvents() {
    return state.events.filter(event => {
      const ids = eventMemberIds(event);
      if (![...ids].some(id => state.selectedMembers.has(id))) return false;
      if (state.onlyMine && !ids.has(CURRENT_USER)) return false;
      return true;
    });
  }

  function filteredTasks() {
    return state.tasks.filter(task => {
      if (!state.selectedMembers.has(task.assignee)) return false;
      if (state.onlyMine && task.assignee !== CURRENT_USER) return false;
      return true;
    });
  }

  function tasksForDay(day) {
    return filteredTasks().filter(task => sameDay(task.due, day) && task.status !== 'done');
  }

  function pendingInvites() {
    return state.events
      .filter(e => e.creator !== CURRENT_USER && participantStatus(e) === 'pending')
      .sort((a, b) => a.start - b.start);
  }

  function unreadCount() {
    return state.notifications.filter(n => !n.read).length;
  }

  function pendingTaskCount() {
    return state.tasks.filter(t => t.status !== 'done').length;
  }

  // ---------------------------------------------------------------- layout
  function layoutEvents(events) {
    const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
    const columnEnds = [];
    const placed = sorted.map(event => {
      let col = columnEnds.findIndex(end => end <= event.start);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(event.end);
      } else {
        columnEnds[col] = event.end;
      }
      return { ...event, _column: col };
    });
    const total = Math.max(1, columnEnds.length);
    return placed.map(event => ({
      ...event,
      _left: (event._column / total) * 100,
      _width: 100 / total
    }));
  }

  function eventBlock(event, day, layout = null) {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), HOUR_START, 0);
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), HOUR_END, 0);
    const start = Math.max(event.start.getTime(), dayStart.getTime());
    const end = Math.min(event.end.getTime(), dayEnd.getTime());
    if (end <= start) return '';
    const top = ((start - dayStart.getTime()) / 3600000) * HOUR_H;
    const height = Math.max(22, ((end - start) / 3600000) * HOUR_H - 2);
    const masked = isMasked(event);
    const color = masked ? '#94a3b8' : memberColor(event.creator);
    const position = layout
      ? `left:calc(${layout._left}% + 2px);width:calc(${layout._width}% - 4px);`
      : '';
    const title = masked ? `${icon('lock')} 忙碌` : escapeHtml(event.title);
    const time = masked ? '私密安排' : `${fmtTime(event.start)} – ${fmtTime(event.end)}`;
    return `<div class="event-block ${masked ? 'masked' : ''} ${height < 38 ? 'short' : ''}"
      style="--event-color:${color};top:${top}px;height:${height}px;${position}"
      data-action="open-event" data-id="${event.id}"
      title="${escapeHtml(masked ? '私密安排，仅显示忙碌' : `${event.title} · ${time}`)}">
      <span class="event-title">${title}</span>
      ${height >= 34 ? `<span class="event-time">${time}</span>` : ''}
    </div>`;
  }

  function allDayChip(event) {
    const masked = isMasked(event);
    const color = masked ? '#94a3b8' : memberColor(event.creator);
    return `<button type="button" class="all-day-chip" style="--event-color:${color}" data-action="open-event" data-id="${event.id}" title="${escapeHtml(masked ? '私密安排' : event.title)}">
      ${masked ? icon('lock') : ''}${masked ? '忙碌' : escapeHtml(event.title)}
    </button>`;
  }

  function taskChip(task) {
    return `<button type="button" class="task-chip" data-action="open-task" data-id="${task.id}" title="${escapeHtml(task.title)} · ${dueLabel(task.due)}">
      ${icon('check-square')}${escapeHtml(task.title)}
    </button>`;
  }

  function timeLabels() {
    return Array.from({ length: HOURS }, (_, i) => {
      const hour = HOUR_START + i;
      return `<span class="time-label" style="top:${i * HOUR_H}px">${pad(hour)}:00</span>`;
    }).join('');
  }

  // ---------------------------------------------------------------- shell
  function updateShell() {
    $('#breadcrumb').textContent = VIEW_LABELS[state.view] || '团队日历';
    const teamNameEl = $('.team-info strong');
    if (teamNameEl) teamNameEl.textContent = team.name;
    const teamCrumb = $('.breadcrumb span');
    if (teamCrumb) teamCrumb.textContent = team.name;
    $$('[data-nav]').forEach(btn => btn.classList.toggle('active', btn.dataset.nav === state.view));
    const unread = unreadCount();
    const bell = $('#bell-badge');
    const navBadge = $('#nav-badge');
    if (bell) {
      bell.textContent = String(unread);
      bell.hidden = unread === 0;
    }
    if (navBadge) {
      navBadge.textContent = String(unread);
      navBadge.hidden = unread === 0;
    }
    const pending = $('#pending-count');
    if (pending) {
      pending.textContent = String(pendingInvites().length);
      pending.hidden = pendingInvites().length === 0;
    }
    sidebar.classList.toggle('open', state.sidebarOpen);
    if (sidebarScrim) sidebarScrim.classList.toggle('show', state.sidebarOpen);
  }

  function renderContent() {
    let html = '';
    if (state.view === 'calendar') html = renderCalendarView();
    else if (state.view === 'tasks') html = renderTasksView();
    else if (state.view === 'members') html = renderMembersView();
    else if (state.view === 'notifications') html = renderNotificationsView();
    else html = renderSettingsView();
    content.innerHTML = html;
    updateShell();
    if (!notificationPopover.hidden) renderNotificationPopover();
    if (state.search) renderSearchResults();
  }

  function render() {
    renderContent();
  }

  function navigate(view) {
    state.view = view;
    state.sidebarOpen = false;
    sidebar.classList.remove('open');
    notificationPopover.hidden = true;
    clearSearch(true);
    render();
  }

  function clearSearch(resetInput = true) {
    state.search = '';
    if (resetInput && searchInput) searchInput.value = '';
    if (searchResults) searchResults.hidden = true;
  }

  // ---------------------------------------------------------------- calendar
  function memberChips() {
    const allSelected = state.selectedMembers.size === members.length;
    const chips = members.map(member => `
      <button type="button" class="member-chip ${state.selectedMembers.has(member.id) ? 'active' : ''}" data-action="toggle-member" data-id="${member.id}">
        ${avatar(member, 'avatar-xs')}<span>${escapeHtml(member.name)}</span>
      </button>`).join('');
    return `
      <button type="button" class="member-chip chip-all ${allSelected && !state.onlyMine ? 'active' : ''}" data-action="select-all-members"><span class="dot"></span>全部</button>
      ${chips}
      <span class="filter-sep"></span>
      <button type="button" class="toggle-chip ${state.onlyMine ? 'active' : ''}" data-action="toggle-only-mine">${icon('users')}只看我的</button>
      <span class="calendar-legend"><span class="legend-dot" style="background:#6366f1"></span>林 <span class="legend-dot" style="background:#14b8a6;margin-left:6px"></span>陈 <span class="legend-dot" style="background:#f59e0b;margin-left:6px"></span>王</span>`;
  }

  function calendarSubtitle() {
    const count = filteredEvents().length;
    if (state.calendarView === 'week') return `${fmtWeekRange()} · ${count} 个活动 · ${state.selectedMembers.size} 位成员`;
    if (state.calendarView === 'month') return `${fmtMonthTitle()} · ${count} 个活动 · ${state.selectedMembers.size} 位成员`;
    return `${fmtDayTitle()} · ${count} 个活动 · ${state.selectedMembers.size} 位成员`;
  }

  function renderCalendarView() {
    return `
      <div class="calendar-layout">
        <section class="calendar-card">
          <div class="calendar-head">
            <div class="calendar-title"><h1>团队日历</h1><p>${calendarSubtitle()}</p></div>
            <div class="calendar-tools">
              <div class="nav-arrows">
                <button class="icon-btn" data-action="cal-prev" aria-label="上一页">${icon('chevron-left')}</button>
                <button class="btn btn-sm" data-action="cal-today">今天</button>
                <button class="icon-btn" data-action="cal-next" aria-label="下一页">${icon('chevron-right')}</button>
              </div>
              <div class="segmented" role="group" aria-label="日历视图">
                <button class="${state.calendarView === 'month' ? 'active' : ''}" data-action="set-cal-view" data-view="month">月</button>
                <button class="${state.calendarView === 'week' ? 'active' : ''}" data-action="set-cal-view" data-view="week">周</button>
                <button class="${state.calendarView === 'day' ? 'active' : ''}" data-action="set-cal-view" data-view="day">日</button>
              </div>
              <button class="btn btn-sm btn-ghost" data-action="demo-conflict">${icon('spark')}冲突演示</button>
              <button class="btn btn-sm btn-primary" data-action="open-create">${icon('plus')}新建活动</button>
            </div>
          </div>
          <div class="filter-bar">${memberChips()}</div>
          ${state.calendarView === 'week' ? renderWeek() : state.calendarView === 'month' ? renderMonth() : renderDay()}
        </section>
        ${renderRightPanel()}
      </div>`;
  }

  function renderWeek() {
    const days = weekDays();
    const allDayEvents = filteredEvents().filter(e => e.allDay);
    return `<div class="week-hint">${icon('chevron-left')} 横滑查看整周 ${icon('chevron-right')}</div>
    <div class="week-view"><div class="week-canvas">
      <div class="week-header">
        <div class="week-head-cell"></div>
        ${days.map(day => `
          <div class="week-head-cell ${isToday(day) ? 'is-today' : ''} ${isWeekend(day) ? 'is-weekend' : ''}">
            <span class="weekday">${WEEKDAY_NARROW[day.getDay()]}</span>
            <span class="date-num">${day.getDate()}</span>
          </div>`).join('')}
      </div>
      <div class="all-day-row">
        <div class="all-day-label">全天</div>
        ${days.map(day => `
          <div class="all-day-cell">
            ${allDayEvents.filter(e => sameDay(e.start, day)).map(allDayChip).join('')}
            ${tasksForDay(day).map(taskChip).join('')}
          </div>`).join('')}
      </div>
      <div class="week-scroll"><div class="week-body">
        <div class="time-axis">${timeLabels()}</div>
        ${days.map(day => {
          const events = layoutEvents(filteredEvents().filter(e => !e.allDay && eventOverlaps(e, day, addDays(day, 1))));
          return `<div class="day-body ${isToday(day) ? 'is-today' : ''} ${isWeekend(day) ? 'is-weekend' : ''}" data-day="${dateKey(day)}">
            ${events.map(e => eventBlock(e, day, e)).join('')}
          </div>`;
        }).join('')}
      </div></div>
    </div></div>`;
  }

  function renderMonth() {
    const first = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
    const start = startOfWeek(first);
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const events = filteredEvents();
    return `<div class="month-view"><div class="month-canvas">
      <div class="month-weekdays">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="month-grid">
        ${days.map(day => {
          const dayEvents = events.filter(e => sameDay(e.start, day) || (e.allDay && e.start <= day && e.end > day));
          const dayTasks = tasksForDay(day);
          const visibleEvents = dayEvents.slice(0, 3);
          return `<div class="month-cell ${sameMonth(day, state.currentDate) ? '' : 'out'} ${isToday(day) ? 'is-today' : ''}" data-action="open-day" data-date="${dateKey(day)}">
            <div class="month-date"><span>${day.getDate()}</span>${isToday(day) ? '<span class="month-today-dot"></span>' : ''}</div>
            <div class="month-events">
              ${visibleEvents.map(e => `<button type="button" class="month-event ${isMasked(e) ? 'masked' : ''}" style="--event-color:${isMasked(e) ? '#94a3b8' : memberColor(e.creator)}" data-action="open-event" data-id="${e.id}">${isMasked(e) ? icon('lock') : ''}${isMasked(e) ? '忙碌' : escapeHtml(e.title)}</button>`).join('')}
              ${dayEvents.length > 3 ? `<span class="month-more">+${dayEvents.length - 3} 更多</span>` : ''}
              ${dayTasks.length ? `<span class="month-task" title="有任务截止"></span> ${dayTasks.length} 个任务` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div></div>`;
  }

  function renderDay() {
    const day = state.currentDate;
    const visibleMembers = members.filter(m => state.selectedMembers.has(m.id) && (!state.onlyMine || m.id === CURRENT_USER));
    if (!visibleMembers.length) {
      return `<div class="day-view"><div class="empty-state"><div class="empty-icon">${icon('users')}</div><strong>还没有筛选成员</strong><p>选择至少一位成员查看当天日程。</p></div></div>`;
    }
    const allDayEvents = filteredEvents().filter(e => e.allDay && e.start <= day && e.end > day);
    return `<div class="day-view"><div class="day-canvas" style="--day-cols:${visibleMembers.length}">
      <div class="day-header">
        <div class="week-head-cell"></div>
        ${visibleMembers.map(m => `<div class="day-member-head">${avatar(m, 'avatar-sm')}<div class="member-name"><strong>${escapeHtml(m.name)}</strong><small>${escapeHtml(m.title)}</small></div></div>`).join('')}
      </div>
      <div class="day-all-day">
        <div class="all-day-label">全天</div>
        ${visibleMembers.map(m => `<div class="all-day-cell">${allDayEvents.filter(e => isParticipant(e, m.id)).map(allDayChip).join('')}${tasksForDay(day).filter(t => t.assignee === m.id).map(taskChip).join('')}</div>`).join('')}
      </div>
      <div class="week-scroll"><div class="day-body-wrap">
        <div class="time-axis">${timeLabels()}</div>
        ${visibleMembers.map(m => {
          const events = layoutEvents(filteredEvents().filter(e => !e.allDay && isParticipant(e, m.id) && eventOverlaps(e, day, addDays(day, 1))));
          return `<div class="day-col">${events.map(e => eventBlock(e, day, null)).join('')}</div>`;
        }).join('')}
      </div></div>
    </div></div>`;
  }

  function busyHoursOnDay(memberId, day) {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), HOUR_START, 0);
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), HOUR_END, 0);
    let minutes = 0;
    state.events.forEach(event => {
      if (event.allDay || !isParticipant(event, memberId)) return;
      if (!eventOverlaps(event, dayStart, dayEnd)) return;
      const start = Math.max(event.start.getTime(), dayStart.getTime());
      const end = Math.min(event.end.getTime(), dayEnd.getTime());
      if (end > start) minutes += (end - start) / 60000;
    });
    return minutes / 60;
  }

  function busyHoursForWeek(memberId) {
    return weekDays().reduce((sum, day) => sum + busyHoursOnDay(memberId, day), 0);
  }

  function renderRightPanel() {
    const todayEvents = state.events.filter(e => sameDay(e.start, DEMO_TODAY) && !e.allDay);
    const todayTasks = state.tasks.filter(t => sameDay(t.due, DEMO_TODAY) && t.status !== 'done');
    const invites = pendingInvites();
    const miniTasks = state.tasks.filter(t => t.status !== 'done').sort((a, b) => a.due - b.due).slice(0, 4);
    const days = weekDays();
    const totalBusy = members.reduce((sum, m) => sum + busyHoursForWeek(m.id), 0);

    const hero = `<div class="hero-card">
      <div class="hero-kicker"><span class="pulse"></span>今天 · 演示日</div>
      <div class="hero-date">${DEMO_TODAY.getMonth() + 1}月${DEMO_TODAY.getDate()}日<small>${WEEKDAY_SHORT[DEMO_TODAY.getDay()]}</small></div>
      <div class="hero-meta">
        <span>${icon('clock')}${todayEvents.length} 个活动</span>
        <span>${icon('check-square')}${todayTasks.length} 个待办</span>
      </div>
      <button class="hero-btn" data-action="go-today">查看今日 ${icon('arrow-right')}</button>
    </div>`;

    const inviteCard = `<div class="panel-card">
      <div class="panel-head"><h3>${icon('bell')}待回应邀请 <span class="pill pill-amber">${invites.length}</span></h3><button class="panel-action" data-nav="notifications">通知中心</button></div>
      ${invites.length ? `<div class="invite-list">${invites.slice(0, 3).map(event => `
        <div class="invite-item" data-action="open-event" data-id="${event.id}">
          ${avatar(memberById(event.creator), 'avatar-sm')}
          <div class="invite-text"><strong>${escapeHtml(event.title)}</strong><small>${icon('clock')}${fmtDateShort(event.start)} ${fmtTime(event.start)}</small></div>
          <div class="invite-actions">
            <button class="mini-icon accept" data-action="rsvp" data-id="${event.id}" data-status="accepted" title="接受">${icon('check')}</button>
            <button class="mini-icon decline" data-action="rsvp" data-id="${event.id}" data-status="declined" title="拒绝">${icon('x')}</button>
          </div>
        </div>`).join('')}</div>` : `<div class="empty-state" style="padding:14px 8px"><strong>没有待回应邀请</strong><p>新的邀请会出现在这里。</p></div>`}
    </div>`;

    const taskCard = `<div class="panel-card">
      <div class="panel-head"><h3>${icon('check-square')}本周任务 <span class="pill pill-gray">${pendingTaskCount()}</span></h3><button class="panel-action" data-nav="tasks">看板</button></div>
      <div class="task-mini-list">${miniTasks.map(task => `
        <div class="task-mini" data-action="open-task" data-id="${task.id}">
          <button class="check-btn ${task.status === 'done' ? 'checked' : ''}" data-action="toggle-task" data-id="${task.id}" aria-label="完成任务">${icon('check')}</button>
          <div class="task-mini-text"><strong>${escapeHtml(task.title)}</strong><small>${icon('clock')}${dueLabel(task.due)}</small></div>
          ${avatar(memberById(task.assignee), 'avatar-xs')}
        </div>`).join('')}</div>
    </div>`;

    const busyCard = `<div class="panel-card">
      <div class="panel-head"><h3>${icon('grid')}团队忙闲</h3><span class="muted" style="font-size:9px">${totalBusy.toFixed(1)}h 总忙碌</span></div>
      <div class="busy-chart">${members.map(member => `
        <div class="busy-row">
          <div class="busy-name">${avatar(member, 'avatar-xs')}${escapeHtml(member.short)}</div>
          <div class="busy-cells">${days.map(day => {
            const hours = busyHoursOnDay(member.id, day);
            const height = Math.min(100, Math.round(hours / 8 * 100));
            return `<div class="busy-cell" title="${escapeHtml(member.name)} · ${fmtDateShort(day)} · ${hours.toFixed(1)} 小时"><div class="busy-bar" style="--member-color:${member.color};height:${height}%"></div></div>`;
          }).join('')}</div>
        </div>`).join('')}</div>
      <div class="busy-days">${days.map(day => `<span>${WEEKDAY_NARROW[day.getDay()]}</span>`).join('')}</div>
      <div class="busy-legend"><span>越满越忙</span><span>私密安排只显示忙碌</span></div>
    </div>`;

    return `<aside class="right-panel">${hero}${inviteCard}${taskCard}${busyCard}</aside>`;
  }

  // ---------------------------------------------------------------- tasks view
  function renderTasksView() {
    const filters = [
      { key: 'all', label: '全部' },
      { key: 'mine', label: '我的' },
      { key: 'todo', label: '待办' },
      { key: 'doing', label: '进行中' },
      { key: 'done', label: '已完成' }
    ];
    const columns = [
      { key: 'todo', label: '待办', color: '#94a3b8' },
      { key: 'doing', label: '进行中', color: '#6366f1' },
      { key: 'done', label: '已完成', color: '#10b981' }
    ];
    return `<div class="page-head">
      <div><h1>任务看板</h1><p>${state.tasks.length} 个任务 · ${pendingTaskCount()} 个未完成 · 截止日会同步到日历</p></div>
      <div class="page-actions"><button class="btn btn-primary" data-action="open-create-task">${icon('plus')}新建任务</button></div>
    </div>
    <div class="task-filters">${filters.map(f => `<button class="filter-tab ${state.taskFilter === f.key ? 'active' : ''}" data-action="set-task-filter" data-filter="${f.key}">${f.label}</button>`).join('')}</div>
    <div class="board">${columns.map(column => {
      const tasks = state.tasks.filter(task => task.status === column.key && taskMatchesFilter(task));
      return `<section class="board-col">
        <div class="board-head"><span class="status-dot" style="background:${column.color}"></span><h3>${column.label}</h3><span class="count">${tasks.length}</span></div>
        ${tasks.length ? tasks.map(taskCard).join('') : `<div class="board-empty">这里还没有任务</div>`}
      </section>`;
    }).join('')}</div>`;
  }

  function taskMatchesFilter(task) {
    if (state.taskFilter === 'mine') return task.assignee === CURRENT_USER;
    if (['todo', 'doing', 'done'].includes(state.taskFilter)) return task.status === state.taskFilter;
    return true;
  }

  function taskCard(task) {
    const assignee = memberById(task.assignee);
    return `<article class="task-card ${task.status === 'done' ? 'done' : ''}" data-action="open-task" data-id="${task.id}">
      <div class="task-top">
        <button class="check-btn ${task.status === 'done' ? 'checked' : ''}" data-action="toggle-task" data-id="${task.id}" aria-label="完成任务">${icon('check')}</button>
        <span class="priority-dot priority-${task.priority}"></span>
        <div class="task-title">${escapeHtml(task.title)}</div>
      </div>
      <div class="task-meta">
        <span>${icon('clock')}${dueLabel(task.due)}</span>
        <span class="tag">${escapeHtml(task.tag || '任务')}</span>
        <span class="task-assignee">${avatar(assignee, 'avatar-xs')}${escapeHtml(assignee?.short || '')}</span>
      </div>
    </article>`;
  }

  // ---------------------------------------------------------------- members view
  function renderMembersView() {
    return `<div class="page-head">
      <div><h1>团队成员</h1><p>${members.length} 位成员 · 角色与权限一目了然 · 本周共 ${members.reduce((sum, m) => sum + busyHoursForWeek(m.id), 0).toFixed(1)} 小时忙碌</p></div>
      <div class="page-actions"><button class="btn btn-primary" data-action="copy-invite">${icon('user-plus')}邀请成员</button></div>
    </div>
    <div class="invite-banner">
      <div class="invite-mark">${icon('user-plus')}</div>
      <div class="invite-banner-text"><h2>把邀请码发给同学</h2><p>任何拿到邀请码的人都可以加入团队；加入后默认是 Member。</p></div>
      <div class="invite-code"><code>${team.inviteCode}</code><button data-action="copy-invite" title="复制邀请码">${icon('copy')}</button></div>
    </div>
    <div class="members-grid">${members.map(memberCard).join('')}</div>
    <div class="permission-card">
      <h3>角色权限</h3>
      <table class="permission-table">
        <thead><tr><th>操作</th><th>Owner</th><th>Admin</th><th>Member</th></tr></thead>
        <tbody>
          <tr><td>查看团队日历 / 忙闲</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td></tr>
          <tr><td>创建活动 / 邀请成员</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td></tr>
          <tr><td>管理成员 / 轮换邀请码</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">—</td></tr>
          <tr><td>删除团队</td><td class="yes">✓</td><td class="no">—</td><td class="no">—</td></tr>
        </tbody>
      </table>
    </div>`;
  }

  function memberCard(member) {
    const weekEvents = weekDays().filter(day => state.events.some(e => !e.allDay && isParticipant(e, member.id) && eventOverlaps(e, day, addDays(day, 1)))).length;
    return `<article class="member-card">
      <div class="member-card-head">${avatar(member)}<div class="member-title"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.title)}</small></div>${rolePill(member.role)}</div>
      <div class="member-stats">
        <div class="member-stat"><strong>${busyHoursForWeek(member.id).toFixed(1)}h</strong><small>本周忙碌</small></div>
        <div class="member-stat"><strong>${weekEvents}</strong><small>有安排的天数</small></div>
      </div>
      <div class="member-card-foot"><span class="joined">加入于 ${member.joined.replace(/-/g, '.')}</span><button class="btn btn-sm btn-soft" data-action="view-member" data-id="${member.id}">查看日程</button></div>
    </article>`;
  }

  // ---------------------------------------------------------------- notifications
  function notificationIcon(type) {
    const map = { invite: 'user-plus', task: 'check-square', reminder: 'bell', member: 'users' };
    return icon(map[type] || 'bell');
  }

  function notificationRow(notification) {
    return `<div class="notification-row ${notification.read ? '' : 'unread'}" data-action="open-notification" data-id="${notification.id}">
      <div class="notification-icon ${notification.type}">${notificationIcon(notification.type)}</div>
      <div class="notification-body"><strong>${escapeHtml(notification.title)}</strong><p>${escapeHtml(notification.body)}</p></div>
      <span class="notification-time">${escapeHtml(notification.time)}</span>
      ${notification.read ? '' : '<span class="unread-dot"></span>'}
    </div>`;
  }

  function renderNotificationsView() {
    const notifications = state.notifications.filter(n => state.notificationFilter === 'all' || !n.read);
    return `<div class="page-head">
      <div><h1>通知中心</h1><p>${unreadCount()} 条未读 · ${state.notifications.length} 条通知 · 演示数据不会真正发送</p></div>
      <div class="page-actions"><button class="btn" data-action="mark-all-read">${icon('check')}全部已读</button></div>
    </div>
    <div class="notification-toolbar">
      <div class="notification-tabs">
        <button class="filter-tab ${state.notificationFilter === 'all' ? 'active' : ''}" data-action="set-notification-filter" data-filter="all">全部</button>
        <button class="filter-tab ${state.notificationFilter === 'unread' ? 'active' : ''}" data-action="set-notification-filter" data-filter="unread">未读</button>
      </div>
    </div>
    <div class="notification-list">${notifications.length ? notifications.map(notificationRow).join('') : `<div class="empty-state"><div class="empty-icon">${icon('bell')}</div><strong>没有未读通知</strong><p>新的邀请和任务提醒会出现在这里。</p></div>`}</div>`;
  }

  function renderNotificationPopover() {
    const notifications = state.notifications.slice(0, 5);
    notificationPopover.innerHTML = `
      <div class="popover-head"><strong>通知 · ${unreadCount()} 条未读</strong><button data-action="mark-all-read">全部已读</button></div>
      <div class="popover-list">${notifications.length ? notifications.map(notificationRow).join('') : '<div class="popover-empty">暂无通知</div>'}</div>`;
  }

  // ---------------------------------------------------------------- settings
  function renderSettingsView() {
    return `<div class="page-head">
      <div><h1>团队设置</h1><p>演示版只做界面模拟，不会写入服务器。</p></div>
      <div class="page-actions"><button class="btn" data-action="reset-demo">${icon('refresh')}重置演示数据</button></div>
    </div>
    <div class="settings-grid">
      <div>
        <form class="settings-card" data-form="settings">
          <h3>团队资料</h3>
          <p>这些信息会显示在团队切换器和成员页面。</p>
          <div class="field"><label for="team-name">团队名称</label><input id="team-name" name="team-name" value="${escapeHtml(team.name)}" maxlength="50"></div>
          <div class="field"><label for="team-desc">团队描述</label><textarea id="team-desc" name="team-desc" maxlength="200">${escapeHtml(team.description)}</textarea></div>
          <div class="field-row">
            <div class="field"><label for="team-tz">团队时区</label><select id="team-tz" name="team-tz"><option selected>Asia/Shanghai (UTC+8)</option></select></div>
            <div class="field"><label for="team-invite">邀请码</label><input id="team-invite" value="${team.inviteCode}" disabled></div>
          </div>
          <button class="btn btn-primary" type="submit">保存设置</button>
        </form>

        <div class="settings-card" style="margin-top:16px">
          <h3>通知偏好</h3>
          <p>演示版只改变界面状态，不会真的发送通知。</p>
          <div class="switch-row"><div class="switch-text"><strong>活动邀请与变更</strong><small>有人邀请你或修改活动时间时提醒</small></div><label class="switch"><input type="checkbox" data-setting="invites" ${state.settings.invites ? 'checked' : ''}><span></span></label></div>
          <div class="switch-row"><div class="switch-text"><strong>任务提醒</strong><small>任务被指派、即将到期或逾期时提醒</small></div><label class="switch"><input type="checkbox" data-setting="tasks" ${state.settings.tasks ? 'checked' : ''}><span></span></label></div>
          <div class="switch-row"><div class="switch-text"><strong>每日摘要</strong><small>每天早 8 点汇总今日日程</small></div><label class="switch"><input type="checkbox" data-setting="digest" ${state.settings.digest ? 'checked' : ''}><span></span></label></div>
        </div>
      </div>
      <div>
        <div class="settings-card demo-note-card">
          <h3>演示说明</h3>
          <p>这是一份静态原型，用来展示最终产品的界面和交互。</p>
          <ol class="demo-steps">
            <li>切换成员筛选，看团队忙闲怎么变化。</li>
            <li>点“冲突演示”，给王可建一个 14:30 的活动，看冲突提示。</li>
            <li>打开“待回应邀请”，试试接受 / 待定 / 拒绝。</li>
            <li>去任务看板，完成一个任务，看日历截止行同步。</li>
          </ol>
        </div>
        <div class="settings-card danger-zone" style="margin-top:16px">
          <h3>危险操作</h3>
          <p>删除团队会移除所有成员和日程。演示版不会真的删除。</p>
          <button class="btn btn-danger" data-action="delete-team">${icon('trash')}删除团队</button>
        </div>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- search
  function renderSearchResults() {
    const query = state.search.trim().toLowerCase();
    if (!query) {
      searchResults.hidden = true;
      return;
    }
    const eventResults = state.events
      .filter(e => canView(e) && (`${e.title} ${e.location}`.toLowerCase().includes(query)))
      .slice(0, 4);
    const taskResults = state.tasks
      .filter(t => t.title.toLowerCase().includes(query))
      .slice(0, 3);
    const memberResults = members
      .filter(m => `${m.name} ${m.title}`.toLowerCase().includes(query))
      .slice(0, 3);

    const group = (label, items) => items.length ? `<div class="search-group-label">${label}</div>${items.join('')}` : '';
    const eventItems = eventResults.map(e => `
      <button class="search-item" data-action="open-event" data-id="${e.id}">
        ${icon('calendar')}<span class="search-item-text"><strong>${escapeHtml(e.title)}</strong><small>${fmtDateShort(e.start)} ${fmtTime(e.start)} · ${escapeHtml(e.location || '未填写地点')}</small></span>
      </button>`);
    const taskItems = taskResults.map(t => `
      <button class="search-item" data-action="open-task" data-id="${t.id}">
        ${icon('check-square')}<span class="search-item-text"><strong>${escapeHtml(t.title)}</strong><small>${dueLabel(t.due)} · ${escapeHtml(memberName(t.assignee))}</small></span>
      </button>`);
    const memberItems = memberResults.map(m => `
      <button class="search-item" data-action="filter-member" data-id="${m.id}">
        ${avatar(m, 'avatar-sm')}<span class="search-item-text"><strong>${escapeHtml(m.name)}</strong><small>${ROLE_LABELS[m.role]} · ${escapeHtml(m.title)}</small></span>
      </button>`);

    const html = group('活动', eventItems) + group('任务', taskItems) + group('成员', memberItems);
    searchResults.innerHTML = html || `<div class="search-empty">没有找到“${escapeHtml(state.search)}”</div>`;
    searchResults.hidden = false;
  }

  // ---------------------------------------------------------------- toast + modal
  function showToast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `${icon(type === 'warn' ? 'alert' : type === 'error' ? 'alert' : 'check')}<span>${escapeHtml(message)}</span>`;
    toastRoot.appendChild(el);
    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 200);
    }, 2600);
  }

  function openModal(html, { wide = false } = {}) {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modalRoot.innerHTML = '';
    document.body.style.overflow = '';
  }

  function modalCloseButton() {
    return `<button type="button" class="modal-close" data-action="close-modal" aria-label="关闭">${icon('x')}</button>`;
  }

  // ---------------------------------------------------------------- event detail
  function openEvent(id) {
    const event = state.events.find(e => e.id === id);
    if (!event) {
      showToast('活动不存在或已取消', 'warn');
      return;
    }
    if (isMasked(event)) {
      openModal(maskedEventDetail(event), { wide: true });
      return;
    }
    const organizer = memberById(event.creator);
    const isOrganizer = event.creator === CURRENT_USER;
    const myStatus = participantStatus(event);
    const canRsvp = !isOrganizer && myStatus;
    const color = memberColor(event.creator);
    const timeText = event.allDay ? `${fmtDateFull(event.start)} · 全天` : `${fmtDateFull(event.start)} ${fmtTime(event.start)} – ${fmtTime(event.end)}`;

    openModal(`
      <div class="event-detail-head" style="--event-color:${color}">
        <div class="modal-head" style="padding:0">
          <div class="modal-title-wrap">
            <div class="modal-kicker">${event.visibility === 'private' ? icon('lock') + ' 私密活动' : '团队活动'} · ${event.allDay ? '全天' : durationLabel(event.start, event.end)}</div>
            <h2 class="modal-title">${escapeHtml(event.title)}</h2>
            <div class="event-detail-time">${icon('clock')}${timeText}</div>
            ${event.location ? `<div class="event-detail-loc">${icon('pin')}${escapeHtml(event.location)}</div>` : ''}
          </div>
          ${modalCloseButton()}
        </div>
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item"><small>组织者</small><strong>${escapeHtml(organizer?.name || '未知')}</strong></div>
          <div class="detail-item"><small>参与者</small><strong>${event.participants.length} 人</strong></div>
          <div class="detail-item"><small>可见性</small><strong>${event.visibility === 'private' ? '仅参与者' : '团队可见'}</strong></div>
          <div class="detail-item"><small>你的状态</small><strong>${isOrganizer ? '组织者' : STATUS_LABELS[myStatus] || '未受邀'}</strong></div>
        </div>
        ${event.description ? `<div class="description-box">${escapeHtml(event.description)}</div>` : ''}
        <p class="section-label">参与者与 RSVP</p>
        <div class="participant-list">${event.participants.map(p => {
          const member = memberById(p.id);
          return `<div class="participant-row ${p.id === CURRENT_USER ? 'me' : ''}">
            ${avatar(member, 'avatar-sm')}
            <span class="participant-name">${escapeHtml(member?.name || '未知')}${p.id === event.creator ? '<small>组织者</small>' : ''}</span>
            ${statusPill(p.status)}
          </div>`;
        }).join('')}</div>
        ${canRsvp ? `<div class="rsvp-row">
          <button class="rsvp-btn accepted ${myStatus === 'accepted' ? 'active accepted' : ''}" data-action="rsvp" data-id="${event.id}" data-status="accepted">${icon('check')}接受</button>
          <button class="rsvp-btn tentative ${myStatus === 'tentative' ? 'active tentative' : ''}" data-action="rsvp" data-id="${event.id}" data-status="tentative">${icon('clock')}待定</button>
          <button class="rsvp-btn declined ${myStatus === 'declined' ? 'active declined' : ''}" data-action="rsvp" data-id="${event.id}" data-status="declined">${icon('x')}拒绝</button>
        </div>` : ''}
        ${isOrganizer ? `<p class="muted" style="font-size:10px;margin:4px 0 0">你是组织者。修改时间/地点会通知已接受的参与者。</p>` : (!myStatus ? `<p class="muted" style="font-size:10px;margin:4px 0 0">你未被邀请，仅可查看团队可见活动。</p>` : '')}
      </div>
      <div class="modal-foot">
        <button class="btn" data-action="close-modal">关闭</button>
        ${isOrganizer ? `<button class="btn" data-action="edit-event" data-id="${event.id}">${icon('edit')}编辑</button><button class="btn btn-danger" data-action="cancel-event" data-id="${event.id}">${icon('trash')}取消活动</button>` : ''}
      </div>`, { wide: true });
  }

  function maskedEventDetail(event) {
    return `
      <div class="modal-head">
        <div class="modal-title-wrap">
          <div class="modal-kicker">${icon('lock')} 私密活动</div>
          <h2 class="modal-title">忙碌</h2>
          <p class="modal-sub">${escapeHtml(memberName(event.creator))}在这个时间段已有安排。</p>
        </div>
        ${modalCloseButton()}
      </div>
      <div class="modal-body">
        <div class="empty-state" style="padding:24px 10px">
          <div class="empty-icon">${icon('lock')}</div>
          <strong>仅显示忙碌状态</strong>
          <p>${fmtDateFull(event.start)} ${fmtTime(event.start)} – ${fmtTime(event.end)}</p>
          <p style="margin-top:8px">私密活动的标题、地点和描述只对组织者与参与者可见。</p>
        </div>
      </div>
      <div class="modal-foot"><button class="btn" data-action="close-modal">知道了</button></div>`;
  }

  // ---------------------------------------------------------------- event form / conflict
  function openEventForm(prefill = {}, editId = null) {
    const existing = editId ? state.events.find(e => e.id === editId) : null;
    const isEdit = !!existing;
    const organizerId = existing?.creator || CURRENT_USER;
    const title = existing?.title || prefill.title || '';
    const date = existing ? dateKey(existing.start) : prefill.date || dateKey(state.currentDate);
    const start = existing ? fmtTime(existing.start) : prefill.start || '14:00';
    const end = existing ? fmtTime(existing.end) : prefill.end || '15:00';
    const location = existing?.location || prefill.location || '';
    const description = existing?.description || prefill.description || '';
    const visibility = existing?.visibility || prefill.visibility || 'team';
    const participantIds = new Set(existing ? existing.participants.map(p => p.id) : prefill.participants || []);
    participantIds.add(organizerId);

    openModal(`
      <form data-form="event" data-edit-id="${editId || ''}">
        <div class="modal-head">
          <div class="modal-title-wrap">
            <div class="modal-kicker">${isEdit ? '编辑活动' : '新建活动'}</div>
            <h2 class="modal-title">${isEdit ? '修改活动信息' : '安排一个新活动'}</h2>
            <p class="modal-sub">保存时会自动检查参与者的时间冲突。</p>
          </div>
          ${modalCloseButton()}
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="field span-2"><label for="ev-title">活动标题</label><input id="ev-title" name="title" required maxlength="100" value="${escapeHtml(title)}" placeholder="例如：小组会 / 需求评审"></div>
            <div class="field"><label for="ev-date">日期</label><input id="ev-date" name="date" type="date" required value="${date}"></div>
            <div class="field"><label for="ev-visibility">可见性</label><select id="ev-visibility" name="visibility"><option value="team" ${visibility === 'team' ? 'selected' : ''}>团队可见</option><option value="private" ${visibility === 'private' ? 'selected' : ''}>私密（仅参与者）</option></select></div>
            <div class="field"><label for="ev-start">开始</label><input id="ev-start" name="start" type="time" required value="${start}"></div>
            <div class="field"><label for="ev-end">结束</label><input id="ev-end" name="end" type="time" required value="${end}"></div>
            <div class="field span-2"><label for="ev-location">地点</label><input id="ev-location" name="location" maxlength="100" value="${escapeHtml(location)}" placeholder="例如：图书馆 3F / 线上"></div>
            <div class="field span-2"><label for="ev-desc">描述</label><textarea id="ev-desc" name="description" maxlength="2000" placeholder="补充议程、准备事项或会议链接">${escapeHtml(description)}</textarea></div>
            <div class="field span-2"><label>参与者</label>
              <div class="member-check-grid">${members.map(member => {
                const checked = participantIds.has(member.id);
                const locked = member.id === organizerId;
                return `<label class="member-check">
                  <input type="checkbox" name="participants" value="${member.id}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}>
                  ${avatar(member, 'avatar-xs')}<span class="member-check-text"><strong>${escapeHtml(member.name)}</strong><small>${locked ? '组织者' : ROLE_LABELS[member.role]}</small></span>
                </label>`;
              }).join('')}</div>
              <input type="hidden" name="organizer" value="${organizerId}">
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-action="close-modal">取消</button>
          <button type="submit" class="btn btn-primary">${isEdit ? '保存修改' : '创建活动'}</button>
        </div>
      </form>`, { wide: true });
  }

  function submitEventForm(form) {
    const data = new FormData(form);
    const editId = form.dataset.editId || null;
    const title = String(data.get('title') || '').trim();
    const date = String(data.get('date') || '');
    const startTime = String(data.get('start') || '');
    const endTime = String(data.get('end') || '');
    if (!title) return showToast('请填写活动标题', 'warn');
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    if (!date || !startTime || !endTime || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return showToast('请选择有效的日期和时间', 'warn');
    if (end <= start) return showToast('结束时间必须晚于开始时间', 'warn');

    const organizerId = String(data.get('organizer') || CURRENT_USER);
    const checked = $$('input[name="participants"]:checked', form).map(input => input.value);
    checked.push(organizerId);
    const existing = editId ? state.events.find(e => e.id === editId) : null;
    const participants = [...new Set(checked)].map(id => ({
      id,
      status: existing?.participants.find(p => p.id === id)?.status || (id === organizerId ? 'accepted' : 'pending')
    }));
    const event = {
      id: editId || `e-${Date.now()}`,
      title,
      start,
      end,
      creator: organizerId,
      location: String(data.get('location') || '').trim(),
      visibility: data.get('visibility') === 'private' ? 'private' : 'team',
      description: String(data.get('description') || '').trim(),
      participants,
      allDay: false
    };
    const conflicts = findConflicts(event, editId);
    if (conflicts.length) {
      state.pendingEvent = { event, editId, conflicts };
      openConflictModal(conflicts);
      return;
    }
    saveEvent(event, editId);
  }

  function findConflicts(event, excludeId = null) {
    const userIds = [...new Set(event.participants.map(p => p.id))];
    const conflicts = [];
    const seen = new Set();
    state.events.forEach(other => {
      if (other.id === excludeId || other.status === 'cancelled') return;
      if (!(event.start < other.end && event.end > other.start)) return;
      const otherIds = eventMemberIds(other);
      userIds.forEach(userId => {
        if (!otherIds.has(userId)) return;
        const participant = other.participants.find(p => p.id === userId);
        if (participant?.status === 'declined') return;
        const key = `${userId}:${other.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        conflicts.push({ userId, event: other });
      });
    });
    return conflicts;
  }

  function openConflictModal(conflicts) {
    openModal(`
      <div class="modal-head">
        <div class="modal-title-wrap">
          <div class="modal-kicker" style="color:#c2410c">${icon('alert')} 时间冲突</div>
          <h2 class="modal-title">有 ${conflicts.length} 个时间冲突</h2>
          <p class="modal-sub">以下成员在所选时间已有安排。你可以调整时间，或者仍然创建。</p>
        </div>
        ${modalCloseButton()}
      </div>
      <div class="modal-body">
        <div class="conflict-list">${conflicts.map(conflict => {
          const member = memberById(conflict.userId);
          const event = conflict.event;
          const masked = !canView(event);
          return `<div class="conflict-item">
            <div class="conflict-icon">${icon('alert')}</div>
            ${avatar(member, 'avatar-sm')}
            <div class="conflict-text"><strong>${escapeHtml(member?.name || '未知')} · ${masked ? '私密安排' : escapeHtml(event.title)}</strong><small>${masked ? '仅显示忙碌' : `${fmtDateShort(event.start)} ${fmtTime(event.start)} – ${fmtTime(event.end)}`}</small></div>
          </div>`;
        }).join('')}</div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-action="adjust-time">调整时间</button>
        <button class="btn btn-primary" data-action="force-create">仍然创建</button>
      </div>`);
  }

  function saveEvent(event, editId = null, { silent = false } = {}) {
    if (editId) {
      const index = state.events.findIndex(e => e.id === editId);
      if (index >= 0) state.events[index] = event;
    } else {
      state.events.push(event);
    }
    state.pendingEvent = null;
    closeModal();
    render();
    if (!silent) showToast(editId ? '活动已更新' : '活动已创建', 'success');
  }

  function forceCreate() {
    if (!state.pendingEvent) return;
    const { event, editId, conflicts } = state.pendingEvent;
    saveEvent(event, editId, { silent: true });
    showToast(`已创建，仍存在 ${conflicts.length} 个时间冲突`, 'warn');
  }

  function adjustPendingTime() {
    if (!state.pendingEvent) return;
    const { event, editId } = state.pendingEvent;
    state.pendingEvent = null;
    openEventForm({
      title: event.title,
      date: dateKey(event.start),
      start: fmtTime(event.start),
      end: fmtTime(event.end),
      location: event.location,
      description: event.description,
      visibility: event.visibility,
      participants: event.participants.map(p => p.id).filter(id => id !== event.creator)
    }, editId);
  }

  // ---------------------------------------------------------------- rsvp / task actions
  function rsvp(eventId, status) {
    const event = state.events.find(e => e.id === eventId);
    if (!event) return;
    const participant = event.participants.find(p => p.id === CURRENT_USER);
    if (!participant) return showToast('你不是这个活动的参与者', 'warn');
    if (event.creator === CURRENT_USER) return showToast('组织者不能拒绝自己的活动，请取消活动', 'warn');
    participant.status = status;
    const labels = { accepted: '已接受邀请', tentative: '已标记为待定', declined: '已拒绝邀请' };
    showToast(labels[status] || '状态已更新', status === 'declined' ? 'warn' : 'success');
    render();
    if (modalRoot.querySelector('.modal')) openEvent(eventId);
  }

  function toggleTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.status = task.status === 'done' ? 'todo' : 'done';
    task.completedAt = task.status === 'done' ? new Date() : null;
    showToast(task.status === 'done' ? '任务已完成' : '任务已重新打开', 'success');
    render();
  }

  function setTaskStatus(taskId, status) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.status = status;
    task.completedAt = status === 'done' ? new Date() : null;
    showToast(status === 'done' ? '任务已完成' : '任务状态已更新', 'success');
    render();
    openTask(taskId);
  }

  function openTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return showToast('任务不存在', 'warn');
    const assignee = memberById(task.assignee);
    openModal(`
      <div class="modal-head">
        <div class="modal-title-wrap">
          <div class="modal-kicker">任务 · ${escapeHtml(task.tag || '任务')}</div>
          <h2 class="modal-title">${escapeHtml(task.title)}</h2>
          <p class="modal-sub">${task.status === 'done' ? '已完成' : task.status === 'doing' ? '进行中' : '待办'} · ${dueLabel(task.due)}</p>
        </div>
        ${modalCloseButton()}
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item"><small>负责人</small><strong>${escapeHtml(assignee?.name || '未指派')}</strong></div>
          <div class="detail-item"><small>优先级</small><strong>${task.priority === 'high' ? '高' : task.priority === 'low' ? '低' : '普通'}</strong></div>
          <div class="detail-item"><small>截止时间</small><strong>${fmtDateFull(task.due)} ${fmtTime(task.due)}</strong></div>
          <div class="detail-item"><small>状态</small><strong>${task.status === 'done' ? '已完成' : task.status === 'doing' ? '进行中' : '待办'}</strong></div>
        </div>
        <p class="section-label">更新状态</p>
        <div class="rsvp-row">
          <button class="rsvp-btn ${task.status === 'todo' ? 'active tentative' : ''}" data-action="set-task-status" data-id="${task.id}" data-status="todo">待办</button>
          <button class="rsvp-btn ${task.status === 'doing' ? 'active tentative' : ''}" data-action="set-task-status" data-id="${task.id}" data-status="doing">进行中</button>
          <button class="rsvp-btn accepted ${task.status === 'done' ? 'active accepted' : ''}" data-action="set-task-status" data-id="${task.id}" data-status="done">已完成</button>
        </div>
      </div>
      <div class="modal-foot"><button class="btn" data-action="close-modal">关闭</button><button class="btn btn-primary" data-action="toggle-task" data-id="${task.id}">${task.status === 'done' ? '重新打开' : '标记完成'}</button></div>`);
  }

  function openTaskForm() {
    openModal(`
      <form data-form="task">
        <div class="modal-head">
          <div class="modal-title-wrap"><div class="modal-kicker">新建任务</div><h2 class="modal-title">添加一个任务</h2><p class="modal-sub">截止日会自动出现在日历的“截止”行。</p></div>
          ${modalCloseButton()}
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="field span-2"><label for="task-title">任务标题</label><input id="task-title" name="title" required maxlength="100" placeholder="例如：完成概要设计"></div>
            <div class="field"><label for="task-assignee">负责人</label><select id="task-assignee" name="assignee">${members.map(m => `<option value="${m.id}" ${m.id === CURRENT_USER ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}</select></div>
            <div class="field"><label for="task-priority">优先级</label><select id="task-priority" name="priority"><option value="normal">普通</option><option value="high">高</option><option value="low">低</option></select></div>
            <div class="field"><label for="task-date">截止日期</label><input id="task-date" name="date" type="date" required value="${dateKey(DEMO_TODAY)}"></div>
            <div class="field"><label for="task-time">截止时间</label><input id="task-time" name="time" type="time" required value="18:00"></div>
          </div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-action="close-modal">取消</button><button type="submit" class="btn btn-primary">创建任务</button></div>
      </form>`);
  }

  function submitTaskForm(form) {
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    if (!title) return showToast('请填写任务标题', 'warn');
    const date = String(data.get('date') || '');
    const time = String(data.get('time') || '18:00');
    const due = new Date(`${date}T${time}`);
    const task = {
      id: `t-${Date.now()}`,
      title,
      assignee: String(data.get('assignee') || CURRENT_USER),
      due,
      priority: String(data.get('priority') || 'normal'),
      status: 'todo',
      tag: '新任务'
    };
    state.tasks.push(task);
    closeModal();
    render();
    showToast('任务已创建', 'success');
  }

  // ---------------------------------------------------------------- notifications actions
  function openNotification(id) {
    const notification = state.notifications.find(n => n.id === id);
    if (!notification) return;
    notification.read = true;
    notificationPopover.hidden = true;
    render();
    if (notification.eventId) openEvent(notification.eventId);
    else if (notification.taskId) openTask(notification.taskId);
  }

  function markAllRead() {
    state.notifications.forEach(n => { n.read = true; });
    notificationPopover.hidden = true;
    render();
    showToast('所有通知已标记为已读', 'success');
  }

  // ---------------------------------------------------------------- misc actions
  function openProfile() {
    openModal(`
      <div class="modal-head">
        <div class="modal-title-wrap"><div class="modal-kicker">演示账号</div><h2 class="modal-title">林知远</h2><p class="modal-sub">Owner · 产品 & 前端</p></div>
        ${modalCloseButton()}
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item"><small>团队</small><strong>${escapeHtml(team.name)}</strong></div>
          <div class="detail-item"><small>角色</small><strong>Owner</strong></div>
          <div class="detail-item"><small>时区</small><strong>Asia/Shanghai</strong></div>
          <div class="detail-item"><small>登录方式</small><strong>演示账号</strong></div>
        </div>
        <p class="muted" style="font-size:10.5px;line-height:1.7">这是一个静态原型：账号、团队和日程都是虚拟数据，刷新页面会重置。</p>
      </div>
      <div class="modal-foot"><button class="btn" data-action="close-modal">关闭</button></div>`);
  }

  function openTour() {
    openModal(`
      <div class="modal-head">
        <div class="modal-title-wrap"><div class="modal-kicker">${icon('spark')} 演示导览</div><h2 class="modal-title">60 秒看完 TeamSync</h2><p class="modal-sub">这个页面用虚拟数据模拟最终产品的核心交互。</p></div>
        ${modalCloseButton()}
      </div>
      <div class="modal-body">
        <div class="tour-list">
          <div class="tour-item"><span class="tour-num">1</span><div><strong>周视图 + 团队忙闲</strong><p>看每一天的活动，右侧条形图显示三位成员本周的忙碌程度。</p></div></div>
          <div class="tour-item"><span class="tour-num">2</span><div><strong>冲突提示</strong><p>点“冲突演示”，给王可安排 14:30 的会议，保存时会出现冲突警告，仍可强制创建。</p></div></div>
          <div class="tour-item"><span class="tour-num">3</span><div><strong>邀请与 RSVP</strong><p>打开“待回应邀请”，试试接受 / 待定 / 拒绝；组织者视角会同步更新。</p></div></div>
          <div class="tour-item"><span class="tour-num">4</span><div><strong>任务与私密</strong><p>任务截止日会出现在日历；陈一诺的私密安排只显示“忙碌”。</p></div></div>
        </div>
      </div>
      <div class="modal-foot"><button class="btn" data-action="close-modal">先看看</button><button class="btn btn-primary" data-action="start-tour">开始体验</button></div>`);
  }

  function copyInvite() {
    const text = team.inviteCode;
    const done = () => showToast(`邀请码 ${text} 已复制`, 'success');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        fallbackCopy(text);
        done();
      });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (_) {}
    area.remove();
  }

  function resetDemo() {
    resetData();
    team.name = '软工大作业';
    team.description = '6 周课程项目 · 团队日程与轻量任务';
    team.inviteCode = 'TS8K2M4Q';
    state.currentDate = new Date(DEMO_TODAY);
    state.calendarView = 'week';
    state.selectedMembers = new Set(members.map(m => m.id));
    state.onlyMine = false;
    state.taskFilter = 'all';
    state.notificationFilter = 'all';
    state.settings = { invites: true, tasks: true, digest: false };
    state.pendingEvent = null;
    closeModal();
    clearSearch();
    render();
    showToast('演示数据已重置', 'success');
  }

  // ---------------------------------------------------------------- global events
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      navigate(nav.dataset.nav);
      return;
    }
    const actionEl = event.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      if (action === 'close-modal') {
        if (actionEl.classList.contains('modal-backdrop') && event.target.closest('.modal')) return;
        closeModal();
        return;
      }
      switch (action) {
        case 'toggle-sidebar':
          state.sidebarOpen = !state.sidebarOpen;
          sidebar.classList.toggle('open', state.sidebarOpen);
          if (sidebarScrim) sidebarScrim.classList.toggle('show', state.sidebarOpen);
          return;
        case 'switch-team':
          showToast('演示版只有一个团队：软工大作业', 'warn');
          return;
        case 'open-profile':
          openProfile();
          return;
        case 'open-tour':
          openTour();
          return;
        case 'start-tour':
          closeModal();
          setTimeout(() => openEventForm({
            title: '临时讨论',
            date: dateKey(DEMO_TODAY),
            start: '14:30',
            end: '15:00',
            location: '线上',
            visibility: 'team',
            participants: ['wang']
          }), 80);
          return;
        case 'quick-my-week':
          state.selectedMembers = new Set(members.map(m => m.id));
          state.onlyMine = true;
          state.view = 'calendar';
          state.calendarView = 'week';
          state.currentDate = new Date(DEMO_TODAY);
          render();
          showToast('已筛选：我的本周', 'success');
          return;
        case 'quick-pending': {
          const first = pendingInvites()[0];
          if (first) openEvent(first.id);
          else showToast('没有待回应邀请', 'warn');
          return;
        }
        case 'quick-conflict':
          openEventForm({ title: '临时讨论', date: dateKey(DEMO_TODAY), start: '14:30', end: '15:00', location: '线上', visibility: 'team', participants: ['wang'] });
          return;
        case 'toggle-notifications':
          notificationPopover.hidden = !notificationPopover.hidden;
          if (!notificationPopover.hidden) {
            renderNotificationPopover();
            searchResults.hidden = true;
          }
          return;
        case 'mark-all-read':
          markAllRead();
          return;
        case 'open-notification':
          openNotification(actionEl.dataset.id);
          return;
        case 'cal-prev':
          shiftCalendar(-1);
          return;
        case 'cal-next':
          shiftCalendar(1);
          return;
        case 'cal-today':
          state.currentDate = new Date(DEMO_TODAY);
          render();
          return;
        case 'set-cal-view':
          state.calendarView = actionEl.dataset.view;
          render();
          return;
        case 'toggle-member': {
          const id = actionEl.dataset.id;
          if (state.selectedMembers.has(id)) state.selectedMembers.delete(id);
          else state.selectedMembers.add(id);
          state.onlyMine = false;
          render();
          return;
        }
        case 'select-all-members':
          state.selectedMembers = new Set(members.map(m => m.id));
          state.onlyMine = false;
          render();
          return;
        case 'toggle-only-mine':
          state.onlyMine = !state.onlyMine;
          render();
          return;
        case 'open-create':
          openEventForm();
          return;
        case 'demo-conflict':
          openEventForm({ title: '临时讨论', date: dateKey(DEMO_TODAY), start: '14:30', end: '15:00', location: '线上', visibility: 'team', participants: ['wang'] });
          return;
        case 'go-today':
          state.currentDate = new Date(DEMO_TODAY);
          state.calendarView = 'day';
          state.view = 'calendar';
          render();
          return;
        case 'open-day':
          state.currentDate = new Date(`${actionEl.dataset.date}T00:00`);
          state.calendarView = 'day';
          render();
          return;
        case 'open-event':
          clearSearch();
          openEvent(actionEl.dataset.id);
          return;
        case 'open-task':
          clearSearch();
          openTask(actionEl.dataset.id);
          return;
        case 'rsvp':
          rsvp(actionEl.dataset.id, actionEl.dataset.status);
          return;
        case 'edit-event':
          closeModal();
          openEventForm({}, actionEl.dataset.id);
          return;
        case 'cancel-event':
          openConfirmCancel(actionEl.dataset.id);
          return;
        case 'force-create':
          forceCreate();
          return;
        case 'adjust-time':
          adjustPendingTime();
          return;
        case 'toggle-task':
          toggleTask(actionEl.dataset.id);
          if (modalRoot.querySelector('.modal')) openTask(actionEl.dataset.id);
          return;
        case 'set-task-status':
          setTaskStatus(actionEl.dataset.id, actionEl.dataset.status);
          return;
        case 'open-create-task':
          openTaskForm();
          return;
        case 'set-task-filter':
          state.taskFilter = actionEl.dataset.filter;
          render();
          return;
        case 'set-notification-filter':
          state.notificationFilter = actionEl.dataset.filter;
          render();
          return;
        case 'copy-invite':
          copyInvite();
          return;
        case 'view-member':
          state.selectedMembers = new Set([actionEl.dataset.id]);
          state.onlyMine = false;
          state.view = 'calendar';
          state.calendarView = 'week';
          state.currentDate = new Date(DEMO_TODAY);
          render();
          return;
        case 'filter-member':
          state.selectedMembers = new Set([actionEl.dataset.id]);
          state.onlyMine = false;
          state.view = 'calendar';
          state.calendarView = 'week';
          state.currentDate = new Date(DEMO_TODAY);
          clearSearch();
          render();
          return;
        case 'reset-demo':
          resetDemo();
          return;
        case 'delete-team':
          openDeleteTeam();
          return;
        case 'close-sidebar':
          state.sidebarOpen = false;
          sidebar.classList.remove('open');
          if (sidebarScrim) sidebarScrim.classList.remove('show');
          return;
        default:
          return;
      }
    }

    if (!event.target.closest('#search-wrap')) searchResults.hidden = true;
    if (!event.target.closest('#notification-popover') && !event.target.closest('[data-action="toggle-notifications"]')) notificationPopover.hidden = true;
    if (state.sidebarOpen && !event.target.closest('#sidebar') && !event.target.closest('[data-action="toggle-sidebar"]')) {
      state.sidebarOpen = false;
      sidebar.classList.remove('open');
      if (sidebarScrim) sidebarScrim.classList.remove('show');
    }
  });

  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.matches('[data-form="event"]')) {
      event.preventDefault();
      submitEventForm(form);
    } else if (form.matches('[data-form="task"]')) {
      event.preventDefault();
      submitTaskForm(form);
    } else if (form.matches('[data-form="settings"]')) {
      event.preventDefault();
      const data = new FormData(form);
      team.name = String(data.get('team-name') || team.name).trim() || team.name;
      team.description = String(data.get('team-desc') || team.description).trim();
      render();
      showToast('设置已保存（演示）', 'success');
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'global-search') {
      state.search = event.target.value;
      renderSearchResults();
    }
  });

  document.addEventListener('change', event => {
    if (event.target.matches('[data-setting]')) {
      state.settings[event.target.dataset.setting] = event.target.checked;
      showToast('通知偏好已更新（演示）', 'success');
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (modalRoot.querySelector('.modal')) closeModal();
      else if (!notificationPopover.hidden) notificationPopover.hidden = true;
      else if (!searchResults.hidden) searchResults.hidden = true;
      else if (state.sidebarOpen) { state.sidebarOpen = false; sidebar.classList.remove('open'); if (sidebarScrim) sidebarScrim.classList.remove('show'); }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchInput.focus();
      if (state.search) renderSearchResults();
    }
  });

  function shiftCalendar(direction) {
    if (state.calendarView === 'month') {
      state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + direction, 1);
    } else {
      state.currentDate = addDays(state.currentDate, direction * (state.calendarView === 'week' ? 7 : 1));
    }
    render();
  }

  function openConfirmCancel(eventId) {
    const event = state.events.find(e => e.id === eventId);
    if (!event) return;
    openModal(`
      <div class="modal-head">
        <div class="modal-title-wrap"><div class="modal-kicker">取消活动</div><h2 class="modal-title">确定取消「${escapeHtml(event.title)}」？</h2><p class="modal-sub">参与者会收到取消通知。演示版只会从当前页面移除。</p></div>
        ${modalCloseButton()}
      </div>
      <div class="modal-body"><div class="description-box">取消后，这个活动会从团队日历中消失；私密活动不会向非参与者泄露详情。</div></div>
      <div class="modal-foot"><button class="btn" data-action="close-modal">再想想</button><button class="btn btn-danger" data-action="confirm-cancel" data-id="${event.id}">取消活动</button></div>`);
  }

  function openDeleteTeam() {
    openModal(`
      <div class="modal-head">
        <div class="modal-title-wrap"><div class="modal-kicker" style="color:#be123c">${icon('alert')} 危险操作</div><h2 class="modal-title">删除「${escapeHtml(team.name)}」？</h2><p class="modal-sub">真实产品会软删除团队并通知所有成员；演示版不会真的删除。</p></div>
        ${modalCloseButton()}
      </div>
      <div class="modal-body"><div class="description-box">这是一个静态原型，点击删除只会显示提示。这样可以放心点。</div></div>
      <div class="modal-foot"><button class="btn" data-action="close-modal">取消</button><button class="btn btn-danger" data-action="confirm-delete-team">删除团队</button></div>`);
  }

  // confirm actions need to be in the main switch
  document.addEventListener('click', event => {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    if (actionEl.dataset.action === 'confirm-cancel') {
      state.events = state.events.filter(e => e.id !== actionEl.dataset.id);
      closeModal();
      render();
      showToast('活动已取消（演示）', 'warn');
    }
    if (actionEl.dataset.action === 'confirm-delete-team') {
      closeModal();
      showToast('演示模式：团队没有被删除', 'warn');
    }
  }, true);

  // ---------------------------------------------------------------- boot
  resetData();
  updateShell();
  renderContent();
  showToast('欢迎来到 TeamSync 演示 · 点左下角“演示导览”', 'success');
})();
