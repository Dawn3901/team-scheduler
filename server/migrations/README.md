# Alembic 迁移

- 每个功能分支只加一个迁移，命名 `YYYYMMDD_short_desc`。
- 必须能从空库跑到 head，也能从上一版升级。
- 当前 `0001_initial` 是 W1-02 的空基线；表结构在 W1-04 加入。
