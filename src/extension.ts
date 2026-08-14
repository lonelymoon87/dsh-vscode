/** VS Code extension entrypoint for the DeepSeek Harness SDK client. */

import * as vscode from 'vscode'
import { DIFF_SCHEME, DiffDocumentProvider } from './diff-provider.ts'
import { RuntimeController, type RuntimeOptions } from './runtime.ts'
import { HarnessViewProvider } from './webview.ts'

let runtime: RuntimeController | undefined

function readRuntimeOptions(context: vscode.ExtensionContext, workspaceRoot: string): RuntimeOptions {
  const config = vscode.workspace.getConfiguration('deepseekHarness')
  return {
    workspaceRoot,
    sessionRoot: context.globalStorageUri.fsPath,
    cordisConfig: vscode.Uri.joinPath(context.extensionUri, 'dist', 'runtime', 'cordis.yml').fsPath,
    bundledBin: vscode.Uri.joinPath(
      context.extensionUri,
      'dist',
      'runtime',
      'node_modules',
      '@deepseek-ai',
      'dsh-sdk-jsonrpc-demo',
      'lib',
      'bin.js',
    ).fsPath,
    nodePath: config.get<string>('nodePath', 'node'),
    runtimeCommand: config.get<string>('runtimeCommand', '').trim(),
    args: config.get<string[]>('runtimeArgs', []),
    provider: config.get<string>('provider', 'deepseek-official'),
    model: config.get<string>('model', 'deepseek-v4-flash'),
    maxTokens: config.get<number>('maxTokens', 49152),
  }
}

/** Activate the workspace extension and register its sidebar and commands. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('DeepSeek Harness', { log: true })
  const diffs = new DiffDocumentProvider()
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (workspaceRoot !== undefined) {
    await vscode.workspace.fs.createDirectory(context.globalStorageUri)
    runtime = new RuntimeController(() => readRuntimeOptions(context, workspaceRoot))
  }
  const view = new HarnessViewProvider(context.extensionUri, runtime, diffs, output)

  context.subscriptions.push(
    output,
    diffs,
    vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, diffs),
    vscode.window.registerWebviewViewProvider('deepseekHarness.chat', view, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('deepseekHarness.newSession', () => view.newSession()),
    vscode.commands.registerCommand('deepseekHarness.restartRuntime', () => view.restartRuntime()),
    vscode.commands.registerCommand('deepseekHarness.showLogs', () => output.show()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('deepseekHarness')) return
      void vscode.window.showInformationMessage(
        'DeepSeek Harness settings changed. Restart the runtime to apply them.',
        'Restart Runtime',
      ).then((choice) => choice === 'Restart Runtime' ? view.restartRuntime() : undefined)
    }),
    { dispose: () => { void runtime?.close() } },
  )
  output.appendLine(workspaceRoot === undefined
    ? 'Extension activated without a local workspace.'
    : `Extension activated for ${workspaceRoot}.`)
}

/** Shut down the SDK-owned runtime subprocess. */
export async function deactivate(): Promise<void> {
  await runtime?.close()
  runtime = undefined
}
