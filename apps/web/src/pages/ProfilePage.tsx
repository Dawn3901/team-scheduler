import { updateProfile } from "@teamsync/shared";
import { useMe } from "../hooks/useSession";
import { useAction } from "../hooks/useWork";

export default function ProfilePage() {
  const me = useMe();
  const action = useAction();
  if(!me.data) return <p>资料加载中…</p>;
  return <section className="panel"><h1>个人资料</h1><p>用户名：{me.data.username}</p>
    <form className="work-form" key={me.data.id} onSubmit={e => {
      e.preventDefault(); const data = new FormData(e.currentTarget);
      void action.run(() => updateProfile({display_name: String(data.get("name")), avatar_color: String(data.get("color"))})).catch(() => {});
    }}>
      <label>显示名<input name="name" defaultValue={me.data.display_name} maxLength={50} required /></label>
      <label>头像颜色<input name="color" type="color" defaultValue={me.data.avatar_color} /></label>
      {action.error && <p role="alert">{action.error}</p>}
      <button className="btn btn-primary" disabled={action.pending}>保存资料</button>
    </form>
  </section>;
}
