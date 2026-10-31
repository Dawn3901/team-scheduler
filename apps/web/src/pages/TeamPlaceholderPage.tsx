interface TeamPlaceholderPageProps {
  title: string;
  description: string;
}

export default function TeamPlaceholderPage({ title, description }: TeamPlaceholderPageProps) {
  return (
    <section className="placeholder">
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      <p className="placeholder-note">该模块会在后续迭代接入，当前版本先跑通登录、建队与邀请码加入。</p>
    </section>
  );
}
