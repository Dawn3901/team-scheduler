"""单进程写入串行化：先刷新事务读到的状态，再执行完整业务提交。"""

from functools import wraps
from threading import RLock, local

_lock = RLock()
_state = local()


def serialized_write(function):
    @wraps(function)
    def wrapped(db, *args, **kwargs):
        with _lock:
            outermost = not getattr(_state, "depth", 0)
            if outermost:
                db.expire_all()
            _state.depth = getattr(_state, "depth", 0) + 1
            try:
                return function(db, *args, **kwargs)
            except Exception:
                if outermost:
                    db.rollback()
                raise
            finally:
                _state.depth -= 1

    return wrapped
