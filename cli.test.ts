import { describe, expect, it } from "bun:test";
import { parseArgs } from "./cli.ts";
import path from "node:path";

describe("parseArgs validation", () => {
  it("returns help for top-level and command help flags", () => {
    expect(parseArgs(["--help"]).mode).toBe("help");
    expect(parseArgs(["openai", "--help"]).mode).toBe("help");
    expect(parseArgs(["gemini", "-h"]).mode).toBe("help");
  });

  it("rejects unknown commands", () => {
    const parsed = parseArgs(["stability", "--prompt", "test", "--output", "out.png"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toBe("Unknown command: stability");
    }
  });

  it("rejects missing values", () => {
    const missingValue = parseArgs(["openai", "--prompt", "--output", "out.png"]);
    expect(missingValue.mode).toBe("help");
    if (missingValue.mode === "help") {
      expect(missingValue.message).toBe("Missing value for --prompt");
    }
  });

  it("requires both prompt and output", () => {
    const parsed = parseArgs(["openai", "--prompt", "test"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toBe("Missing required --prompt or --output");
    }
  });

  it("rejects unknown flags for openai with suggestions", () => {
    const parsed = parseArgs(["openai", "--prompt", "test", "--output", "out.png", "--qulity", "high"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toContain("Unknown flag(s) for openai: --qulity");
      expect(parsed.message).toContain("did you mean --quality?");
    }
  });

  it("rejects invalid openai enum values with clear error", () => {
    const parsed = parseArgs(["openai", "--prompt", "test", "--output", "out.png", "--size", "500x500"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toContain('Invalid value for --size: "500x500"');
      expect(parsed.message).toContain("Allowed values: auto, 1024x1024, 1536x1024, 1024x1536");
    }
  });

  it("rejects invalid gemini aspect-ratio with clear error", () => {
    const parsed = parseArgs(["gemini", "--prompt", "test", "--output", "out.png", "--aspect-ratio", "7:5"]);
    expect(parsed.mode).toBe("help");
    if (parsed.mode === "help") {
      expect(parsed.message).toContain('Invalid value for --aspect-ratio: "7:5"');
    }
  });

  it("accepts --flag=value style", () => {
    const parsed = parseArgs(["openai", "--prompt=test", "--output=out.webp", "--quality=high"]);
    expect(parsed.mode).toBe("openai");
    if (parsed.mode === "openai") {
      expect(parsed.params.prompt).toBe("test");
      expect(parsed.params.output_path).toBe("out.webp");
      expect(parsed.params.quality).toBe("high");
    }
  });

  it("accepts short aliases", () => {
    const parsed = parseArgs(["gemini", "-p", "test", "-o", "out.png", "-i", "a.png"]);
    expect(parsed.mode).toBe("gemini");
    if (parsed.mode === "gemini") {
      expect(parsed.params.prompt).toBe("test");
      expect(parsed.params.output_path).toBe("out.png");
      expect(parsed.params.input_images).toEqual(["a.png"]);
    }
  });

  it("accepts positional prompt fallback", () => {
    const parsed = parseArgs(["openai", "--output", "out.webp", "A", "cat", "in", "Tokyo"]);
    expect(parsed.mode).toBe("openai");
    if (parsed.mode === "openai") {
      expect(parsed.params.prompt).toBe("A cat in Tokyo");
    }
  });

  it("supports comma-separated and repeated input flags", () => {
    const parsed = parseArgs([
      "openai",
      "--prompt",
      "test",
      "--output",
      "out.webp",
      "--input",
      "a.png,b.png",
      "--input",
      "c.png",
    ]);
    expect(parsed.mode).toBe("openai");
    if (parsed.mode === "openai") {
      expect(parsed.params.input_images).toEqual(["a.png", "b.png", "c.png"]);
    }
  });

  it("accepts valid OpenAI args and applies defaults", () => {
    const parsed = parseArgs(["openai", "--prompt", "test", "--output", "out.webp"]);
    expect(parsed.mode).toBe("openai");
    if (parsed.mode === "openai") {
      expect(parsed.params.model).toBe("gpt-image-2");
      expect(parsed.params.size).toBe("auto");
      expect(parsed.params.quality).toBe("auto");
      expect(parsed.params.background).toBe("auto");
    }
  });

  it("accepts the pinned GPT Image 2 snapshot", () => {
    const parsed = parseArgs(["openai", "--prompt", "test", "--output", "out.png", "--model", "gpt-image-2-2026-04-21"]);
    expect(parsed.mode).toBe("openai");
  });

  it("rejects unsupported transparent OpenAI output combinations before the API call", () => {
    const gpt2 = parseArgs(["openai", "--prompt", "test", "--output", "out.png", "--background", "transparent"]);
    expect(gpt2.mode).toBe("help");
    if (gpt2.mode === "help") expect(gpt2.message).toContain("transparent backgrounds are not supported");

    const jpeg = parseArgs(["openai", "--prompt", "test", "--output", "out.jpg", "--model", "gpt-image-1.5", "--background", "transparent"]);
    expect(jpeg.mode).toBe("help");
    if (jpeg.mode === "help") expect(jpeg.message).toContain("output must use .png or .webp");
  });

  it("accepts valid Gemini args and keeps optional values", () => {
    const parsed = parseArgs([
      "gemini",
      "--prompt",
      "test",
      "--output",
      "out.png",
      "--aspect-ratio",
      "16:9",
      "--image-size",
      "2K",
    ]);
    expect(parsed.mode).toBe("gemini");
    if (parsed.mode === "gemini") {
      expect(parsed.params.model).toBe("gemini-3.1-flash-image");
      expect(parsed.params.aspect_ratio).toBe("16:9");
      expect(parsed.params.image_size).toBe("2K");
    }
  });

  it("enforces Gemini model-specific image sizes", () => {
    const lite = parseArgs(["gemini", "--prompt", "test", "--output", "out.png", "--model", "gemini-3.1-flash-lite-image", "--image-size", "2K"]);
    expect(lite.mode).toBe("help");
    if (lite.mode === "help") expect(lite.message).toContain("only 1K is supported");

    const compact = parseArgs(["gemini", "--prompt", "test", "--output", "out.png", "--model", "gemini-3-pro-image", "--image-size", "512"]);
    expect(compact.mode).toBe("help");
    if (compact.mode === "help") expect(compact.message).toContain("only supported by gemini-3.1-flash-image");
  });

  it("defaults Grok to Imagine 2.0 and validates model-specific quality", () => {
    const parsed = parseArgs(["grok", "--prompt", "test", "--output", "out.jpg", "--quality", "low", "--aspect-ratio", "5:2"]);
    expect(parsed.mode).toBe("grok");
    if (parsed.mode === "grok") {
      expect(parsed.params.model).toBe("grok-imagine-image-2.0");
      expect(parsed.params.quality).toBe("low");
      expect(parsed.params.aspect_ratio).toBe("5:2");
    }

    const oldModel = parseArgs(["grok", "--prompt", "test", "--output", "out.jpg", "--model", "grok-imagine-image-quality", "--quality", "low"]);
    expect(oldModel.mode).toBe("help");
    if (oldModel.mode === "help") expect(oldModel.message).toContain("only supported by grok-imagine-image-2.0");
  });
});

describe("cli executable behavior", () => {
  const cwd = path.resolve(import.meta.dir);

  const runCli = (args: string[], stdinText?: string) => {
    const result = Bun.spawnSync(["bun", "run", "cli.ts", ...args], {
      cwd,
      stdin: stdinText === undefined ? "ignore" : new TextEncoder().encode(stdinText),
      stdout: "pipe",
      stderr: "pipe",
    });

    return {
      exitCode: result.exitCode,
      stdout: Buffer.from(result.stdout).toString(),
      stderr: Buffer.from(result.stderr).toString(),
    };
  };

  it("prints usage and exits 0 for help", () => {
    const result = runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("image-gen (CLI)");
    expect(result.stdout).toContain("image-gen openai  [args]");
    expect(result.stdout).toContain("--prompt, -p");
    expect(result.stderr).toBe("");
  });

  it("prints validation errors with usage and exits 1", () => {
    const result = runCli(["gemini", "--prompt", "test", "--output", "out.png", "--wat", "nope"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown flag(s) for gemini: --wat");
    expect(result.stderr).toContain("image-gen (CLI)");
  });

  it("enforces provider-specific output extensions", () => {
    const openai = runCli(["openai", "--prompt", "test", "--output", "out.gif"]);
    expect(openai.exitCode).toBe(1);
    expect(openai.stderr).toContain("Error: Unsupported output extension for openai: .gif");
    expect(openai.stderr).toContain("Allowed extensions: .png, .jpg, .jpeg, .webp");

    const gemini = runCli(["gemini", "--prompt", "test", "--output", "out.jpg"]);
    expect(gemini.exitCode).toBe(1);
    expect(gemini.stderr).toContain("Error: Unsupported output extension for gemini: .jpg");
    expect(gemini.stderr).toContain("Allowed extensions: .png");
  });

  it("reads prompt from stdin when prompt is missing", () => {
    const result = runCli(["openai", "--output", "out.gif"], "  prompt from stdin  \n");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Error: Unsupported output extension for openai: .gif");
    expect(result.stderr).not.toContain("Missing required --prompt or --output");
  });

  it("treats empty trimmed stdin prompt as missing", () => {
    const result = runCli(["openai", "--output", "out.gif"], "   \n\t  ");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing required --prompt or --output");
  });

  it("prioritizes --prompt over stdin", () => {
    const result = runCli(["openai", "--prompt", "from-flag", "--output", "out.gif"], "from-stdin");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Error: Unsupported output extension for openai: .gif");
    expect(result.stderr).not.toContain("Missing required --prompt or --output");
  });

  it("accepts positional prompt from executable path", () => {
    const result = runCli(["openai", "--output", "out.gif", "prompt", "from", "positionals"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Error: Unsupported output extension for openai: .gif");
    expect(result.stderr).not.toContain("Missing required --prompt or --output");
  });
});
