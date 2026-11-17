import { useRef, useState } from "react";

interface MentionMember {
  user_id: number;
  display_name: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  mentions: number[];
  onMentionsChange: (ids: number[]) => void;
  members: MentionMember[];
  currentUserId?: number;
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}

/**
 * 手打 “@” 触发成员选择（CR-016 反馈修正）。
 * 说明：只在输入框内做，不做富文本；选中后插入 “@名字 ”，删掉名字时同步撤销该 @。
 */
export function MentionTextarea({
  value,
  onChange,
  mentions,
  onMentionsChange,
  members,
  currentUserId,
  ariaLabel,
  placeholder,
  maxLength = 2000,
  rows = 2,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const previousText = useRef(value);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const candidates = members.filter(
    member => member.user_id !== currentUserId && !mentions.includes(member.user_id),
  );
  const matches = (query === null ? candidates : candidates.filter(member =>
    member.display_name.toLowerCase().includes(query.toLowerCase()),
  )).slice(0, 6);

  const syncMentions = (text: string, ids: number[]) => {
    // 只撤销“原本在文字里、现在被删掉”的 @；用按钮选中的提及不受影响。
    const before = previousText.current;
    previousText.current = text;
    const kept = ids.filter(id => {
      const member = members.find(item => item.user_id === id);
      if (!member) return false;
      const token = `@${member.display_name}`;
      return !before.includes(token) || text.includes(token);
    });
    if (kept.length !== ids.length) onMentionsChange(kept);
  };

  const handleChange = (text: string, caret: number) => {
    onChange(text);
    syncMentions(text, mentions);
    const before = text.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at === -1) {
      setQuery(null);
      return;
    }
    const tail = before.slice(at + 1);
    // 只把“空格后的 @ + 无空格查询”当作触发，避免邮箱之类误触。
    if (/\s/.test(tail) || (at > 0 && !/\s/.test(before[at - 1]))) {
      setQuery(null);
      return;
    }
    setQuery(tail);
    setActive(0);
  };

  const pick = (member: MentionMember) => {
    const element = ref.current;
    const caret = element?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const at = before.lastIndexOf("@");
    const inserted = `@${member.display_name} `;
    const next = at === -1 ? value + inserted : value.slice(0, at) + inserted + value.slice(caret);
    onChange(next);
    if (!mentions.includes(member.user_id)) onMentionsChange([...mentions, member.user_id]);
    setQuery(null);
    requestAnimationFrame(() => {
      const position = (at === -1 ? value.length : at) + inserted.length;
      element?.focus();
      element?.setSelectionRange(position, position);
    });
  };

  return (
    <div className="mention-field">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        maxLength={maxLength}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={event => handleChange(event.target.value, event.target.selectionStart)}
        onKeyDown={event => {
          if (query === null) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(index => (index + 1) % Math.max(matches.length, 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(index => (index - 1 + matches.length) % Math.max(matches.length, 1));
          } else if (event.key === "Enter" && matches.length > 0) {
            event.preventDefault();
            pick(matches[Math.min(active, matches.length - 1)]);
          } else if (event.key === "Escape") {
            setQuery(null);
          }
        }}
      />
      {query !== null && matches.length > 0 && (
        <ul className="mention-menu" role="listbox" aria-label="选择要 @ 的成员">
          {matches.map((member, index) => (
            <li key={member.user_id} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={index === active ? "mention-option active" : "mention-option"}
                onMouseDown={event => event.preventDefault()}
                onClick={() => pick(member)}
              >
                @{member.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
