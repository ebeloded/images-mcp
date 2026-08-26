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

Store API keys securely (use whichever providers you need):

```bash
img keys set openai
img keys set gemini
img keys set grok
```

## API Key Management

Store keys in macOS Keychain (or Secret Service on Linux):

```bash
img keys set openai
img keys set gemini
img keys set grok
```

When the key argument is omitted, `img` prompts securely in a terminal. Pipe it for scripts to keep it out of shell history and process listings:

```bash
echo "sk-proj-..." | img keys set openai
```

View and manage keys:

```bash
img keys               # show all key statuses (masked)
img keys get openai    # print raw key value
img keys delete openai # remove a key
img keys migrate       # move legacy plaintext keys into the system keyring
```

Environment variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `XAI_API_KEY`) override stored credentials and are shown by `img keys list` without revealing their values.

On a system without a supported keyring, `keys set` falls back to the private `${XDG_CONFIG_HOME:-~/.config}/image-gen/config.json` file (`0600`). You can request that fallback explicitly with `img keys set <provider> --plaintext`. Existing plaintext credentials continue to work; `img keys migrate` copies all of them into the keyring, verifies each readback, and only then removes them from the file. A failed migration rolls back already-written keyring entries and leaves the config unchanged.

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
img openai [options] [prompt]
img gemini [options] [prompt]
img grok   [options] [prompt]
img keys   [command]
```

`image-gen` is an equivalent longer binary alias, so `image-gen openai ...` works the same as `img openai ...`.

Help follows the command hierarchy, so it stays short and relevant:

```bash
img --help          # command overview
img openai --help   # OpenAI options and examples
img keys --help     # storage and migration commands
img help gemini     # equivalent help-command form
```

Command and option typos suggest close matches. Parse errors print help for the command that failed.

## CLI Flags (Full Reference)

Common flags (all generation commands):

| Flag                           | Required | Default | Notes                                                                                                       |
| ------------------------------ | -------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `--prompt <text>`, `-p <text>` | yes*     | -       | Prompt or edit instructions (`*` can be read from stdin or positional args when `--prompt`/`-p` is omitted) |
| `--output <path>`, `-o <path>` | yes      | -       | Output file path                                                                                            |
| `--input <path>`, `-i <path>`  | no       | -       | Repeatable input image path (`--input=a.png,b.png` also supported)                                          |
| `--force`, `-f`                | no       | -       | Overwrite output file if it already exists                                                                  |
| `--help`, `-h`                 | no       | -       | Print usage                                                                                                 |
| `--version`, `-v`              | no       | -       | Print the installed package version                                                                         |

Permissive CLI input forms:

- `--flag value`
- `--flag=value`
- short aliases (`-p`, `-o`, `-i`, `-f`)
- positional prompt fallback when `--prompt`/`-p` is omitted

OpenAI flags (`img openai`):

| Flag                   | Required | Default       | Allowed values                                                                                        |
| ---------------------- | -------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| `--model <value>`      | no       | `gpt-image-2` | `gpt-image-2`, `gpt-image-2-2026-04-21`, `gpt-image-1.5`                                              |
| `--size <value>`       | no       | `auto`        | `auto`, `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`, `3840x2160`, `2160x3840`     |
| `--quality <value>`    | no       | `auto`        | `auto`, `high`, `medium`, `low`                                                                       |
| `--background <value>` | no       | `auto`        | `auto`, `transparent`, `opaque` (`transparent` requires GPT Image 1.5 and a `.png` or `.webp` output) |

OpenAI output file extensions: `.png`, `.jpg`, `.jpeg`, `.webp`

Gemini flags (`img gemini`):

| Flag                     | Required | Default                  | Allowed values                                                                                          |
| ------------------------ | -------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `--model <value>`        | no       | `gemini-3.1-flash-image` | `gemini-2.5-flash-image`, `gemini-3-pro-image`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image` |
| `--aspect-ratio <value>` | no       | unset                    | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`                                 |
| `--image-size <value>`   | no       | unset                    | `512`, `1K`, `2K`, `4K` (`512` is Flash Image only; Flash Lite supports only `1K`)                      |

Gemini output file extensions: `.png`

Grok flags (`img grok`):

| Flag                     | Required | Default                         | Allowed values                                                                                                             |
| ------------------------ | -------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--model <value>`        | no       | `grok-imagine-image-2.0`        | `grok-imagine-image-2.0`, `grok-imagine-image-quality`, `grok-imagine-image`, `grok-2-image`                               |
| `--aspect-ratio <value>` | no       | unset                           | `auto`, `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `19.5:9`, `9:19.5`, `20:9`, `9:20`, `21:9`, `5:2` |
| `--resolution <value>`   | no       | unset                           | `1k`, `2k`                                                                                                                 |
| `--quality <value>`      | no       | unset (`medium` server default) | `low`, `medium` (`grok-imagine-image-2.0` only)                                                                            |

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
- Parse/validation errors are written to `stderr` with command-specific usage.
- Runtime errors are written to `stderr` as `Error: <message>`.

Common parse failures include a missing `--output`, a missing prompt, unknown options (with close-match suggestions), and values outside the choices shown by `img <provider> --help`.

## Troubleshooting

### Missing API Key

Each provider command requires its key in the system keyring, legacy config, or an environment variable:

```text
Error: No OpenAI API key found. Run 'img keys set openai' or set OPENAI_API_KEY
Error: No Gemini API key found. Run 'img keys set gemini' or set GEMINI_API_KEY / GOOGLE_API_KEY
Error: No xAI API key found. Run 'img keys set grok' or set XAI_API_KEY
```

Fix — store the key securely or provide an environment variable:

```bash
img keys set openai
img keys set gemini
img keys set grok
```

### Invalid or Unsupported Flags

If you pass a flag not supported by the selected command, the CLI exits with code `1` and prints a command-specific unknown-flag message with a suggestion when a close match exists.

If you pass an unsupported value, the CLI prints the allowed values for that flag.
