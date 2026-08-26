import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getKey } from "./keys.ts";

type ConfigFile = {
  openai_api_key?: string;
  gemini_api_key?: string;
  xai_api_key?: string;
};

function tryReadConfigFile(path: string): ConfigFile | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
  } catch {
    return null;
  }
}

function loadProjectConfig(): ConfigFile {
  return tryReadConfigFile(join(process.cwd(), ".image-gen.json")) ?? {};
}

let cachedProjectConfig: ConfigFile | null = null;

function getProjectConfig(): ConfigFile {
  if (!cachedProjectConfig) {
    cachedProjectConfig = loadProjectConfig();
  }
  return cachedProjectConfig;
}

export function getOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY ?? getProjectConfig().openai_api_key ?? getKey("openai")?.value;
}

export function getGeminiApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    getProjectConfig().gemini_api_key ??
    getKey("gemini")?.value
  );
}

export function getGrokApiKey(): string | undefined {
  return process.env.XAI_API_KEY ?? getProjectConfig().xai_api_key ?? getKey("grok")?.value;
}
