import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { keyring } from "./keyring.ts";

export type KeyProvider = "openai" | "gemini" | "grok";
export type KeyStorage = "keychain" | "secret-service" | "config";

type ConfigFile = {
  openai_api_key?: string;
  gemini_api_key?: string;
  xai_api_key?: string;
};

const PROVIDER_TO_KEY: Record<KeyProvider, keyof ConfigFile> = {
  openai: "openai_api_key",
  gemini: "gemini_api_key",
  grok: "xai_api_key",
};

export const PROVIDER_ENV_VARS: Record<KeyProvider, readonly string[]> = {
  openai: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  grok: ["XAI_API_KEY"],
};

export const KEY_PROVIDERS: readonly KeyProvider[] = ["openai", "gemini", "grok"];

export function configFilePath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "image-gen", "config.json");
}

export function readConfigFile(): ConfigFile {
  const path = configFilePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
  } catch (error) {
    throw new Error(
      `Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
  }
}

async function writeConfigFile(config: ConfigFile): Promise<void> {
  const path = configFilePath();
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const temporaryPath = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await Bun.write(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
}

export function maskKey(value: string): string {
  return value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : "***";
}

export async function setKey(
  provider: KeyProvider,
  value: string,
  options: { plaintext?: boolean } = {},
): Promise<KeyStorage> {
  const backend = keyring();
  if (!options.plaintext && backend) {
    const previous = backend.get(provider);
    backend.set(provider, value);
    try {
      if (backend.get(provider) !== value)
        throw new Error(`Failed to verify ${provider} key after writing it to ${backend.label}`);
      const config = readConfigFile();
      if (config[PROVIDER_TO_KEY[provider]] !== undefined) {
        delete config[PROVIDER_TO_KEY[provider]];
        await writeConfigFile(config);
      }
    } catch (error) {
      if (previous === null) backend.delete(provider);
      else backend.set(provider, previous);
      throw error;
    }
    return backend.name;
  }

  const config = readConfigFile();
  config[PROVIDER_TO_KEY[provider]] = value;
  await writeConfigFile(config);
  if (options.plaintext) backend?.delete(provider);
  return "config";
}

export function getKey(provider: KeyProvider): { value: string; storage: KeyStorage } | undefined {
  const backend = keyring();
  const keychainValue = backend?.get(provider);
  if (keychainValue) return { value: keychainValue, storage: backend!.name };

  const configValue = readConfigFile()[PROVIDER_TO_KEY[provider]];
  return configValue ? { value: configValue, storage: "config" } : undefined;
}

export async function deleteKey(provider: KeyProvider): Promise<boolean> {
  let removed = false;
  const config = readConfigFile();
  const configKey = PROVIDER_TO_KEY[provider];
  if (config[configKey] !== undefined) {
    delete config[configKey];
    await writeConfigFile(config);
    removed = true;
  }
  if (keyring()?.delete(provider)) removed = true;
  return removed;
}

export type KeyStatus = {
  provider: KeyProvider;
  stored?: { masked: string; storage: KeyStorage };
  environment: string[];
};

export function keyStatuses(): KeyStatus[] {
  return KEY_PROVIDERS.map((provider) => {
    const stored = getKey(provider);
    const environment = PROVIDER_ENV_VARS[provider].filter((name) => Boolean(process.env[name]));
    return {
      provider,
      ...(stored && { stored: { masked: maskKey(stored.value), storage: stored.storage } }),
      environment,
    };
  });
}

export type MigrationResult = {
  migrated: KeyProvider[];
  path: string;
  keyringLabel: string;
};

export async function migrateKeys(): Promise<MigrationResult> {
  const backend = keyring();
  const path = configFilePath();
  if (!backend) throw new Error(`No system keyring is available; credentials remain in ${path}`);

  const config = readConfigFile();
  const plaintext = KEY_PROVIDERS.flatMap((provider) => {
    const value = config[PROVIDER_TO_KEY[provider]];
    return value ? [{ provider, value }] : [];
  });
  const previous = new Map<KeyProvider, string | null>();

  try {
    for (const { provider, value } of plaintext) {
      previous.set(provider, backend.get(provider));
      backend.set(provider, value);
      if (backend.get(provider) !== value)
        throw new Error(`readback did not match for ${provider}`);
    }
    if (plaintext.length > 0) {
      for (const { provider } of plaintext) delete config[PROVIDER_TO_KEY[provider]];
      await writeConfigFile(config);
    }
  } catch (error) {
    for (const [provider, value] of previous) {
      try {
        if (value === null) backend.delete(provider);
        else backend.set(provider, value);
      } catch {
        // Best-effort rollback; the plaintext config remains authoritative.
      }
    }
    throw new Error(
      `Migration failed; ${path} was left unchanged: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return { migrated: plaintext.map(({ provider }) => provider), path, keyringLabel: backend.label };
}
