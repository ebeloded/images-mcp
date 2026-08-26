---
name: image-gen
description: Use the `img` / `image-gen` CLI to generate or edit images with OpenAI, Google Gemini, or xAI Grok. Use when the user asks to create images from prompts, edit images from references, configure provider API keys, choose provider-specific image parameters, or troubleshoot this image generation CLI.
---

# Image Gen

## Quick Start

Use the installed CLI when available:

```bash
img --help
img --version
```

Help is command-specific: use `img <provider> --help` or `img keys --help` for focused options and examples.

Install the package globally when the CLI is missing:

```bash
bun add -g @ebeloded/image-gen
```

The package requires Bun on the machine because the CLI entrypoint uses `#!/usr/bin/env bun`.

If `img` is unavailable but this repository is present, run directly from the repo:

```bash
bun run cli.ts --help
```

Use `image-gen` only as the longer compatibility alias.

## Workflow

1. Determine the provider from the request. Default to `openai` when the user does not specify one.
2. Choose an output path and extension supported by that provider.
3. Ensure the provider key is configured before attempting generation.
4. Run `img <provider>` with `--prompt`, `--output`, optional inputs, and provider-specific flags.
5. Read the JSON success response from stdout and report the resulting file path.

## Providers

OpenAI:

```bash
img openai --prompt "A cinematic product photo of a ceramic teapot" --output ./teapot.png
```

- Outputs: `.png`, `.jpg`, `.jpeg`, `.webp`
- Defaults: `--model gpt-image-2`, `--size auto`, `--quality auto`, `--background auto`
- Useful flags: `--size`, `--quality`, `--background`
- Use for general image generation and edits, especially when the user needs webp/jpeg/png flexibility.

Gemini:

```bash
img gemini --prompt "A ceramic teapot on a white background" --output ./teapot.png --aspect-ratio 4:3 --image-size 2K
```

- Outputs: `.png`
- Defaults: `--model gemini-3.1-flash-image`
- Useful flags: `--aspect-ratio`, `--image-size`
- Use when the user asks for Gemini or wants Gemini-specific aspect ratio and image size controls.

Grok:

```bash
img grok --prompt "A dramatic editorial portrait with neon rim light" --output ./portrait.jpg
```

- Outputs: `.jpg`, `.jpeg`
- Defaults: `--model grok-imagine-image-2.0`
- Useful flags: `--aspect-ratio`, `--resolution`, `--quality`
- Use when the user asks for Grok/xAI generation.

## Editing Images

Pass one or more input images with repeatable `--input` flags:

```bash
img openai \
  --prompt "Add snow and keep the subject centered" \
  --output ./edited.png \
  --input ./source.png
```

Multiple inputs are allowed as repeated flags or comma-separated values:

```bash
img gemini --prompt "Combine these references" --output ./combined.png --input ./a.png --input ./b.png
img gemini --prompt "Combine these references" --output ./combined.png --input ./a.png,./b.png
```

## API Keys

Check key status:

```bash
img keys
```

Set persistent keys in macOS Keychain (or the Linux system keyring):

```bash
img keys set openai
img keys set gemini
img keys set grok
```

Migrate keys from the legacy plaintext config after upgrading:

```bash
img keys migrate
```

Pipe secrets in non-interactive use to avoid shell history:

```bash
echo "sk-proj-..." | img keys set openai
```

Environment variables also work:

- OpenAI: `OPENAI_API_KEY`
- Gemini: `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- Grok: `XAI_API_KEY`

The system keyring is the default persistent store. On unsupported systems, the CLI falls back to `${XDG_CONFIG_HOME:-~/.config}/image-gen/config.json` with private permissions. A local legacy `.image-gen.json` in the current working directory still takes precedence over stored credentials.

## Prompt Input

Use `--prompt`, stdin, or positional prompt fallback:

```bash
img openai --prompt "A neon cat in rainy Tokyo" --output ./cat.png
cat prompt.txt | img openai --output ./cat.png
img openai --output ./cat.png A neon cat in rainy Tokyo
```

## Output Handling

Successful runs print formatted JSON to stdout:

```json
{
  "success": true,
  "path": "/absolute/path/to/output.png",
  "bytes": 123456
}
```

Use the `path` field as the authoritative generated file path. If the user wants to view the output inside Codex, reference that absolute path in a Markdown image tag.

## Troubleshooting

- If the CLI reports a missing key, configure the matching provider key or ask the user for the intended provider.
- If the CLI reports an unsupported extension, change the output extension to one supported by that provider.
- If the output file exists, add `--force` only when the user wants to overwrite it.
- If a flag is rejected, run `img <provider> --help` or `img --help` and use only flags listed for that provider.
- If `img` is not installed, use `bun run cli.ts ...` from this repository or install/link the package before retrying.
