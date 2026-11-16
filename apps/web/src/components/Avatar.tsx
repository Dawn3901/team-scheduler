import { useState, type ReactNode } from "react";

interface AvatarProps {
  name: string;
  color?: string | null;
  /** 上传头像地址（AUTH-8）；为空或加载失败时回退首字母 + 颜色。 */
  url?: string | null;
  className?: string;
  /** 传给外层容器的行内样式（宽度/圆角等在 CSS 里按类名控制）。 */
  style?: React.CSSProperties;
  title?: string;
}

/**
 * 统一头像：有上传图片显示图片，否则显示首字母色块。
 * 图片加载失败（已删除/网络错误）时自动回退，不留破图。
 */
export function Avatar({ name, color, url, className = "avatar", style, title }: AvatarProps): ReactNode {
  const [broken, setBroken] = useState(false);
  // 地址变化（或重新上传）时重新尝试加载，不能沿用上一次的失败状态。
  const [lastUrl, setLastUrl] = useState(url);
  if (url !== lastUrl) {
    setLastUrl(url);
    setBroken(false);
  }
  const fallback = (color ?? "#4f46e5") || "#4f46e5";
  if (url && !broken) {
    return (
      <img
        className={`${className} avatar-image`}
        src={url}
        alt=""
        title={title}
        style={style}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={className} style={{ backgroundColor: fallback, ...style }} title={title} aria-hidden="true">
      {(name ? Array.from(name)[0] : "") ?? "?"}
    </span>
  );
}
