import { useLocation, useNavigate } from "react-router-dom";

import { Icon } from "./Icon";

export function BackToCalendar({ teamId }: { teamId: number }) {
  const location = useLocation();
  const navigate = useNavigate();
  const fromCalendar = (location.state as { fromCalendar?: string } | null)?.fromCalendar;

  return (
    <button
      type="button"
      className="btn btn-secondary back-to-calendar"
      onClick={() => navigate(fromCalendar ?? `/app/teams/${teamId}/calendar`)}
    >
      <Icon name="chevron-left" />
      返回日历
    </button>
  );
}
