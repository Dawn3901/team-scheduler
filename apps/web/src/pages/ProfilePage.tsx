import { updateProfile } from "@teamsync/shared";
import { useMe } from "../hooks/useSession";
import { useAction } from "../hooks/useWork";

export default function ProfilePage() {
  const me = useMe();
  const action = useAction();
  if(!me.data) return <p>资料加载中…</p>;
  return <section className="panel profile-panel">
    <div className="page-head compact">
      <div>
        <p className="eyebrow">账户</p>
        <h1>个人资料</h1>
        <p className="muted">显示名与头像颜色会同步到团队成员列表。</p>
      </div>
    </div>
    <div className="profile-grid">
      <article className="profile-card">
        <span className="profile-avatar" style={{backgroundColor: me.data.avatar_color}} aria-hidden="true">{Array.from(me.data.display_name)[0] ?? "?"}</span>
        <strong>{me.data.display_name}</strong>
        <p className="muted">@{me.data.username}</p>
      </article>
      <form className="work-form profile-form" key={me.data.id} onSubmit={e => {
        e.preventDefault(); const data = new FormData(e.currentTarget);
        void action.run(() => updateProfile({display_name: String(data.get("name")), avatar_color: String(data.get("color"))})).catch(() => {});
      }}>
        <label>显示名<input name="name" defaultValue={me.data.display_name} maxLength={50} required /></label>
        <label>头像颜色<input name="color" type="color" defaultValue={me.data.avatar_color} /></label>
        <button className="btn btn-primary" disabled={action.pending}>保存资料</button>
      </form>
    </div>
  </section>;
}
