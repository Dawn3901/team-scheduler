export interface CalendarViewOption<T extends string> {
  value: T;
  label: string;
}

/** 通用视图切换按钮组；团队日历用 月/周/日，个人日历用 月/周/任务清单。 */
export default function CalendarViewSwitcher<T extends string>({
  value,
  options,
  onChange,
  ariaLabel = "日历视图",
}: {
  value: T;
  options: CalendarViewOption<T>[];
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="cal-views" role="group" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          type="button"
          key={option.value}
          className={`cal-view${value === option.value ? " active" : ""}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
