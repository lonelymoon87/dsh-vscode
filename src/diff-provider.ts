/** Native VS Code diff documents backed by durable tool-result metadata. */

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import * as vscode from 'vscode'
import type { UiDiff } from './state.ts'

/** URI scheme for in-memory before/after documents. */
export const DIFF_SCHEME = 'dsh-diff'

/** Provide immutable in-memory documents to VS Code's native diff editor. */
export class DiffDocumentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly documents = new Map<string, string>()

  /** Return the registered content for one virtual document. */
  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.documents.get(uri.toString()) ?? ''
  }

  /** Open one tool-reported change in VS Code's native side-by-side diff editor. */
  async open(diff: UiDiff): Promise<void> {
    const id = randomUUID()
    const basename = path.basename(diff.path) || 'untitled'
    const left = vscode.Uri.from({ scheme: DIFF_SCHEME, path: `/${id}/before/${basename}` })
    const right = vscode.Uri.from({ scheme: DIFF_SCHEME, path: `/${id}/after/${basename}` })
    this.documents.set(left.toString(), diff.oldText ?? '')
    this.documents.set(right.toString(), diff.newText)
    await vscode.commands.executeCommand('vscode.diff', left, right, `${diff.path} (DeepSeek Harness)`)
  }

  /** Release all virtual document contents. */
  dispose(): void {
    this.documents.clear()
  }
}
