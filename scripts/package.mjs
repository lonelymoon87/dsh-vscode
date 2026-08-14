/** Package the native runtime only for the host platform that built it. */

import { spawnSync } from 'node:child_process'

const platform = process.platform === 'darwin' ? 'darwin'
  : process.platform === 'linux' ? 'linux'
    : process.platform === 'win32' ? 'win32'
      : undefined
const architecture = process.arch === 'arm64' ? 'arm64'
  : process.arch === 'x64' ? 'x64'
    : undefined
if (platform === undefined || architecture === undefined) {
  throw new Error(`Unsupported VSIX build target: ${process.platform}-${process.arch}`)
}
const result = spawnSync('vsce', ['package', '--target', `${platform}-${architecture}`], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)
