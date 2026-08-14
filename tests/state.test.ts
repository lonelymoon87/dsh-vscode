import type { HarnessNotification } from '@deepseek-ai/dsh-sdk-client'
import { describe, expect, it } from 'vitest'
import { addUserPrompt, applyError, applyNotification, createUiState } from '../src/state.ts'

function notification(type: string, data: Record<string, unknown>, sessionId = 'session-1'): HarnessNotification {
  return {
    method: 'session.event',
    params: { sessionId, event: { type, seq: 1, time: 1, data } },
  }
}

describe('sidebar state projection', () => {
  it('streams one assistant row and replaces it with the assembled message', () => {
    const state = createUiState('session-1')
    addUserPrompt(state, 'user-1', 'hello')
    applyNotification(state, { method: 'session.status', params: { sessionId: 'session-1', status: 'running' } })
    applyNotification(state, notification('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'part ' },
    }))
    applyNotification(state, notification('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'two' },
    }))
    applyNotification(state, notification('assistant/message', {
      turn: 1,
      step: 1,
      message: { content: [{ type: 'text', text: 'final answer' }] },
      usage: { inputTokens: 4, outputTokens: 2, cacheReadTokens: 3, reasoningTokens: 1 },
    }))

    expect(state.status).toBe('running')
    expect(state.messages).toEqual([
      { id: 'user-1', role: 'user', text: 'hello' },
      { id: 'assistant-1-1', role: 'assistant', text: 'final answer' },
    ])
    expect(state.usage).toEqual({ inputTokens: 4, outputTokens: 2, cacheReadTokens: 3, reasoningTokens: 1 })
  })

  it('projects tool arguments, failures, output, and native diff input', () => {
    const state = createUiState('session-1')
    applyNotification(state, notification('tool/call', {
      turn: 1, step: 1, callId: 'call-1', name: 'write', arguments: '{"path":"a.ts"}',
    }))
    applyNotification(state, notification('tool/result', {
      turn: 1,
      step: 1,
      message: {
        content: [{
          type: 'tool-result',
          toolCallId: 'call-1',
          content: [{ type: 'text', text: 'wrote a.ts' }],
          isError: true,
        }],
      },
      error: { name: 'ToolError', code: 'write_failed' },
      meta: { diffs: [{ path: 'a.ts', oldText: 'old', newText: 'new' }] },
    }))

    expect(state.tools).toEqual([{
      callId: 'call-1',
      name: 'write',
      arguments: { path: 'a.ts' },
      status: 'failed',
      output: 'wrote a.ts',
      error: 'write_failed',
      diffs: [{ path: 'a.ts', oldText: 'old', newText: 'new' }],
    }])
  })

  it('does not render a blank assistant row for a tool-call-only message', () => {
    const state = createUiState('session-1')
    applyNotification(state, notification('assistant/message', {
      turn: 1,
      step: 1,
      message: { content: [{ type: 'tool-call', name: 'read' }] },
      usage: { inputTokens: 5, outputTokens: 1 },
    }))

    expect(state.messages).toEqual([])
    expect(state.usage).toMatchObject({ inputTokens: 5, outputTokens: 1 })
  })

  it('ignores child-session, malformed, reasoning, duplicate, and unknown events', () => {
    const state = createUiState('session-1')
    applyNotification(state, notification('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'child' },
    }, 'child'))
    applyNotification(state, notification('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'hidden' },
    }))
    applyNotification(state, notification('tool/call', {
      turn: 1, step: 1, callId: 'same', name: 'read', arguments: 'not-json',
    }))
    applyNotification(state, notification('tool/call', {
      turn: 1, step: 1, callId: 'same', name: 'read', arguments: '{}',
    }))
    applyNotification(state, notification('future/event', {}))
    applyNotification(state, { method: 'future.notification', params: {} })

    expect(state.messages).toEqual([])
    expect(state.tools).toEqual([{
      callId: 'same', name: 'read', arguments: 'not-json', status: 'running',
    }])
  })

  it('retains the transcript when a transport error occurs', () => {
    const state = createUiState('session-1')
    addUserPrompt(state, 'user-1', 'hello')
    applyError(state, new Error('runtime exited'))

    expect(state.status).toBe('error')
    expect(state.error).toBe('runtime exited')
    expect(state.messages.at(-1)).toMatchObject({ role: 'system', text: 'runtime exited' })
  })
})
