# dsh-claw-observability

治理套件共用的诊断日志，以及设置里的 **运行诊断** 页。其它插件通过同级的 `../dsh-claw-observability/observe.mjs` 写日志；本包再提供按错误码 / `traceId` 看时间线的页面。

```sh
dsh plugin --profile web add github:xingyingyuzhui/dsh-claw-observability
```

装完重启 `dsh web`。打开 **设置 → 运行诊断**（在「审计」旁边）。

改 Client 源码后执行 `npm run build`，不要手改生成的 `client.js`。

- 记操作终态，不记每次内部函数调用
- 终态只能是 `succeeded` / `rejected` / `failed` / `degraded`
- 字段白名单，不写 prompt、memory/identity 正文、工具参数、token；字符串字段默认把家目录换成 `~`、遮蔽 token 值与 `password=` 一类凭据
- `runWithTrace(input, fn)` 的 `input` 可以是 traceId、HTTP `Request`（`x-dsh-trace` 头）、`{ traceId }` 或工具执行对象（同一 `rootCallId` 共用一条 trace）
- 诊断落在 `$DSH_HOME/agent-observe/diag.jsonl`；写失败退回 stderr
- `POST /api/dsh-claw/observability/query` 收 `{ limit?, cursor? }`（`limit` 最大 2000），从文件尾按块倒读，返回 `{ items, truncated, hasMore, nextCursor }`；把 `nextCursor` 原样传回就能继续往前翻
- 安全审计仍由 `dsh-claw-gate` 写 `agent-gate/audit.jsonl`
