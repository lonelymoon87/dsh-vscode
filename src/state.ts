/** Pure projection from SDK notifications to the sidebar's serializable state. */

import type { HarnessNotification } from '@deepseek-ai/dsh-sdk-client'

/** One file change exposed to VS Code's native diff editor. */
export interface UiDiff {
  readonly path: string
  readonly oldText: string | null
  readonly newText: string
}

/** One chat transcript message. */
export interface UiMessage {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  text: string
  streaming?: true
}

/** One model-requested tool call and its eventual result. */
export interface UiToolCard {
  readonly callId: string
  readonly name: string
  readonly arguments: unknown
  status: 'running' | 'completed' | 'failed'
  output?: string
  error?: string
  diffs?: UiDiff[]
}

/** Token counts accumulated from assembled assistant messages. */
export interface UiUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  reasoningTokens: number
}

/** Complete sidebar state sent to the webview. */
export interface UiState {
  sessionId: string
  status: 'idle' | 'running' | 'starting' | 'error'
  messages: UiMessage[]
  tools: UiToolCard[]
  usage: UiUsage
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function textBlocks(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.flatMap((block) => {
    if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') return []
    return [block.text]
  }).join('')
}

function toolResultBlock(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) return undefined
  return value.find(block => isRecord(block) && block.type === 'tool-result') as Record<string, unknown> | undefined
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function parseDiffs(value: unknown): UiDiff[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.diffs)) return undefined
  const diffs: UiDiff[] = []
  for (const candidate of value.diffs) {
    if (!isRecord(candidate) || typeof candidate.path !== 'string'
      || (candidate.oldText !== null && typeof candidate.oldText !== 'string')
      || typeof candidate.newText !== 'string') continue
    diffs.push({ path: candidate.path, oldText: candidate.oldText, newText: candidate.newText })
  }
  return diffs.length === 0 ? undefined : diffs
}

/** Create a fresh empty session projection. */
export function createUiState(sessionId: string): UiState {
  return {
    sessionId,
    status: 'idle',
    messages: [],
    tools: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0 },
  }
}

/** Add the locally submitted user prompt before its durable receipt arrives. */
export function addUserPrompt(state: UiState, id: string, text: string): void {
  state.messages.push({ id, role: 'user', text })
  state.status = 'starting'
  delete state.error
}

/** Project one official SDK notification. Unknown methods and event types are ignored. */
export function applyNotification(state: UiState, notification: HarnessNotification): void {
  if (notification.params.sessionId !== state.sessionId) return
  if (notification.method === 'session.status') {
    const status = notification.params.status
    if (status === 'running' || status === 'idle') state.status = status
    return
  }
  if (notification.method !== 'session.event') return
  const event = notification.params.event
  if (!isRecord(event) || typeof event.type !== 'string' || !isRecord(event.data)) return
  const data = event.data

  if (event.type === 'assistant/chunk') {
    const chunk = data.chunk
    if (!isRecord(chunk) || chunk.type !== 'text-delta' || typeof chunk.text !== 'string') return
    const turn = numberField(data.turn)
    const step = numberField(data.step)
    const id = `assistant-${turn}-${step}`
    let message = state.messages.find(candidate => candidate.id === id)
    if (message === undefined) {
      message = { id, role: 'assistant', text: '', streaming: true }
      state.messages.push(message)
    }
    message.text += chunk.text
    message.streaming = true
    return
  }

  if (event.type === 'assistant/message') {
    const messageValue = data.message
    if (!isRecord(messageValue)) return
    const turn = numberField(data.turn)
    const step = numberField(data.step)
    const id = `assistant-${turn}-${step}`
    const text = textBlocks(messageValue.content)
    const existing = state.messages.find(candidate => candidate.id === id)
    if (existing === undefined && text.length > 0) state.messages.push({ id, role: 'assistant', text })
    else if (existing !== undefined && text.length > 0) {
      existing.text = text
      delete existing.streaming
    }
    if (isRecord(data.usage)) {
      state.usage.inputTokens += numberField(data.usage.inputTokens)
      state.usage.outputTokens += numberField(data.usage.outputTokens)
      state.usage.cacheReadTokens += numberField(data.usage.cacheReadTokens)
      state.usage.reasoningTokens += numberField(data.usage.reasoningTokens)
    }
    return
  }

  if (event.type === 'tool/call') {
    const callId = stringField(data.callId)
    const toolName = stringField(data.name)
    if (callId === undefined || toolName === undefined) return
    const existing = state.tools.find(candidate => candidate.callId === callId)
    if (existing !== undefined) return
    state.tools.push({
      callId,
      name: toolName,
      arguments: parseArguments(data.arguments),
      status: 'running',
    })
    return
  }

  if (event.type === 'tool/result') {
    const message = data.message
    if (!isRecord(message)) return
    const result = toolResultBlock(message.content)
    const callId = stringField(result?.toolCallId)
    if (callId === undefined) return
    const card = state.tools.find(candidate => candidate.callId === callId)
    if (card === undefined) return
    const output = textBlocks(result?.content)
    const error = isRecord(data.error) ? stringField(data.error.code) ?? stringField(data.error.name) : undefined
    card.status = error === undefined ? 'completed' : 'failed'
    if (output.length > 0) card.output = output
    if (error !== undefined) card.error = error
    const diffs = parseDiffs(data.meta)
    if (diffs !== undefined) card.diffs = diffs
  }
}

/** Put the sidebar into an actionable error state without discarding the transcript. */
export function applyError(state: UiState, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  state.status = 'error'
  state.error = message
  state.messages.push({ id: `error-${Date.now()}`, role: 'system', text: message })
}
