# dsh-conversation-timeline

DeepSeek Harness（dsh）对话时间线插件：把当前会话渲染成**带时间节点的有序时间线**（轮次、消息、工具调用、命令、压缩、重试、错误等交互节点），**点击任意节点直接跳转到对话中的对应位置**。

> 背景：dsh web 对话界面原本没有时间线/时间节点/点击跳转能力（内置 Trajectory 只是工具调用级时序账本，且明确「无锚点深链」）。本插件补上这一能力。

## 功能

| 能力 | 说明 |
| --- | --- |
| **嵌入对话流的 dock 横条** | **输入框上方的横向时间线导航条**（`conversation.input.dock` 插槽，官方预留的"独占一行"位），左右边缘与**文本显示宽度**（`--dsh-chat-content-width`，748px）对齐：按轮次聚合为胶囊节点（状态圆点 + 轮号 + 起始时间，当前轮高亮、运行态绿色脉冲、出错红色），节点间细连接线串成时间链，**鼠标悬停弹出该轮用户提示词气泡**（portal 到页面根部，不受横向滚动容器裁剪）；横向滚动，点击任意轮次直接跳转到该轮第一条消息。聊天时始终可见，不占视图切换位。 |
| 点击跳转 | 点击轮次胶囊 → 切回「对话」视图 → 平滑滚动到该轮第一条消息并短暂高亮。若目标在未加载的更早记录中，自动调用 `loadOlder`（最多 3 次）后重试。 |
| 实时刷新 | 基于会话快照驱动，新消息/新工具调用/轮次结束即时出现在时间线上。 |

## 安装

```bash
dsh plugin --profile web add file:/Users/bycall/Downloads/workbuddy/Claw/dsh-conversation-timeline
```

然后在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 数组中加入 `"dsh-conversation-timeline"`，重启 DSH.app（或硬刷新浏览器窗口）生效。

## 卸载

```bash
dsh plugin --profile web remove dsh-conversation-timeline
```

## 工作原理

- **插槽注册**（客户端）：通过 `ctx.slots` 注册一个会话级插槽——
  - `conversation.input.dock`（id `timeline-dock`）：输入框上方的横向时间线导航条（dock 插槽的 owner share 直接提供 `session` 会话快照 + `input` 状态，无需再订阅）。
- **数据来源**：插槽组件拿到会话快照，读取 `snapshot.chat.order` / `snapshot.chat.nodes`（节点的 `key`、`kind`、`data`、`location`）与 `snapshot.turnTimings`（轮次起止时间）聚合为轮次胶囊；轮次提示词取该轮第一条用户消息（user/steering 节点可能不带 turn location，做了归属回退与 pending 挂载），无则回退首个有文本节点。
- **跳转机制**：每条消息行 DOM 都带 `data-chat-anchor-key="<Context key>"`（dsh 聊天视图的内置语义锚点），跳转 = 找到该行 → `scrollIntoView` + 高亮；dock 点击先按 label 点击 `[role="tab"]` 切回「对话」（中文「对话」/ 英文「Chat」，回退首个 Tab），再轮询等待目标行挂载后滚动（社区既有模式，参考 dsh-mnemon）。

## 目录结构

```
dsh-conversation-timeline/
├── package.json          # dsh.bundle.patch + dsh.client + exports["./client"]
├── cordis.patch.yml      # 挂载插件到 profile 层叠
├── lib/
│   ├── index.js          # 服务端挂载入口（UI-only，最小实现）
│   └── client.js         # 客户端 bundle（window.__ModuleLoader__.load 格式）
└── test/
    └── smoke.cjs         # 冒烟测试（mock ModuleLoader + ctx）
```

## 开发说明

- 纯手写客户端 bundle（仅依赖 `react`，零构建步骤），格式遵循 dsh web 的 lazy-CJS 模块表契约：`window.__ModuleLoader__.load({ id, factory })`。
- `dsh.client.inject` 声明了插件可用的客户端服务：`slots` / `sessions` / `locale`。
- 校验：`node --check lib/client.js`；冒烟测试 `node test/smoke.cjs`（mock `__ModuleLoader__` 与 cordis ctx，断言仅 `conversation.input.dock[timeline-dock]` 注册、其余会话插槽无占用）。
- 时间线条目数据提取为防御式（对节点 `data` 形态差异做兜底），新节点种类默认归入「系统事件」。

## License

MIT
