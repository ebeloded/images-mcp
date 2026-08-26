import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("key storage", () => {
  it("writes API keys atomically with private permissions", () => {
    const testHome = mkdtempSync(join(tmpdir(), "image-gen-keys-"));

    try {
      const result = Bun.spawnSync(["bun", "run", "cli.ts", "keys", "set", "openai"], {
        cwd: import.meta.dir,
        env: { ...process.env, HOME: testHome },
        stdin: new TextEncoder().encode("test-secret\n"),
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(result.exitCode).toBe(0);
      const configDirectory = join(testHome, ".config", "image-gen");
      const configPath = join(configDirectory, "config.json");
      expect(statSync(configDirectory).mode & 0o777).toBe(0o700);
      expect(statSync(configPath).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({ openai_api_key: "test-secret" });
    } finally {
      rmSync(testHome, { recursive: true, force: true });
    }
  });
});
