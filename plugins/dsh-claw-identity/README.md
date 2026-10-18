# dsh-claw-identity · Claw 人设

治理套件 **Phase 1**：把 `~/.dsh/DSclaw/<agent>/` 里的核心文件打进该会话的系统提示。不拦截工具。

文件机制：

- `SOUL.md` / `IDENTITY.md` / `AGENTS.md` / `TOOLS.md`：每轮打进系统提示
- `BOOTSTRAP.md`：新建时有，初次问答（你叫什么、怎么称呼用户）还没做完就一并注入；做完由 Agent 删掉
- `USER.md` / `MEMORY.md` / 日记：由 `dsh-claw-memory` 在开场注入（有长度上限）
- `HEARTBEAT.md`：只存盘，可在核心 Tab 编辑。巡检默认关（`every: 0`），这一层不会空闲 tick

依赖 `dsh-claw-registry` 创建的 Claw 目录。卸掉本插件后，人设文件还在盘上，只是不再注入提示词。

## 安装

```sh
dsh plugin --profile web add github:xingyingyuzhui/dsh-claw-identity
```

装完重启 `dsh web`。

本地开发：

```sh
dsh plugin --profile web add link:/abs/path/to/dsh-claw-identity
```

## 这一层做什么

- 仅当 session cwd 在 `DSclaw` 下时注入人设
- 设置 → Claw Agent → 核心 tab 可读改这七个文件
- `USER.md` / `MEMORY.md` / `HEARTBEAT.md` 只存盘，这一层不塞进提示词

## 卸载

```sh
dsh plugin --profile web remove dsh-claw-identity
```

## License

MIT
