# Contributing

This project follows the independent-client contribution route for DeepSeek Harness. It is not part of the `deepseek-ai/deepseek-harness` monorepo.

1. Open an issue before changing the SDK protocol assumptions, runtime composition, permission mode, or persisted session behavior.
2. Create a focused branch from `main`.
3. Update implementation, tests, visible strings, runtime configuration, and both README languages together when their behavior changes.
4. Run `pnpm run check` and inspect the generated VSIX.
5. For product-visible GUI behavior, record a GIF from the branch's real extension, runtime, and model flow. Do not use fixtures or mocked responses as release evidence.
6. Open a pull request that explains the user-visible behavior, limitations, and commands actually run.

Do not include API keys, tokens, generated VSIX files, local session data, or unredacted runtime logs in a contribution.
