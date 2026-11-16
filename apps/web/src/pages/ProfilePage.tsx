import { deleteAvatar, updateProfile, uploadAvatar } from "@teamsync/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Avatar } from "../components/Avatar";
import { useMe } from "../hooks/useSession";
import { useAction } from "../hooks/useWork";
import { friendlyMessage } from "../lib/errors";
import { useToast } from "../lib/toast";

/** AUTH-8：与后端一致的限制；前端先挡一次，服务端仍会再校验。 */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export default function ProfilePage() {
  const me = useMe();
  const action = useAction();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  if(!me.data) return <p>资料加载中…</p>;

  // 头像会出现在侧栏、顶栏、成员列表与日历资源列，统一失效这些查询。
  const refreshUser = () => {
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    void queryClient.invalidateQueries({ queryKey: ["members"] });
  };

  const pickAvatar = async (file: File | undefined) => {
    setAvatarError("");
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setAvatarError("头像只支持 JPG、PNG 或 WebP 图片");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("头像不能超过 2 MB");
      return;
    }
    setUploading(true);
    try {
      await uploadAvatar(file);
      refreshUser();
      notify("头像已更新", { tone: "success" });
    } catch (err) {
      setAvatarError(friendlyMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarError("");
    setUploading(true);
    try {
      await deleteAvatar();
      refreshUser();
      notify("已恢复为首字母头像", { tone: "success" });
    } catch (err) {
      setAvatarError(friendlyMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return <section className="panel profile-panel">
    <div className="page-head compact">
      <div>
        <p className="eyebrow">账户</p>
        <h1>个人资料</h1>
        <p className="muted">显示名、头像与头像颜色会同步到团队成员列表与日历。</p>
      </div>
    </div>
    <div className="profile-grid">
      <article className="profile-card">
        <Avatar className="profile-avatar" name={me.data.display_name} color={me.data.avatar_color} url={me.data.avatar_url} />
        <strong>{me.data.display_name}</strong>
        <p className="muted">@{me.data.username}</p>
        <div className="profile-avatar-actions">
          <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? "处理中…" : me.data.avatar_url ? "更换头像" : "上传头像"}</button>
          {me.data.avatar_url ? <button type="button" className="btn btn-ghost btn-sm" disabled={uploading} onClick={() => void removeAvatar()}>移除头像</button> : null}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED.join(",")}
            aria-label="选择头像图片"
            hidden
            onChange={e => { void pickAvatar(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>
        <p className="muted profile-avatar-hint">支持 JPG / PNG / WebP，不超过 2 MB；不上传时显示显示名首字。</p>
        {avatarError ? <p className="profile-avatar-error" role="alert">{avatarError}</p> : null}
      </article>
      <form className="work-form profile-form" key={me.data.id} onSubmit={e => {
        e.preventDefault(); const data = new FormData(e.currentTarget);
        void action.run(() => updateProfile({display_name: String(data.get("name")), avatar_color: String(data.get("color"))})).catch(() => {});
      }}>
        <label>显示名<input name="name" defaultValue={me.data.display_name} maxLength={50} required /></label>
        <label>首字头像底色<input name="color" type="color" defaultValue={me.data.avatar_color} /></label>
        <button className="btn btn-primary" disabled={action.pending}>保存资料</button>
      </form>
    </div>
  </section>;
}
