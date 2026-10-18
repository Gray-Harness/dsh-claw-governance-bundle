# dsh-claw-governance-bundle

DSH（DeepSeek Harness）Claw 治理套件的**组合分发仓**：仓根本身是一个元组合包（meta bundle），贴一次 GitHub 地址即装齐全部 9 个组件；同时提供 DSH 插件市场索引（`index.json`），可在「发现」页单装任一组件。

给每个 Claw Agent 独立的人设、权限天花板、记忆和审计。不改 DSH 源码，按官方 bundle 合同外挂。

## 安装

要求：DSH `^0.2.0-rc.1`（rc2 世代），Node 20+。

**方式一：一键装全套（推荐）**

DSH 插件页「安装」框粘贴仓库地址：

```
https://github.com/Gray-Harness/dsh-claw-governance-bundle
```

或命令行：`dsh plugin --profile <profile> add github:Gray-Harness/dsh-claw-governance-bundle`

装完重启 DSH。安装顺序已由元包处理（observability → registry → identity → policy → permissions → gate → delegate → memory）。

**方式二：市场索引（可单装组件、有更新提示）**

「发现」页添加索引源：

```
https://gray-harness.github.io/dsh-claw-governance-bundle/index.json
```

## 来源、授权与 fork 分歧

插件源码 vendored 自 [xingyingyuzhui/dsh-claw-suite](https://github.com/xingyingyuzhui/dsh-claw-suite) `v0.3.0-rc.2`（各组件上游 `github.com/xingyingyuzhui/dsh-claw-*`），原许可 **MIT** 逐包保留在各 `plugins/<name>/LICENSE`；根 LICENSE 双版权（上游 + Gray-Harness）。

与上游的分歧（README 声明，共两处）：

1. **内部依赖改写为 `file:` 相对路径**。上游 rc2 依赖 `dsh-claw-core@0.3.0-rc.2` 等 npm 语义版本，但不上架 npm，官方装法是 Release 包 + 本地 installer + profile overrides；本 fork 把成员包互依改为 `file:../<sib>` 相对路径，使 pnpm 在 git 安装时完全不走 registry（绕过 `blockExoticSubdeps` 限制），从而支持「贴仓库地址即装」和市场索引分发。
2. **仓根即元包**。上游合集仓根不可安装（`dsh plugin add` 要求仓根是插件包）；本仓根本身声明 `dsh.bundle` 并一次插入全部组件（对齐官方 `@deepseek-ai/dsh-web-app` 的元包模式）。

## 目录

```
package.json          # 元组合包声明（dsh.bundle + 9 个成员依赖）
cordis.patch.yml      # 一次插入全部组件（scheme A，fork 自上游）
host.js               # 元包宿主（加载即证明元包在场）
plugins/              # 9 个成员包源码（8 插件 + dsh-claw-core 共享库）
index.json            # DSH 市场索引（format:1，GitHub Pages 发布）
docs/                 # architecture.md + 界面截图（来自上游合集仓）
LICENSE               # 根 LICENSE（MIT）
```

## 兼容性

v0.3.0-rc.2 世代，peer `@deepseek-ai/dsh ^0.2.0-rc.1`。会话初始化统一挂串行的 `agent/created`；`agent/session-start` 已移除，勿再订阅。
