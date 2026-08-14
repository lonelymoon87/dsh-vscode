import { fileURLToPath } from 'node:url'
import { DeepSeekHarness, type DeepSeekHarnessOptions, type HarnessNotification, type RunResult } from '@deepseek-ai/dsh-sdk-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveRuntimeLaunch, RuntimeController, type HarnessLike, type RuntimeOptions } from '../src/runtime.ts'

const fakeRuntime = fileURLToPath(new URL('./fixtures/fake-runtime.mjs', import.meta.url))
const openHarnesses: DeepSeekHarness[] = []

afterEach(async () => {
  for (const harness of openHarnesses.splice(0)) await harness.close()
})

const options: RuntimeOptions = {
  workspaceRoot: '/tmp/dsh-vscode-workspace',
  sessionRoot: '/tmp/dsh-vscode-sessions',
  cordisConfig: '/tmp/dsh-vscode-cordis.yml',
  bundledBin: '/tmp/dsh-vscode-runtime/bin.js',
  nodePath: '/opt/node',
  runtimeCommand: '',
  args: ['--trace'],
  provider: 'provider-1',
  model: 'model-1',
  maxTokens: 1024,
}

describe('official SDK subprocess integration', () => {
  it('initializes, streams a turn, and shuts down over JSON-RPC stdio', async () => {
    const harness = new DeepSeekHarness({
      launch: { command: process.execPath, args: [fakeRuntime] },
      provider: 'fake',
      model: 'fake',
    })
    openHarnesses.push(harness)
    const seen: HarnessNotification[] = []
    const result = await harness.run('hello', {
      sessionId: 'sdk-process-test',
      onNotification: notification => seen.push(notification),
    })

    expect(result.finalResponse).toBe('runtime answer')
    expect(result.events.map(event => event.type)).toContain('assistant/message')
    expect(seen).toContainEqual({
      method: 'session.status',
      params: { sessionId: 'sdk-process-test', status: 'idle' },
    })
  })
})

describe('RuntimeController', () => {
  it('resolves the deployed runtime unless an executable is configured', () => {
    const bundled = resolveRuntimeLaunch(options.nodePath, '', ['--trace'], options.bundledBin)
    expect(bundled.command).toBe(options.nodePath)
    expect(bundled.args[0]).toBe(options.bundledBin)
    expect(bundled.args.at(-1)).toBe('--trace')
    expect(resolveRuntimeLaunch('/opt/node', '/opt/dsh', ['config.yml'], options.bundledBin)).toEqual({
      command: '/opt/dsh', args: ['config.yml'],
    })
  })

  it('passes workspace policy and route settings to the SDK', async () => {
    let received: DeepSeekHarnessOptions | undefined
    let receivedSession = ''
    const start = vi.fn(() => Promise.resolve())
    const close = vi.fn(() => Promise.resolve())
    const run = vi.fn(() => Promise.resolve({
      sessionId: receivedSession,
      finalResponse: 'done',
      events: [],
      notifications: [],
    } satisfies RunResult))
    const factory = (value: DeepSeekHarnessOptions): HarnessLike => {
      received = value
      return {
        start,
        close,
        session: (sessionId) => {
          receivedSession = sessionId
          return { run }
        },
      }
    }
    const controller = new RuntimeController(() => options, factory)

    const firstSession = controller.sessionId
    await controller.run('  inspect  ', () => undefined)

    expect(start).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith('inspect', { onNotification: expect.any(Function) })
    expect(received).toMatchObject({
      cwd: options.workspaceRoot,
      provider: options.provider,
      model: options.model,
      maxTokens: options.maxTokens,
      launch: {
        command: options.nodePath,
        args: [options.bundledBin, ...options.args],
        cwd: options.workspaceRoot,
        env: {
          DSH_CORDIS_CONFIG: options.cordisConfig,
          DSH_CWD: options.workspaceRoot,
          DSH_SESSION_ROOT: options.sessionRoot,
          DSH_PERMISSION_MODE: 'workspace-write',
        },
      },
    })
    expect(receivedSession).toBe(firstSession)
    expect(controller.newSession()).not.toBe(firstSession)
    await controller.close()
    expect(close).toHaveBeenCalledOnce()
  })

  it('serializes turns and closes a failed startup before retrying', async () => {
    let attempts = 0
    const closes: ReturnType<typeof vi.fn>[] = []
    const factory = (): HarnessLike => {
      attempts += 1
      const close = vi.fn(() => Promise.resolve())
      closes.push(close)
      return {
        start: attempts === 1 ? () => Promise.reject(new Error('boot failed')) : () => Promise.resolve(),
        close,
        session: sessionId => ({
          run: () => Promise.resolve({ sessionId, finalResponse: '', events: [], notifications: [] }),
        }),
      }
    }
    const controller = new RuntimeController(() => options, factory)

    await expect(controller.run('first', () => undefined)).rejects.toThrow('boot failed')
    await expect(controller.run('second', () => undefined)).resolves.toMatchObject({ sessionId: controller.sessionId })
    expect(attempts).toBe(2)
    expect(closes[0]).toHaveBeenCalledOnce()
    await controller.close()
  })
})
