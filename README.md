# dsh-claw-governance-bundle

DSH（DeepSeek Harness）Claw 治理套件的组合分发仓：一个 **DSH 插件市场索引**（`index.json`）+ 8 个插件的源码副本（vendored，统一钉在 v0.3.0-rc.2）。

给每个 Claw Agent 独立的人设、权限天花板、记忆和审计。不改 DSH 源码，按官方 bundle 合同外挂。

## 来源与授权

本仓插件源码 vendored 自 [xingyingyuzhui/dsh-claw-suite](https://github.com/xingyingyuzhui/dsh-claw-suite)（各插件上游：`github.com/xingyingyuzhui/dsh-<name>`），原许可 **MIT** 逐包保留在各 `plugins/<name>/LICENSE`。本组合仓的整理与索引亦以 MIT 发布。版本对齐上游 `v0.3.0-rc.2` tag（2026-10-10）。

## 使用（作为市场索引源）

在 DSH「插件 → 实验性插件 → 自定义插件市场」打开后，于「发现」页添加索引源：

```
https://gray-harness.github.io/dsh-claw-governance-bundle/index.json
```

之后即可在「发现」中浏览并一键安装。8 个插件的安装顺序敏感，建议按序装完重启 DSH：

1. `dsh-observability` — 共用诊断日志底座
2. `dsh-agent-registry` — Agent 登记与侧栏分区
3. `dsh-agent-identity` — 人设文件注入
4. `dsh-agent-policy` — 策略声明
5. `dsh-session-permissions` — 三层权限交集展示
6. `dsh-agent-gate` — 权限闸与审计（真正拦截）
7. `dsh-agent-delegate` — 委派管理
8. `dsh-agent-memory` — 记忆金库

只装登记可以先看名单；没有闸，策略只是声明。

## 使用（作为源码研究面）

`plugins/` 下 8 个目录为并排源码副本，跨包以同级相对路径 import（依赖枢纽是 `dsh-session-permissions`），缺一个全套件跑不起来。分层与数据落盘见 [docs/architecture.md](docs/architecture.md)。

## 兼容性

v0.3.0-rc.2 世代要求 DSH `^0.2.0-rc.1`（由各包 `@deepseek-ai/dsh` peer 依赖声明）。会话初始化统一挂串行的 `agent/created`；`agent/session-start` 已移除，勿再订阅。

## 目录

```
index.json        # DSH 市场索引（format:1，GitHub Pages 发布）
plugins/          # 8 个插件源码副本（各含独立 LICENSE，MIT）
docs/             # architecture.md + 界面截图（来自上游合集仓）
LICENSE           # 根 LICENSE（MIT）
```
