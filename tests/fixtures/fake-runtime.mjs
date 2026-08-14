#!/usr/bin/env node

import { createInterface } from 'node:readline'

let sequence = 0

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function notify(method, params) {
  write({ jsonrpc: '2.0', method, params })
}

function emitEvent(sessionId, type, data) {
  notify('session.event', {
    sessionId,
    event: { type, seq: sequence++, time: 1, data },
  })
}

const reader = createInterface({ input: process.stdin })
reader.on('line', (line) => {
  const frame = JSON.parse(line)
  if (frame.id === undefined || typeof frame.method !== 'string') return
  const respond = result => write({ jsonrpc: '2.0', id: frame.id, result })
  if (frame.method === 'initialize') {
    respond({ serverInfo: { name: 'dsh-vscode-test-runtime', version: '0.1.0' } })
    return
  }
  if (frame.method === 'session/prompt') {
    const sessionId = frame.params.sessionId
    const messageId = `user-${sequence}`
    emitEvent(sessionId, 'agent/inbox/spliced', {
      target: 'next-turn',
      start: 0,
      inserted: [{ id: messageId, role: 'user', content: [], source: { kind: 'user' } }],
    })
    notify('session.status', { sessionId, status: 'running' })
    emitEvent(sessionId, 'turn/start', { turn: 1 })
    emitEvent(sessionId, 'assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'runtime answer' },
    })
    emitEvent(sessionId, 'assistant/message', {
      turn: 1,
      step: 1,
      message: {
        id: 'assistant-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'runtime answer' }],
        source: { kind: 'model', provider: 'fake', model: 'fake' },
      },
      usage: { inputTokens: 7, outputTokens: 2 },
    })
    emitEvent(sessionId, 'turn/end', { turn: 1, reason: { kind: 'completed' } })
    notify('session.status', { sessionId, status: 'idle' })
    respond({ messageId })
    return
  }
  if (frame.method === 'shutdown') {
    respond({})
    setImmediate(() => process.exit(0))
    return
  }
  write({ jsonrpc: '2.0', id: frame.id, error: { code: -32601, message: 'unknown method' } })
})
