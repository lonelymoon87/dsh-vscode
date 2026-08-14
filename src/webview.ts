/** VS Code sidebar view that projects official SDK notifications. */

import { randomBytes, randomUUID } from 'node:crypto'
import * as vscode from 'vscode'
import type { DiffDocumentProvider } from './diff-provider.ts'
import type { RuntimeController } from './runtime.ts'
import { addUserPrompt, applyError, applyNotification, createUiState, type UiState } from './state.ts'

type ClientMessage =
  | { readonly type: 'prompt'; readonly text: string }
  | { readonly type: 'newSession' }
  | { readonly type: 'restartRuntime' }
  | { readonly type: 'openDiff'; readonly callId: string; readonly index: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseClientMessage(value: unknown): ClientMessage | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined
  if (value.type === 'prompt' && typeof value.text === 'string') return { type: 'prompt', text: value.text }
  if (value.type === 'newSession') return { type: 'newSession' }
  if (value.type === 'restartRuntime') return { type: 'restartRuntime' }
  if (value.type === 'openDiff' && typeof value.callId === 'string'
    && typeof value.index === 'number' && Number.isInteger(value.index)) {
    return { type: 'openDiff', callId: value.callId, index: value.index }
  }
  return undefined
}

/** Own the sidebar transcript and bridge user actions to one runtime controller. */
export class HarnessViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private state: UiState

  /**
   * @param extensionUri - Root URI used to resolve bundled webview assets.
   * @param runtime - Workspace-scoped runtime, absent when no folder is open.
   * @param diffs - Virtual-document provider for native diff editors.
   * @param output - Diagnostic output channel.
   */
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly runtime: RuntimeController | undefined,
    private readonly diffs: DiffDocumentProvider,
    private readonly output: vscode.OutputChannel,
  ) {
    const sessionId = runtime?.sessionId ?? 'workspace-required'
    this.state = createUiState(sessionId)
    if (runtime === undefined) {
      applyError(this.state, new Error('Open a trusted local folder to start DeepSeek Harness.'))
    }
  }

  /** Configure and hydrate the contributed Webview view. */
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    }
    view.webview.html = this.html(view.webview)
    view.webview.onDidReceiveMessage(value => void this.handleMessage(value))
    this.publish()
  }

  /** Start a clean session while retaining the shared runtime process. */
  newSession(): void {
    if (this.runtime === undefined) return
    try {
      this.state = createUiState(this.runtime.newSession())
    } catch (error) {
      applyError(this.state, error)
    }
    this.publish()
  }

  /** Restart the runtime and apply the latest extension settings. */
  async restartRuntime(): Promise<void> {
    if (this.runtime === undefined) return
    this.state.status = 'starting'
    delete this.state.error
    this.publish()
    this.output.appendLine('Restarting dsh-jsonrpc-agent.')
    try {
      await this.runtime.restart()
      this.state.status = 'idle'
      this.output.appendLine('dsh-jsonrpc-agent initialized.')
    } catch (error) {
      applyError(this.state, error)
      this.output.appendLine(`Runtime restart failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    this.publish()
  }

  private async handleMessage(value: unknown): Promise<void> {
    const message = parseClientMessage(value)
    if (message === undefined) return
    if (message.type === 'newSession') {
      this.newSession()
      return
    }
    if (message.type === 'restartRuntime') {
      await this.restartRuntime()
      return
    }
    if (message.type === 'openDiff') {
      const card = this.state.tools.find(candidate => candidate.callId === message.callId)
      const diff = card?.diffs?.[message.index]
      if (diff !== undefined) await this.diffs.open(diff)
      return
    }
    await this.sendPrompt(message.text)
  }

  private async sendPrompt(prompt: string): Promise<void> {
    if (this.runtime === undefined) return
    const text = prompt.trim()
    if (text.length === 0) return
    addUserPrompt(this.state, randomUUID(), text)
    this.publish()
    this.output.appendLine(`Running session ${this.state.sessionId}.`)
    try {
      await this.runtime.run(text, (notification) => {
        applyNotification(this.state, notification)
        this.publish()
      })
      if (this.state.status !== 'error') this.state.status = 'idle'
      this.output.appendLine(`Session ${this.state.sessionId} is idle.`)
    } catch (error) {
      applyError(this.state, error)
      this.output.appendLine(`Turn failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    this.publish()
  }

  private publish(): void {
    void this.view?.webview.postMessage({ type: 'state', state: this.state })
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'))
    const styles = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'))
    const nonce = randomBytes(18).toString('base64')
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styles}">
  <title>DeepSeek Harness</title>
</head>
<body>
  <header>
    <div>
      <strong>DeepSeek Harness</strong>
      <span id="status" class="status">idle</span>
    </div>
    <div class="actions">
      <button id="new-session" type="button" title="New session">New</button>
      <button id="restart-runtime" type="button" title="Restart runtime">Restart</button>
    </div>
  </header>
  <main id="transcript" aria-live="polite"></main>
  <footer>
    <div id="usage" class="usage"></div>
    <label class="sr-only" for="prompt">Prompt</label>
    <textarea id="prompt" rows="3" placeholder="Ask DeepSeek Harness…"></textarea>
    <button id="send" class="primary" type="button">Send</button>
  </footer>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`
  }
}
