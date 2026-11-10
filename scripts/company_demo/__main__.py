"""从仓库根目录运行：server/.venv/bin/python -m scripts.company_demo seed|verify|serve。"""

import argparse
import json
import os
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["seed", "verify", "serve"])
    parser.add_argument(
        "--directory", type=Path, default=ROOT / "debug/company-demo-500"
    )
    parser.add_argument("--port", type=int, default=8018)
    args = parser.parse_args()
    directory = args.directory.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    database = directory / "company.db"
    config = directory / "runtime.json"
    if args.action == "seed":
        if database.exists() or config.exists():
            parser.error("目标已存在；为避免覆盖，请使用新的 --directory")
        config.write_text(json.dumps({"secret_key": secrets.token_hex(32)}))
        config.chmod(0o600)
    if not config.exists() or (args.action != "seed" and not database.exists()):
        parser.error("请先执行 seed")
    os.environ["SECRET_KEY"] = json.loads(config.read_text())["secret_key"]
    os.environ["LOG_LEVEL"] = "WARNING"
    os.environ["CORS_ORIGINS"] = "http://127.0.0.1:5186,http://localhost:5186"
    # 验证只使用在线备份副本；seed/serve 始终使用这个独立库。
    if args.action == "verify":
        import sqlite3
        import tempfile

        with tempfile.TemporaryDirectory(prefix="teamsync-company-check-") as temporary:
            copy = Path(temporary) / "check.db"
            with sqlite3.connect(database) as source, sqlite3.connect(copy) as target:
                source.backup(target)
            os.environ["DATABASE_URL"] = f"sqlite:///{copy}"
            from .verify import verify

            ok = verify(directory)
        sys.exit(0 if ok else 1)
    os.environ["DATABASE_URL"] = f"sqlite:///{database}"
    if args.action == "seed":
        from .dataset import seed

        seed(directory)
    else:
        import uvicorn

        uvicorn.run("app.main:app", host="127.0.0.1", port=args.port, workers=1)


if __name__ == "__main__":
    main()
