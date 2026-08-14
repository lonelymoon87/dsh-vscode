/** Lifecycle wrapper for the official DeepSeek Harness TypeScript SDK. */

import { randomUUID } from 'node:crypto'
import type { DeepSeekHarnessOptions, HarnessNotification, RunResult } from '@deepseek-ai/dsh-sdk-client'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'

/** Runtime settings resolved from the current VS Code workspace and configuration. */
export interface RuntimeOptions {
  readonly workspaceRoot: string
  readonly sessionRoot: string
  readonly cordisConfig: string
  readonly bundledBin: string
  readonly nodePath: string
  readonly runtimeCommand: string
  readonly args: readonly string[]
  readonly provider: string
  readonly model: string
  readonly maxTokens: number
}

/** Minimal session face used by the controller and its process-level tests. */
export interface HarnessSessionLike {
  run(input: string, options: { onNotification: (notification: HarnessNotification) => void }): Promise<RunResult>
}

/** Minimal harness face used by the controller and its process-level tests. */
export interface HarnessLike {
  start(): Promise<void>
  session(sessionId: string): HarnessSessionLike
  close(): Promise<void>
}

/** Factory seam for constructing the official SDK client. */
export type HarnessFactory = (options: DeepSeekHarnessOptions) => HarnessLike

/** Resolve an optional executable override or the extension's deployed Node runtime. */
export function resolveRuntimeLaunch(
  nodePath: string,
  runtimeCommand: string,
  args: readonly string[],
  bundledBin: string,
): {
  command: string
  args: string[]
} {
  const override = runtimeCommand.trim()
  if (override.length > 0) return { command: override, args: [...args] }
  return {
    command: nodePath.trim() || 'node',
    args: [bundledBin, ...args],
  }
}

function createHarness(options: DeepSeekHarnessOptions): HarnessLike {
  return new DeepSeekHarness(options)
}

/** Own one reusable runtime subprocess and one active session id. */
export class RuntimeController implements AsyncDisposable {
  private harness: HarnessLike | undefined
  private running = false
  private disposed = false
  private activeSessionId = randomUUID()

  /**
   * @param resolveOptions - Reads settings immediately before each process launch.
   * @param factory - SDK construction seam used by tests.
   */
  constructor(
    private readonly resolveOptions: () => RuntimeOptions,
    private readonly factory: HarnessFactory = createHarness,
  ) {}

  /** Current session id used for subsequent prompts. */
  get sessionId(): string {
    return this.activeSessionId
  }

  /** Whether a prompt currently owns the session activity interval. */
  get isRunning(): boolean {
    return this.running
  }

  /** Mint a clean session without restarting the shared runtime. */
  newSession(): string {
    this.assertOpen()
    if (this.running) throw new Error('Wait for the current turn to finish before starting a new session.')
    this.activeSessionId = randomUUID()
    return this.activeSessionId
  }

  /** Start the runtime if needed and run one prompt on the active session. */
  async run(input: string, onNotification: (notification: HarnessNotification) => void): Promise<RunResult> {
    this.assertOpen()
    if (this.running) throw new Error('A DeepSeek Harness turn is already running.')
    const text = input.trim()
    if (text.length === 0) throw new Error('Enter a prompt before sending.')
    this.running = true
    try {
      const harness = await this.ensureHarness()
      return await harness.session(this.activeSessionId).run(text, { onNotification })
    } finally {
      this.running = false
    }
  }

  /** Replace the runtime process and apply the latest VS Code settings. */
  async restart(): Promise<void> {
    this.assertOpen()
    if (this.running) throw new Error('Wait for the current turn to finish before restarting the runtime.')
    await this.closeHarness()
    await this.ensureHarness()
  }

  /** Shut down and reap the owned runtime process. */
  async close(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    await this.closeHarness()
  }

  /** Async-disposable alias for {@link close}. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }

  private async ensureHarness(): Promise<HarnessLike> {
    if (this.harness !== undefined) return this.harness
    const options = this.resolveOptions()
    const launch = resolveRuntimeLaunch(options.nodePath, options.runtimeCommand, options.args, options.bundledBin)
    const harness = this.factory({
      launch: {
        command: launch.command,
        args: launch.args,
        cwd: options.workspaceRoot,
        env: {
          ...process.env,
          DSH_CORDIS_CONFIG: options.cordisConfig,
          DSH_CWD: options.workspaceRoot,
          DSH_SESSION_ROOT: options.sessionRoot,
          DSH_PERMISSION_MODE: 'workspace-write',
        },
      },
      cwd: options.workspaceRoot,
      provider: options.provider,
      model: options.model,
      maxTokens: options.maxTokens,
    })
    try {
      await harness.start()
      this.harness = harness
      return harness
    } catch (error) {
      await harness.close().catch(() => undefined)
      throw error
    }
  }

  private async closeHarness(): Promise<void> {
    const harness = this.harness
    this.harness = undefined
    if (harness !== undefined) await harness.close()
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error('The DeepSeek Harness runtime has been disposed.')
  }
}
