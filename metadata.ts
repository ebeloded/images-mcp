export type Provider = "openai" | "gemini" | "grok";

export const providerSpecs: Record<
  Provider,
  { summary: string; outputExtensions: readonly string[] }
> = {
  openai: {
    summary: "Generate/edit via OpenAI",
    outputExtensions: [".png", ".jpg", ".jpeg", ".webp"],
  },
  gemini: {
    summary: "Generate/edit via Gemini",
    outputExtensions: [".png"],
  },
  grok: {
    summary: "Generate/edit via xAI Grok",
    outputExtensions: [".jpg", ".jpeg"],
  },
};
