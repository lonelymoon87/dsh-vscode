import { build, context } from 'esbuild'
import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'dist/extension.cjs',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
}

rmSync('dist/runtime', { recursive: true, force: true })
const deployed = spawnSync(
  'pnpm',
  ['--config.node-linker=hoisted', '--filter', 'dsh-vscode-runtime', 'deploy', '--prod', 'dist/runtime'],
  { stdio: 'inherit' },
)
if (deployed.status !== 0) process.exit(deployed.status ?? 1)
rmSync('dist/runtime/pnpm-lock.yaml', { force: true })
rmSync('dist/runtime/pnpm-workspace.yaml', { force: true })

if (process.argv.includes('--watch')) {
  const buildContext = await context(options)
  await buildContext.watch()
} else {
  await build(options)
}
