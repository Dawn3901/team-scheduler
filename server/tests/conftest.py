import atexit
import os
import shutil
import tempfile
from pathlib import Path

# 必须在导入 app.* 之前设置环境变量：config/db 在导入时读取配置。
_TEST_DIR = Path(tempfile.mkdtemp(prefix="teamsync-test-"))
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DIR / 'test.db'}"
atexit.register(shutil.rmtree, _TEST_DIR, ignore_errors=True)
