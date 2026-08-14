# DeepSeek Harness for VS Code

[![CI](https://github.com/lonelymoon87/dsh-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/lonelymoon87/dsh-vscode/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/lonelymoon87/dsh-vscode)](https://github.com/lonelymoon87/dsh-vscode/releases/latest)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.100%2B-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)
[![License](https://img.shields.io/github/license/lonelymoon87/dsh-vscode)](./LICENSE)

[English](README.md) | 中文

这是一个独立开发、仍处于预发布阶段的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) VS Code 客户端。扩展会在当前工作区启动官方 SDK runtime，把持久化会话日志流式投影到侧栏，展示工具执行过程，并用 VS Code 原生 diff 编辑器打开文件工具的结果。

本项目是社区项目，不由 DeepSeek 维护或背书。

## 真实模型演示

![DeepSeek Harness VS Code 真实 API 演示](https://github.com/lonelymoon87/dsh-vscode/blob/vscode-mvp-assets/dsh-vscode-real-api.gif?raw=true)

录屏使用发布版扩展架构、官方 VS Code 1.133.0 arm64、扩展内置的官方 DSH SDK runtime、`deepseek-official` / `deepseek-v4-flash`，并完成了一次真实 `bash` 工具调用；没有使用 fixture 或 mock transport。

## 功能

- 使用 `@deepseek-ai/dsh-sdk-client` 管理随扩展打包、可复用的 `dsh-jsonrpc-agent` 子进程。
- 流式展示根会话的助手消息和可折叠工具卡片。
- 根据持久化的 `tool/result.data.meta.diffs` 打开原生前后对比编辑器。
- 显示会话状态和输入、输出 token 汇总。
- 提供新建会话、重启 runtime、查看诊断输出命令。
- 权限固定为 `workspace-write`，需要交互审批的操作会按官方语义拒绝执行。

## 前置条件

- VS Code 1.100 或更新版本，并打开一个受信任的本地文件夹。
- `PATH` 中有 Node.js 22.19 或更新版本。runtime 必须作为独立 Node 进程运行，因为经过签名的 macOS 编辑器不能在自身 Electron 可执行文件中加载第三方原生模块。
- 与当前操作系统和 CPU 匹配的 VSIX。内置 runtime 含原生 subprocess 依赖，所以发行包按平台构建。
- 启动 VS Code 的进程环境中存在 `DEEPSEEK_API_KEY`。`DEEPSEEK_BASE_URL` 可选。扩展刻意不提供可填写密钥的设置项。

在 macOS 上，从 Dock 启动的 VS Code 可能拿不到 shell 环境变量。开发阶段最简单的方式是在已配置密钥的终端里运行 `code .`。

## 安装

下载并安装已经验证的 macOS arm64 VSIX：

```sh
curl -fLO https://github.com/lonelymoon87/dsh-vscode/releases/download/v0.1.0/dsh-vscode-darwin-arm64-0.1.0.vsix
code --install-extension dsh-vscode-darwin-arm64-0.1.0.vsix
```

首个版本目前只提供已经验证的 macOS arm64 构建，其他平台的构建仍待补齐。

也可以从源码构建：

```sh
pnpm install
pnpm run check
code --install-extension dsh-vscode-*-0.1.0.vsix
```

打开 Activity Bar 中的 **DeepSeek Harness** 视图并输入提示词。也可以用 `Cmd+Enter` 或 `Ctrl+Enter` 发送。

## 设置

| 设置 | 默认值 | 含义 |
|---|---:|---|
| `deepseekHarness.nodePath` | `node` | 内置 runtime 使用的 Node 22.19+ 可执行文件；若编辑器拿不到 shell 的 `PATH`，请填写绝对路径。 |
| `deepseekHarness.runtimeCommand` | 空 | 可选的外部 `dsh-jsonrpc-agent` 可执行文件；非空时会替代 `nodePath` 和内置入口。 |
| `deepseekHarness.runtimeArgs` | `[]` | 追加给 runtime 可执行文件的参数。 |
| `deepseekHarness.provider` | `deepseek-official` | `initialize` 请求使用的 provider route。 |
| `deepseekHarness.model` | `deepseek-v4-flash` | `initialize` 请求使用的模型 id。 |
| `deepseekHarness.maxTokens` | `49152` | 根 agent 每次请求的正整数输出 token 上限。 |

扩展通过 `DSH_CORDIS_CONFIG` 传入自带的 [`runtime/launcher/cordis.yml`](runtime/launcher/cordis.yml)，通过 `DSH_CWD` 传入第一个工作区文件夹，通过 `DSH_SESSION_ROOT` 传入扩展私有存储目录。VSIX 已包含版本匹配的官方 runtime 包。`runtimeArgs` 会追加在内置入口或配置的外部 runtime 命令之后。

## 安全与失败行为

扩展不支持不受信任的工作区和虚拟工作区。runtime 只把第一个本地工作区文件夹作为可写根目录，Webview 也不会通过 `innerHTML` 写入内容。SDK 传输错误会保留在会话记录和 **DeepSeek Harness** 输出通道中；重启 runtime 会替换失败进程并重新读取设置。

当前 SDK 协议没有 server 到 client 的审批请求，也没有 client 审批回复。随扩展提供的 runtime 配置因此固定使用 `workspace-write`，需要 answerer 的操作会被官方审批服务拒绝。扩展不会静默扩大权限。

## 已知限制

- rc.6 SDK 协议尚未提供中途取消、审批 UI、会话列表和会话恢复。
- 同一时间只展示一个根会话和一个工作区文件夹，子 agent 通知不会混入根会话记录。
- Markdown、图片附件和非 diff 的结构化工具展示目前会退化为纯文本。
- VS Marketplace 发布和签名发行仍待完成；GitHub Release 中的 VSIX 是未签名的社区构建。

## 开发

`pnpm run test` 覆盖事件投影，并让官方 SDK 对真实脚本化 JSON-RPC 子进程完成协议测试。`pnpm run package` 生成 VSIX。任何用户可见的 Pull Request 都必须附带从该分支真实扩展、runtime 和模型流程录制的 GIF；测试 fixture 不能代替发布证据。

贡献与安全报告方式见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。

## 发布验证

- `pnpm run check` 覆盖类型检查、单元测试、lint 和 VSIX 打包；
- CI 在 Node 22.19 与 Node 24 上运行；
- v0.1.0 VSIX 已装入全新的官方 VS Code profile，并完成真实模型回复、工具卡片和 token 用量投影；
- bug 与兼容性问题统一进入 [GitHub Issues](https://github.com/lonelymoon87/dsh-vscode/issues)。
