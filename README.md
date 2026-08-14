# DeepSeek Harness for VS Code

English | [中文](README.zh-CN.md)

An independent, pre-release VS Code client for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It opens an official SDK runtime in the current workspace, streams the durable session log into a sidebar, shows tool activity, and opens file-tool results in VS Code's native diff editor.

This community project is not maintained or endorsed by DeepSeek.

## Features

- Reusable, bundled `dsh-jsonrpc-agent` subprocess managed by `@deepseek-ai/dsh-sdk-client`.
- Streaming root-session assistant messages and collapsible tool cards.
- Native before/after diff editors from durable `tool/result.data.meta.diffs`.
- Session state and input/output token totals.
- New-session, runtime-restart, and diagnostic-output commands.
- Fixed `workspace-write` sandbox policy; operations that require interactive approval fail closed.

## Prerequisites

- VS Code 1.100 or newer with a trusted local folder open.
- Node.js 22.19 or newer on `PATH`. The runtime is a separate Node process because signed macOS editors cannot load third-party native modules into their Electron executable.
- A VSIX built for the current operating system and CPU. The embedded runtime contains native subprocess dependencies, so release artifacts are platform-specific.
- `DEEPSEEK_API_KEY` in the environment that launches VS Code. `DEEPSEEK_BASE_URL` is optional. The extension deliberately has no secret-valued setting.

On macOS, a VS Code process started from the Dock may not inherit shell variables. Launching `code .` from a configured shell is the simplest development setup.

## Install from source

```sh
pnpm install
pnpm run check
code --install-extension dsh-vscode-*-0.1.0.vsix
```

Open the **DeepSeek Harness** Activity Bar view and submit a prompt. `Cmd+Enter` or `Ctrl+Enter` also sends the prompt.

## Settings

| Setting | Default | Meaning |
|---|---:|---|
| `deepseekHarness.nodePath` | `node` | Node 22.19+ executable for the bundled runtime; set an absolute path when the editor does not inherit the shell `PATH`. |
| `deepseekHarness.runtimeCommand` | empty | Optional external `dsh-jsonrpc-agent` executable that replaces `nodePath` and the bundled entrypoint. |
| `deepseekHarness.runtimeArgs` | `[]` | Arguments appended to the resolved runtime executable. |
| `deepseekHarness.provider` | `deepseek-official` | Provider route sent during `initialize`. |
| `deepseekHarness.model` | `deepseek-v4-flash` | Model id sent during `initialize`. |
| `deepseekHarness.maxTokens` | `49152` | Positive output-token cap for each root-agent request. |

The extension passes its bundled [`runtime/launcher/cordis.yml`](runtime/launcher/cordis.yml) through `DSH_CORDIS_CONFIG`, the first workspace folder through `DSH_CWD`, and extension-private storage through `DSH_SESSION_ROOT`. The VSIX includes the matching official runtime packages. `runtimeArgs` follow the bundled entrypoint or the configured external runtime command.

## Security and failure behavior

Untrusted and virtual workspaces are unsupported. The runtime receives the first local workspace folder as its writable root, and the extension never sends webview HTML through `innerHTML`. SDK transport errors remain visible in the transcript and the **DeepSeek Harness** output channel; restarting replaces the failed process and re-reads settings.

The current SDK wire has no server-to-client approval request or client approval response. The included runtime therefore uses a fixed `workspace-write` policy, and the official approval service rejects operations that require an answerer. The extension does not silently broaden permissions.

## Known limitations

- No mid-turn cancel, approval UI, session list, or session resume because the rc.6 SDK protocol does not expose those operations.
- One active root session and one workspace folder are shown at a time; descendant notifications are not mixed into the root transcript.
- Markdown, image attachments, and structured non-diff tool presentations fall back to plain text.
- Marketplace publication and signed release artifacts have not started.

## Development

`pnpm run test` covers notification projection and the official SDK against a real scripted JSON-RPC subprocess. `pnpm run package` builds a VSIX. Product-visible pull requests must include a GIF captured from the branch's real extension, runtime, and model flow; fixtures are test inputs, not release evidence.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
