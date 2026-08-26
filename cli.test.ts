import { describe, expect, it } from "bun:test";
import path from "node:path";
import packageMetadata from "./package.json" with { type: "json" };

describe("CLI ergonomics", () => {
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

  it("shows a concise command overview for bare invocation and --help", () => {
    for (const args of [[], ["--help"]]) {
      const result = runCli(args);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage: img [options] [command]");
      expect(result.stdout).toContain("openai");
      expect(result.stdout).toContain("keys");
      expect(result.stdout).not.toContain("--background");
      expect(result.stderr).toBe("");
    }
  });

  it("shows focused provider help with examples", () => {
    const result = runCli(["openai", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: img openai [options] [prompt...]");
    expect(result.stdout).toContain("--background <type>");
    expect(result.stdout).toContain("Examples:");
    expect(result.stdout).not.toContain("--aspect-ratio");
    expect(result.stderr).toBe("");
  });

  it("supports the conventional help-command form", () => {
    const result = runCli(["help", "gemini"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: img gemini");
    expect(result.stdout).toContain("--image-size <size>");
  });

  it("shows key storage, migration, and safety guidance", () => {
    const result = runCli(["keys", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("migrate");
    expect(result.stdout).toContain("system keyring by default");
    expect(result.stdout).toContain("--plaintext");
    expect(result.stderr).toBe("");
  });

  it("prints the package version", () => {
    for (const flag of ["--version", "-v", "version"]) {
      const result = runCli([flag]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(`${packageMetadata.version}\n`);
      expect(result.stderr).toBe("");
    }
  });

  it("suggests close command and option names", () => {
    const command = runCli(["opeani"]);
    expect(command.exitCode).toBe(1);
    expect(command.stderr).toContain("Did you mean 'openai'?");

    const option = runCli(["openai", "--qulity", "high", "-o", "out.png", "test"]);
    expect(option.exitCode).toBe(1);
    expect(option.stderr).toContain("--quality");
  });

  it("validates option choices before making an API call", () => {
    const result = runCli(["openai", "--size", "500x500", "-o", "out.png", "test"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Allowed choices");
    expect(result.stderr).toContain("1024x1024");
  });

  it("prints command-specific help for missing required options", () => {
    const result = runCli(["gemini", "test"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("required option '-o, --output <path>' not specified");
    expect(result.stderr).toContain("Usage: img gemini");
    expect(result.stderr).not.toContain("--background");
  });

  it("accepts positional, flag, and stdin prompts", () => {
    const positional = runCli(["openai", "-o", "out.gif", "prompt", "from", "positionals"]);
    expect(positional.stderr).toContain("Unsupported output extension for openai: .gif");
    expect(positional.stderr).not.toContain("Missing prompt");

    const flag = runCli(["openai", "-p", "from flag", "-o", "out.gif"]);
    expect(flag.stderr).toContain("Unsupported output extension for openai: .gif");
    expect(flag.stderr).not.toContain("Missing prompt");

    const stdin = runCli(["openai", "-o", "out.gif"], " prompt from stdin \n");
    expect(stdin.stderr).toContain("Unsupported output extension for openai: .gif");
    expect(stdin.stderr).not.toContain("Missing prompt");
  });

  it("rejects ambiguous prompt input", () => {
    const result = runCli(["openai", "-p", "one", "-o", "out.png", "two"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Pass the prompt with --prompt or as positional text, not both",
    );
  });

  it("enforces provider/model constraints before making an API call", () => {
    const transparentGpt2 = runCli([
      "openai",
      "-o",
      "out.png",
      "--background",
      "transparent",
      "test",
    ]);
    expect(transparentGpt2.stderr).toContain("does not support transparent backgrounds");

    const transparentJpeg = runCli([
      "openai",
      "-o",
      "out.jpg",
      "--model",
      "gpt-image-1.5",
      "--background",
      "transparent",
      "test",
    ]);
    expect(transparentJpeg.stderr).toContain("require a .png or .webp output");

    const geminiLite = runCli([
      "gemini",
      "-o",
      "out.png",
      "--model",
      "gemini-3.1-flash-lite-image",
      "--image-size",
      "2K",
      "test",
    ]);
    expect(geminiLite.stderr).toContain("supports only image size 1K");

    const grokQuality = runCli([
      "grok",
      "-o",
      "out.jpg",
      "--model",
      "grok-imagine-image-quality",
      "--quality",
      "low",
      "test",
    ]);
    expect(grokQuality.stderr).toContain("only supported by grok-imagine-image-2.0");
  });
});
