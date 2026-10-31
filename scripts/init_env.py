"""首次运行时生成 .env，避免缺 SECRET_KEY 的 Pydantic 堆栈。

用法：python scripts/init_env.py
- 已存在 .env 时不覆盖；
- 否则复制 .env.example，并把 SECRET_KEY 替换为随机值。
"""

from __future__ import annotations

import secrets
from pathlib import Path

SECRET_BYTES = 48


def init_env(root: Path) -> tuple[Path, bool]:
    """确保 root/.env 存在；返回 (路径, 是否新建)。"""
    env_path = root / ".env"
    if env_path.exists():
        return env_path, False

    example_path = root / ".env.example"
    if not example_path.exists():
        raise FileNotFoundError(f"找不到 {example_path}，无法生成 .env")

    lines: list[str] = []
    replaced = False
    for line in example_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("SECRET_KEY="):
            line = f"SECRET_KEY={secrets.token_urlsafe(SECRET_BYTES)}"
            replaced = True
        lines.append(line)
    if not replaced:
        lines.append(f"SECRET_KEY={secrets.token_urlsafe(SECRET_BYTES)}")

    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    env_path.chmod(0o600)
    return env_path, True


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    try:
        env_path, created = init_env(root)
    except FileNotFoundError as exc:
        print(exc)
        return 1
    if created:
        print(f"已生成 {env_path}（SECRET_KEY 为随机值，可按需修改）。")
    else:
        print(f"{env_path} 已存在，跳过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
