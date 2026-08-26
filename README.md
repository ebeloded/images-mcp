# image-gen

Command-line tool for generating and editing images with OpenAI (GPT Image), Google Gemini, and xAI Grok.

## Requirements

- Bun `>=1.0.0`

## Quick Start

```bash
bun install
```

Install the published CLI globally:

```bash
bun add -g @ebeloded/image-gen
```

Set API keys (use whichever providers you need):

```bash
export OPENAI_API_KEY="..."
export GEMINI_API_KEY="..."   # or GOOGLE_API_KEY
export XAI_API_KEY="..."
```

## API Key Management

Store keys persistently in `~/.config/image-gen/config.json`:

```bash
img keys set openai sk-proj-...
img keys set gemini AIza...
img keys set grok xai-...
```

Or pipe the key to avoid it appearing in shell history:

```bash
echo "sk-proj-..." | img keys set openai
```

View and manage keys:

```bash
img keys               # show all key statuses (masked)
img keys get openai    # print raw key value
img keys delete openai # remove a key
```

Environment variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `XAI_API_KEY`) still work alongside the config file. Both are shown in `img keys list`.

A local `.image-gen.json` in the working directory takes precedence over the user config (for project-level overrides).

## Running

Run directly from this repo:

```bash
bun run cli.ts --help
```

After a package install or link, the `img` and `image-gen` binaries are on your `PATH`:

```bash
img --help
img --version # or: img -v
```

The longer `image-gen` binary is also available as a compatibility alias.

## Commands

```bash
img openai [flags]
img gemini [flags]
img grok   [flags]
img keys   [subcommand]
img --help
```

`image-gen` is an equivalent longer binary alias, so `image-gen openai ...` works the same as `img openai ...`.

## CLI Flags (Full Reference)

Common flags (all generation commands):

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--prompt <text>`, `-p <text>` | yes* | - | Prompt or edit instructions (`*` can be read from stdin or positional args when `--prompt`/`-p` is omitted) |
| `--output <path>`, `-o <path>` | yes | - | Output file path |
| `--input <path>`, `-i <path>` | no | - | Repeatable input image path (`--input=a.png,b.png` also supported) |
| `--force`, `-f` | no | - | Overwrite output file if it already exists |
| `--help`, `-h` | no | - | Print usage |
| `--version`, `-v` | no | - | Print the installed package version |

Permissive CLI input forms:

- `--flag value`
- `--flag=value`
- short aliases (`-p`, `-o`, `-i`, `-f`)
- positional prompt fallback when `--prompt`/`-p` is omitted

OpenAI flags (`img openai`):

| Flag | Required | Default | Allowed values |
|---|---|---|---|
| `--model <value>` | no | `gpt-image-2` | `gpt-image-2`, `gpt-image-2-2026-04-21`, `gpt-image-1.5` |
| `--size <value>` | no | `auto` | `auto`, `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`, `3840x2160`, `2160x3840` |
| `--quality <value>` | no | `auto` | `auto`, `high`, `medium`, `low` |
| `--background <value>` | no | `auto` | `auto`, `transparent`, `opaque` (`transparent` requires GPT Image 1.5 and a `.png` or `.webp` output) |

OpenAI output file extensions: `.png`, `.jpg`, `.jpeg`, `.webp`

Gemini flags (`img gemini`):

| Flag | Required | Default | Allowed values |
|---|---|---|---|
| `--model <value>` | no | `gemini-3.1-flash-image` | `gemini-2.5-flash-image`, `gemini-3-pro-image`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image` |
| `--aspect-ratio <value>` | no | unset | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `--image-size <value>` | no | unset | `512`, `1K`, `2K`, `4K` (`512` is Flash Image only; Flash Lite supports only `1K`) |

Gemini output file extensions: `.png`

Grok flags (`img grok`):

| Flag | Required | Default | Allowed values |
|---|---|---|---|
| `--model <value>` | no | `grok-imagine-image-2.0` | `grok-imagine-image-2.0`, `grok-imagine-image-quality`, `grok-imagine-image`, `grok-2-image` |
| `--aspect-ratio <value>` | no | unset | `auto`, `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `19.5:9`, `9:19.5`, `20:9`, `9:20`, `21:9`, `5:2` |
| `--resolution <value>` | no | unset | `1k`, `2k` |
| `--quality <value>` | no | unset (`medium` server default) | `low`, `medium` (`grok-imagine-image-2.0` only) |

Grok output file extensions: `.jpg`, `.jpeg`

## CLI Examples

Generate with OpenAI:

```bash
img openai \
  --prompt "A neon cat in rainy Tokyo, cinematic lighting" \
  --output ./cat.png
```

Generate with OpenAI by piping prompt from stdin:

```bash
cat prompt.txt | img openai --output ./cat.png
```

Or with stdin redirection:

```bash
img openai --output ./cat.png < prompt.txt
```

Edit with OpenAI:

```bash
img openai \
  --prompt "Add snow and keep the cat centered" \
  --output ./cat-snow.png \
  --input ./cat.png
```

Generate with Gemini:

```bash
img gemini \
  --prompt "A ceramic teapot product photo on white background" \
  --output ./teapot.png \
  --aspect-ratio 4:3 \
  --image-size 2K
```

Edit with Gemini and multiple references:

```bash
img gemini \
  --prompt "Combine both references into one consistent illustration" \
  --output ./combined.png \
  --input ./ref-1.png \
  --input ./ref-2.png
```

## JSON Output Behavior

Successful runs print formatted JSON to stdout. Shape:

```json
{
  "success": true,
  "path": "/absolute/path/to/output.png",
  "bytes": 123456,
  "...provider_fields": "..."
}
```

Provider-specific success fields:

- OpenAI: `model`, `size`, `quality`, `input_images_count`
- Gemini: `model`, `aspect_ratio`, `image_size`, `input_images_count`
- Grok: `model`, `aspect_ratio`, `resolution`, `quality`, `input_images_count`

## Errors and Exit Codes

- Exit `0`: Help (`--help`), version output (`--version`), or successful generation.
- Exit `1`: Argument parsing/validation errors, runtime errors, API/auth errors, file errors.
- Parse/validation errors are written to `stderr` as `<message>` followed by usage.
- Runtime errors are written to `stderr` as `Error: <message>`.

Common parse failures:

- Missing required flags (when neither `--prompt` nor non-empty piped stdin prompt is provided):
  - `Missing required --prompt or --output`
- Missing value for a flag:
  - `Missing value for --output`
- Unknown flags:
  - `Unknown flag(s) for openai: --foo`
- Unexpected positional argument:
  - `Unexpected argument: value`
- Invalid enum value:
  - `Invalid value for --size: "500x500". Allowed values: auto, 1024x1024, ...`

## Troubleshooting

### Missing API Key

Each provider command requires its key to be set either in the config file or as an environment variable:

```text
Error: Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable
Error: Missing XAI_API_KEY environment variable
```

Fix — set keys via config (preferred) or environment variables:

```bash
img keys set openai sk-proj-...
img keys set gemini AIza...
img keys set grok xai-...
```

### Invalid or Unsupported Flags

If you pass a flag not supported by the selected command, the CLI exits with code `1` and prints a command-specific unknown-flag message with a suggestion when a close match exists.

If you pass an unsupported value, the CLI prints the allowed values for that flag.
