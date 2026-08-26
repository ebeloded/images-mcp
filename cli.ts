#!/usr/bin/env bun
import tty from "node:tty";
import { Argument, Command, CommanderError, Option } from "commander";
import { password } from "@inquirer/prompts";
import packageMetadata from "./package.json" with { type: "json" };
import { generateGeminiImage, generateGrokImage, generateOpenAIImage } from "./core.ts";
import {
  configFilePath,
  deleteKey,
  getKey,
  KEY_PROVIDERS,
  keyStatuses,
  migrateKeys,
  setKey,
  type KeyProvider,
} from "./keys.ts";
import { providerSpecs, type Provider } from "./metadata.ts";
import {
  geminiAspectRatioSchema,
  geminiImageSizeSchema,
  geminiModelSchema,
  geminiParamsSchema,
  grokAspectRatioSchema,
  grokModelSchema,
  grokParamsSchema,
  grokQualitySchema,
  grokResolutionSchema,
  openAIBackgroundSchema,
  openAIModelSchema,
  openAIParamsSchema,
  openAIQualitySchema,
  openAISizeSchema,
  type GeminiParams,
  type GrokParams,
  type OpenAIParams,
} from "./schemas.ts";

type GenerationOptions = {
  prompt?: string;
  output: string;
  input?: string[];
  force?: boolean;
  model: string;
  size?: string;
  quality?: string;
  background?: string;
  aspectRatio?: string;
  imageSize?: string;
  resolution?: string;
};

function collectInputs(value: string, previous: string[] = []): string[] {
  for (const input of value.split(",")) {
    const trimmed = input.trim();
    if (trimmed) previous.push(trimmed);
  }
  return previous;
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j]!;
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = old;
    }
  }
  return previous[b.length]!;
}

function suggestCommand(value: string): string | undefined {
  let best: { command: string; distance: number } | undefined;
  for (const command of ["openai", "gemini", "grok", "keys"]) {
    const distance = command.startsWith(value) ? 0 : editDistance(value, command);
    if (distance <= 3 && (!best || distance < best.distance)) best = { command, distance };
  }
  return best?.command;
}

async function resolvePrompt(
  flagPrompt: string | undefined,
  positionalWords: string[],
): Promise<string> {
  const positionalPrompt = positionalWords.join(" ").trim();
  if (flagPrompt !== undefined && positionalPrompt)
    throw new Error("Pass the prompt with --prompt or as positional text, not both");
  const explicit = (flagPrompt ?? positionalPrompt).trim();
  if (explicit) return explicit;
  if (!tty.isatty(0)) {
    const piped = (await Bun.stdin.text()).trim();
    if (piped) return piped;
  }
  throw new Error("Missing prompt. Pass --prompt, add it after the options, or pipe it on stdin");
}

function requireValid<T>(
  result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } },
): T {
  if (result.success) return result.data;
  throw new Error(result.error.issues[0]?.message ?? "Invalid options");
}

async function paramsFor(
  provider: Provider,
  promptWords: string[],
  options: GenerationOptions,
): Promise<OpenAIParams | GeminiParams | GrokParams> {
  const prompt = await resolvePrompt(options.prompt, promptWords);
  const shared = {
    prompt,
    output_path: options.output.trim(),
    input_images: options.input?.length ? options.input : undefined,
    model: options.model,
  };

  if (provider === "openai") {
    const params = requireValid(
      openAIParamsSchema.safeParse({
        ...shared,
        size: options.size,
        quality: options.quality,
        background: options.background,
      }),
    );
    if (params.background === "transparent") {
      if (params.model === "gpt-image-2" || params.model === "gpt-image-2-2026-04-21") {
        throw new Error(`${params.model} does not support transparent backgrounds`);
      }
      if (!/\.(png|webp)$/i.test(params.output_path))
        throw new Error("Transparent backgrounds require a .png or .webp output");
    }
    return params;
  }

  if (provider === "gemini") {
    const params = requireValid(
      geminiParamsSchema.safeParse({
        ...shared,
        aspect_ratio: options.aspectRatio,
        image_size: options.imageSize,
      }),
    );
    if (params.image_size === "512" && params.model !== "gemini-3.1-flash-image") {
      throw new Error("Image size 512 is only supported by gemini-3.1-flash-image");
    }
    if (
      params.model === "gemini-3.1-flash-lite-image" &&
      params.image_size &&
      params.image_size !== "1K"
    ) {
      throw new Error("gemini-3.1-flash-lite-image supports only image size 1K");
    }
    return params;
  }

  const params = requireValid(
    grokParamsSchema.safeParse({
      ...shared,
      aspect_ratio: options.aspectRatio,
      resolution: options.resolution,
      quality: options.quality,
    }),
  );
  if (params.quality && params.model !== "grok-imagine-image-2.0") {
    throw new Error("--quality is only supported by grok-imagine-image-2.0");
  }
  return params;
}

async function generate(
  provider: Provider,
  promptWords: string[],
  options: GenerationOptions,
): Promise<void> {
  const params = await paramsFor(provider, promptWords, options);
  if (!options.force && (await Bun.file(params.output_path).exists())) {
    throw new Error(
      `Output file already exists: ${params.output_path}\nUse -f or --force to overwrite.`,
    );
  }

  const result =
    provider === "openai"
      ? await generateOpenAIImage(params as OpenAIParams)
      : provider === "gemini"
        ? await generateGeminiImage(params as GeminiParams)
        : await generateGrokImage(params as GrokParams);
  if (!result.ok) throw new Error(result.error);
  console.log(JSON.stringify(result.data, null, 2));
}

function addSharedGenerationOptions(command: Command): Command {
  return command
    .argument("[prompt...]", "prompt or editing instructions")
    .option("-p, --prompt <text>", "prompt (alternatively use positional text or stdin)")
    .requiredOption("-o, --output <path>", "output file path")
    .option("-i, --input <path>", "input image; repeat or use comma-separated paths", collectInputs)
    .option("-f, --force", "overwrite an existing output file");
}

function addProviderCommands(program: Command): void {
  const openai = addSharedGenerationOptions(
    program.command("openai").description(providerSpecs.openai.summary),
  )
    .addOption(
      new Option("--model <name>", "OpenAI image model")
        .choices(openAIModelSchema.options)
        .default("gpt-image-2"),
    )
    .addOption(
      new Option("--size <size>", "image dimensions")
        .choices(openAISizeSchema.options)
        .default("auto"),
    )
    .addOption(
      new Option("--quality <quality>", "rendering quality")
        .choices(openAIQualitySchema.options)
        .default("auto"),
    )
    .addOption(
      new Option("--background <type>", "background handling")
        .choices(openAIBackgroundSchema.options)
        .default("auto"),
    )
    .addHelpText(
      "after",
      "\nExamples:\n  img openai -o cat.png 'A neon cat in rainy Tokyo'\n  img openai -i source.png -o edit.webp 'Add dramatic lighting'",
    )
    .action((promptWords: string[], options: GenerationOptions) =>
      generate("openai", promptWords, options),
    );

  const gemini = addSharedGenerationOptions(
    program.command("gemini").description(providerSpecs.gemini.summary),
  )
    .addOption(
      new Option("--model <name>", "Gemini image model")
        .choices(geminiModelSchema.options)
        .default("gemini-3.1-flash-image"),
    )
    .addOption(
      new Option("--aspect-ratio <ratio>", "output aspect ratio").choices(
        geminiAspectRatioSchema.options,
      ),
    )
    .addOption(
      new Option("--image-size <size>", "output image size").choices(geminiImageSizeSchema.options),
    )
    .addHelpText(
      "after",
      "\nExample:\n  img gemini -o concept.png --aspect-ratio 16:9 --image-size 2K < prompt.txt",
    )
    .action((promptWords: string[], options: GenerationOptions) =>
      generate("gemini", promptWords, options),
    );

  const grok = addSharedGenerationOptions(
    program.command("grok").description(providerSpecs.grok.summary),
  )
    .addOption(
      new Option("--model <name>", "xAI image model")
        .choices(grokModelSchema.options)
        .default("grok-imagine-image-2.0"),
    )
    .addOption(
      new Option("--aspect-ratio <ratio>", "output aspect ratio").choices(
        grokAspectRatioSchema.options,
      ),
    )
    .addOption(
      new Option("--resolution <size>", "output resolution").choices(grokResolutionSchema.options),
    )
    .addOption(
      new Option("--quality <quality>", "rendering quality (Imagine 2.0 only)").choices(
        grokQualitySchema.options,
      ),
    )
    .addHelpText(
      "after",
      "\nExample:\n  img grok -o portrait.jpg --aspect-ratio 3:2 'Editorial portrait with rim light'",
    )
    .action((promptWords: string[], options: GenerationOptions) =>
      generate("grok", promptWords, options),
    );

  for (const command of [openai, gemini, grok]) command.showHelpAfterError();
}

function providerArgument(): Argument {
  return new Argument("<provider>", "API provider").choices([...KEY_PROVIDERS]);
}

function storageLabel(storage: string): string {
  return storage === "keychain"
    ? "macOS Keychain"
    : storage === "secret-service"
      ? "system keyring"
      : configFilePath();
}

function printKeyStatuses(): void {
  console.log("Provider  Stored                       Environment");
  for (const status of keyStatuses()) {
    const stored = status.stored ? `${status.stored.masked} (${status.stored.storage})` : "—";
    console.log(
      `${status.provider.padEnd(9)} ${stored.padEnd(28)} ${status.environment.join(", ") || "—"}`,
    );
  }
}

function addKeysCommand(program: Command): void {
  const keys = program.command("keys").description("Manage provider API keys");
  keys.action(printKeyStatuses);

  keys
    .command("list")
    .description("Show stored-key and environment status")
    .action(printKeyStatuses);

  keys
    .command("set")
    .description("Store a provider key in the system keyring")
    .addArgument(providerArgument())
    .argument("[key]", "key value (omit to prompt or read stdin)")
    .option("--plaintext", `store in ${configFilePath()} instead of the system keyring`)
    .action(
      async (
        provider: KeyProvider,
        argumentValue: string | undefined,
        options: { plaintext?: boolean },
      ) => {
        let value = argumentValue;
        if (value)
          console.error(
            "Warning: passing secrets as arguments may expose them in process listings and shell history.",
          );
        if (!value)
          value = tty.isatty(0)
            ? await password({ message: `${provider} API key:` })
            : (await Bun.stdin.text()).trim();
        if (!value) throw new Error("No key provided");
        const storage = await setKey(provider, value, { plaintext: options.plaintext });
        console.log(`${provider} key saved to ${storageLabel(storage)}.`);
      },
    );

  keys
    .command("get")
    .description("Print a stored key (does not read environment variables)")
    .addArgument(providerArgument())
    .action((provider: KeyProvider) => {
      const stored = getKey(provider);
      if (!stored) throw new Error(`No stored ${provider} key found`);
      console.log(stored.value);
    });

  keys
    .command("delete")
    .description("Remove a stored key from the keyring and legacy config")
    .addArgument(providerArgument())
    .action(async (provider: KeyProvider) => {
      if (!(await deleteKey(provider))) throw new Error(`No stored ${provider} key found`);
      console.log(`${provider} key removed.`);
    });

  keys
    .command("migrate")
    .description("Move plaintext config keys into the system keyring")
    .action(async () => {
      const result = await migrateKeys();
      if (result.migrated.length === 0)
        console.log(`Nothing to migrate: no plaintext keys in ${result.path}.`);
      else
        console.log(
          `Moved ${result.migrated.join(", ")} to ${result.keyringLabel}. ${result.path} no longer contains those secrets.`,
        );
    });

  keys.addHelpText(
    "after",
    `\nKeys use the system keyring by default. Use --plaintext only when required.\nRun 'img keys migrate' to move legacy secrets out of ${configFilePath()}.`,
  );
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name("img")
    .description("Generate and edit images with OpenAI, Google Gemini, and xAI Grok")
    .version(packageMetadata.version, "-v, --version", "output the version number")
    .enablePositionalOptions()
    .allowExcessArguments()
    .exitOverride()
    .showSuggestionAfterError()
    .showHelpAfterError()
    .addHelpCommand()
    .action((_options: unknown, command: Command) => {
      const unknown = command.args[0];
      if (unknown) {
        const suggestion = suggestCommand(unknown);
        command.error(
          `Unknown command '${unknown}'.${suggestion ? ` Did you mean '${suggestion}'?` : ""}`,
        );
      }
      program.help();
    });

  program
    .command("version", { hidden: true })
    .description("Output the version number")
    .action(() => console.log(packageMetadata.version));

  addProviderCommands(program);
  addKeysCommand(program);
  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") return;
      process.exitCode = error.exitCode;
      return;
    }
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await run();
