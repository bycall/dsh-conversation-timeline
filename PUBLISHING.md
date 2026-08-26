# 发布指南（GitHub / npm / dsh-market）

把本插件发布到 dsh-market 的全流程。核心机制：**dshmarket 市场 App 的目录来自 curated 仓库
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)**——发布 = 插件
托管到 GitHub + （推荐）发布 npm + 向 awesome-dsh-plugin 提交一条目录 PR。市场 CI 每日刷新，
收录后即可在 DSH 的 **设置 → 插件市场** 一键安装。

## 0. 前置：仓库门禁（提交目录 PR 时自动校验）

- 仓库内包含 `dsh.bundle` 声明（本插件 `package.json` 已有 `dsh.bundle.patch` ✓）
- 仓库 **≥ 1 天历史**
- 仓库 **≥ 10 个 commit**

## 1. 托管 GitHub

```bash
cd /Users/bycall/Downloads/workbuddy/Claw/dsh-conversation-timeline
# 1) 在 github.com 新建同名空仓库 dsh-conversation-timeline（不要勾选 README/gitignore）
# 2) 替换 package.json 中 repository 字段的 <your-github-owner> 为你的用户名
# 3) 推送
git remote add origin git@github.com:<your-github-owner>/dsh-conversation-timeline.git
git push -u origin main
```

> 本仓库已初始化并拆分为 10 个语义提交（满足门禁）。若仓库创建时已选 README/gitignore，
> 先 `git pull --rebase origin main` 再 push。

## 2. 发布 npm（推荐，市场内一键安装体验最佳）

```bash
cd /Users/bycall/Downloads/workbuddy/Claw/dsh-conversation-timeline
npm login                        # 需 npm 账号
npm publish                      # 包名 dsh-conversation-timeline（已确认未被占用）
```

- `package.json` 的 `repository` 必须指回 GitHub 仓库——awesome-dsh-plugin 的
  `probe-npm.mjs` 会自动做该校验，仓库与 npm 不一致会导致 npm 映射失效。
- 发布内容由 `files` 字段控制：`lib/`、`cordis.patch.yml`、`README.md`、`LICENSE`。
- 版本迭代：改 `version` 后重新 `npm publish`。

## 3. 提交市场收录条目（PR）

1. fork `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`；
2. 在 fork 的 `data/plugins/` 下新增 `<your-github-owner>__dsh-conversation-timeline.yml`
   （内容见 `release/dshmarket-submission.yml`，**把 owner 替换为实际值**）；
3. 发起 PR 到 main 分支——CI（`pr-gate.yml`）会自动校验 dsh.bundle / 仓库年龄 / commit 数；
4. 合并后，市场 `plugins.json` 由 CI 每日刷新，通常 **1 天内** 在插件市场可搜到。

## 条目字段约束

条目 YAML 仅允许以下字段（其余一律拒绝）：

| 字段 | 说明 |
| --- | --- |
| `url` | 必须 `https://github.com/owner/repo` |
| `name` | 插件名 |
| `category` | 合法类别之一：`ui usage theme model identity session memory tools browser vision voice docs skill workflow git notify dev security remote market fun` |
| `description.en` | 必填，单行 |
| `description.zh` | 可选，缺失时回退英文 |
| `tarball` | 可选，GitHub Releases 上的 `.tgz` 预构建包 URL |

> 条目中**不要**写 `npm:` 字段——npm 映射由系统从仓库自动探测。
> 文件名必须等于 `slugFor(url)`，即 `<owner>__<repo>.yml`。

## 4. 验证

```bash
node --check lib/client.js
node test/smoke.cjs
npm pack --dry-run        # 检查发布到 npm 的文件清单
```
