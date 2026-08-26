import { z } from "zod";

export const sharedDescriptions = {
  prompt: "Description of the image to generate, or editing instructions if input_images provided",
  outputPath: "Path where the image should be saved (e.g., /path/to/image.png)",
  inputImages: "Optional array of image file paths for editing/reference",
} as const;

export const openAIModelSchema = z.enum(["gpt-image-2", "gpt-image-2-2026-04-21", "gpt-image-1.5"]);
export const openAISizeSchema = z.enum([
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
]);
export const openAIQualitySchema = z.enum(["auto", "high", "medium", "low"]);
export const openAIBackgroundSchema = z.enum(["auto", "transparent", "opaque"]);

export const geminiModelSchema = z.enum([
  "gemini-2.5-flash-image",
  "gemini-3-pro-image",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
]);
export const geminiAspectRatioSchema = z.enum(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]);
export const geminiImageSizeSchema = z.enum(["512", "1K", "2K", "4K"]);

export const openAIInputShape = {
  prompt: z.string().describe(sharedDescriptions.prompt),
  output_path: z.string().describe(sharedDescriptions.outputPath),
  model: openAIModelSchema.default("gpt-image-2").describe("OpenAI image model"),
  input_images: z.array(z.string()).optional().describe(sharedDescriptions.inputImages),
  size: openAISizeSchema.default("auto").describe("Image size"),
  quality: openAIQualitySchema.default("auto").describe("Image quality"),
  background: openAIBackgroundSchema.default("auto").describe("Background type"),
} as const;

export const geminiInputShape = {
  prompt: z.string().describe(sharedDescriptions.prompt),
  output_path: z.string().describe(sharedDescriptions.outputPath),
  model: geminiModelSchema.default("gemini-3.1-flash-image").describe("Model"),
  input_images: z.array(z.string()).optional().describe(sharedDescriptions.inputImages),
  aspect_ratio: geminiAspectRatioSchema.optional().describe("Aspect ratio"),
  image_size: geminiImageSizeSchema.optional().describe("Image size"),
} as const;

export const grokModelSchema = z.enum(["grok-imagine-image-2.0", "grok-imagine-image-quality", "grok-imagine-image", "grok-2-image"]);
export const grokAspectRatioSchema = z.enum([
  "auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2",
  "19.5:9", "9:19.5", "20:9", "9:20", "21:9", "5:2",
]);
export const grokResolutionSchema = z.enum(["1k", "2k"]);
export const grokQualitySchema = z.enum(["low", "medium"]);

export const grokInputShape = {
  prompt: z.string().describe(sharedDescriptions.prompt),
  output_path: z.string().describe(sharedDescriptions.outputPath),
  model: grokModelSchema.default("grok-imagine-image-2.0").describe("Model"),
  input_images: z.array(z.string()).optional().describe(sharedDescriptions.inputImages),
  aspect_ratio: grokAspectRatioSchema.optional().describe("Aspect ratio"),
  resolution: grokResolutionSchema.optional().describe("Image resolution (1k or 2k)"),
  quality: grokQualitySchema.optional().describe("Image quality for grok-imagine-image-2.0 (low or medium)"),
} as const;

export const openAIParamsSchema = z.object(openAIInputShape).strict();
export const geminiParamsSchema = z.object(geminiInputShape).strict();
export const grokParamsSchema = z.object(grokInputShape).strict();

export type OpenAIParams = z.infer<typeof openAIParamsSchema>;
export type GeminiParams = z.infer<typeof geminiParamsSchema>;
export type GrokParams = z.infer<typeof grokParamsSchema>;
