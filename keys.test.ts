import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configFilePath, getKey, migrateKeys, setKey } from "./keys.ts";
import { memoryKeyring, setKeyringBackend, type KeyringBackend } from "./keyring.ts";

const originalHome = process.env.HOME;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  process.env.HOME = originalHome;
  if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  setKeyringBackend(undefined);
});

describe("key storage", () => {
  it("writes API keys atomically with private permissions", () => {
    const testHome = mkdtempSync(join(tmpdir(), "image-gen-keys-"));

    try {
      const result = Bun.spawnSync(["bun", "run", "cli.ts", "keys", "set", "openai"], {
        cwd: import.meta.dir,
        env: { ...process.env, HOME: testHome, XDG_CONFIG_HOME: join(testHome, ".config") },
        stdin: new TextEncoder().encode("test-secret\n"),
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(result.exitCode).toBe(0);
      const configDirectory = join(testHome, ".config", "image-gen");
      const configPath = join(configDirectory, "config.json");
      expect(statSync(configDirectory).mode & 0o777).toBe(0o700);
      expect(statSync(configPath).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
        openai_api_key: "test-secret",
      });
    } finally {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  it("uses the system keyring by default and removes an older plaintext value", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "image-gen-keyring-"));
    process.env.HOME = testHome;
    process.env.XDG_CONFIG_HOME = join(testHome, ".config");
    const backend = memoryKeyring();
    setKeyringBackend(backend);

    try {
      await setKey("openai", "old-plaintext", { plaintext: true });
      expect(await setKey("openai", "new-keychain-value")).toBe("keychain");
      expect(backend.store.get("openai")).toBe("new-keychain-value");
      expect(getKey("openai")).toEqual({ value: "new-keychain-value", storage: "keychain" });
      expect(JSON.parse(readFileSync(configFilePath(), "utf8"))).toEqual({});
    } finally {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  it("migrates every plaintext key only after verified keyring writes", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "image-gen-migrate-"));
    process.env.HOME = testHome;
    process.env.XDG_CONFIG_HOME = join(testHome, ".config");
    await setKey("openai", "openai-plaintext", { plaintext: true });
    await setKey("gemini", "gemini-plaintext", { plaintext: true });
    const backend = memoryKeyring();
    setKeyringBackend(backend);

    try {
      const result = await migrateKeys();
      expect(result.migrated).toEqual(["openai", "gemini"]);
      expect(backend.store.get("openai")).toBe("openai-plaintext");
      expect(backend.store.get("gemini")).toBe("gemini-plaintext");
      expect(JSON.parse(readFileSync(configFilePath(), "utf8"))).toEqual({});
      expect((await migrateKeys()).migrated).toEqual([]);
    } finally {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  it("rolls back keyring writes and preserves plaintext when migration fails", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "image-gen-migrate-failure-"));
    process.env.HOME = testHome;
    process.env.XDG_CONFIG_HOME = join(testHome, ".config");
    await setKey("openai", "openai-plaintext", { plaintext: true });
    await setKey("gemini", "gemini-plaintext", { plaintext: true });
    const store = new Map<string, string>();
    const backend: KeyringBackend = {
      name: "keychain",
      label: "failing test keyring",
      get: (provider) => store.get(provider) ?? null,
      set: (provider, value) => {
        if (provider === "gemini") throw new Error("simulated write failure");
        store.set(provider, value);
      },
      delete: (provider) => store.delete(provider),
    };
    setKeyringBackend(backend);

    try {
      await expect(migrateKeys()).rejects.toThrow("Migration failed");
      expect(store.size).toBe(0);
      expect(JSON.parse(readFileSync(configFilePath(), "utf8"))).toEqual({
        openai_api_key: "openai-plaintext",
        gemini_api_key: "gemini-plaintext",
      });
    } finally {
      rmSync(testHome, { recursive: true, force: true });
    }
  });
});
