import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export const KEYRING_SERVICE = "image-gen";

export interface KeyringBackend {
  readonly name: "keychain" | "secret-service";
  readonly label: string;
  get(account: string): string | null;
  set(account: string, secret: string): void;
  delete(account: string): boolean;
}

export class KeyringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyringError";
  }
}

const SECURITY = "/usr/bin/security";
const ERR_SEC_ITEM_NOT_FOUND = 44;

function runSecurity(args: string[], input?: string) {
  const result = spawnSync(SECURITY, args, { encoding: "utf8", input });
  if (result.error) throw new KeyringError(`Could not run ${SECURITY}: ${result.error.message}`);
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: (result.stderr ?? "").trim(),
  };
}

function quoteForSecurity(token: string, label: string): string {
  if (/[\r\n]/.test(token))
    throw new KeyringError(`The ${label} contains a line break and cannot be stored in Keychain.`);
  return `"${token.replace(/[\\"]/g, (character) => `\\${character}`)}"`;
}

export const macosKeychain: KeyringBackend = {
  name: "keychain",
  label: "macOS Keychain",
  get(account) {
    const result = runSecurity([
      "find-generic-password",
      "-a",
      account,
      "-s",
      KEYRING_SERVICE,
      "-w",
    ]);
    if (result.status === 0) return result.stdout.replace(/\r?\n$/, "") || null;
    if (result.status === ERR_SEC_ITEM_NOT_FOUND) return null;
    throw new KeyringError(
      `Keychain lookup failed (exit ${result.status})${result.stderr ? `: ${result.stderr}` : ""}`,
    );
  },
  set(account, secret) {
    const command = [
      "add-generic-password",
      "-a",
      quoteForSecurity(account, "provider name"),
      "-s",
      KEYRING_SERVICE,
      "-U",
      "-w",
      quoteForSecurity(secret, "API key"),
    ].join(" ");
    const result = runSecurity(["-i"], `${command}\n`);
    if (result.status !== 0) {
      throw new KeyringError(
        `Keychain write failed (exit ${result.status})${result.stderr ? `: ${result.stderr}` : ""}`,
      );
    }
  },
  delete(account) {
    const result = runSecurity(["delete-generic-password", "-a", account, "-s", KEYRING_SERVICE]);
    if (result.status === 0) return true;
    if (result.status === ERR_SEC_ITEM_NOT_FOUND) return false;
    throw new KeyringError(
      `Keychain delete failed (exit ${result.status})${result.stderr ? `: ${result.stderr}` : ""}`,
    );
  },
};

function runSecretTool(args: string[], input?: string) {
  const result = spawnSync("secret-tool", args, { encoding: "utf8", input });
  if (result.error) throw new KeyringError(`Could not run secret-tool: ${result.error.message}`);
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: (result.stderr ?? "").trim(),
  };
}

export const linuxSecretService: KeyringBackend = {
  name: "secret-service",
  label: "system keyring (Secret Service)",
  get(account) {
    const result = runSecretTool(["lookup", "service", KEYRING_SERVICE, "account", account]);
    if (result.status === 0) return result.stdout || null;
    if (result.status === 1 && !result.stderr) return null;
    throw new KeyringError(
      `secret-tool lookup failed (exit ${result.status})${result.stderr ? `: ${result.stderr}` : ""}`,
    );
  },
  set(account, secret) {
    const result = runSecretTool(
      [
        "store",
        "--label",
        `${KEYRING_SERVICE}: ${account}`,
        "service",
        KEYRING_SERVICE,
        "account",
        account,
      ],
      secret,
    );
    if (result.status !== 0)
      throw new KeyringError(
        `secret-tool store failed (exit ${result.status})${result.stderr ? `: ${result.stderr}` : ""}`,
      );
  },
  delete(account) {
    const existed = this.get(account) !== null;
    const result = runSecretTool(["clear", "service", KEYRING_SERVICE, "account", account]);
    if (result.status !== 0)
      throw new KeyringError(
        `secret-tool clear failed (exit ${result.status})${result.stderr ? `: ${result.stderr}` : ""}`,
      );
    return existed;
  },
};

let overrideBackend: KeyringBackend | null | undefined;
let detectedBackend: KeyringBackend | null | undefined;
let detectedHome: string | undefined;

function detectKeyring(): KeyringBackend | null {
  if (process.platform === "darwin") {
    if (!existsSync(SECURITY)) return null;
    const result = spawnSync(SECURITY, ["default-keychain", "-d", "user"], { encoding: "utf8" });
    return !result.error && result.status === 0 ? macosKeychain : null;
  }
  if (process.platform === "linux") {
    const result = spawnSync("secret-tool", [], { encoding: "utf8" });
    return result.error ? null : linuxSecretService;
  }
  return null;
}

export function keyring(): KeyringBackend | null {
  if (overrideBackend !== undefined) return overrideBackend;
  if (detectedBackend === undefined || detectedHome !== process.env.HOME) {
    detectedBackend = detectKeyring();
    detectedHome = process.env.HOME;
  }
  return detectedBackend;
}

export function setKeyringBackend(backend: KeyringBackend | null | undefined): void {
  overrideBackend = backend;
  if (backend === undefined) {
    detectedBackend = undefined;
    detectedHome = undefined;
  }
}

export function memoryKeyring(
  initial: Record<string, string> = {},
): KeyringBackend & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial));
  return {
    name: "keychain",
    label: "test keyring",
    store,
    get: (account) => store.get(account) ?? null,
    set: (account, secret) => void store.set(account, secret),
    delete: (account) => store.delete(account),
  };
}
