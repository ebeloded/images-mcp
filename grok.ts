import OpenAI from "openai";
import { getGrokApiKey } from "./config.ts";
import type { GrokParams } from "./schemas.ts";
import {
  type GenerateResult,
  type GrokResult,
  getMimeType,
  loadInputImages,
  resolveOutputFormat,
  saveImage,
} from "./core-utils.ts";

type GrokImageResponse = { data?: Array<{ b64_json?: string }> };
type GrokEditParams = {
  model: string;
  prompt: string;
  image?: { url: string; type: "image_url" };
  images?: Array<{ url: string; type: "image_url" }>;
  response_format: "b64_json";
  aspect_ratio?: string;
  resolution?: string;
  quality?: string;
};

export type GrokClient = {
  images: {
    editJson: (params: GrokEditParams) => Promise<GrokImageResponse>;
    generate: (params: Parameters<OpenAI["images"]["generate"]>[0]) => Promise<GrokImageResponse>;
  };
};

let grokClient: GrokClient | null = null;

export function setGrokClientForTests(client: GrokClient | null) {
  grokClient = client;
}

function getGrok(): GrokClient {
  if (!grokClient) {
    const apiKey = getGrokApiKey();
    if (!apiKey) {
      throw new Error("Missing XAI_API_KEY environment variable or xai_api_key in config");
    }
    const baseURL = "https://api.x.ai/v1";
    const openai = new OpenAI({ apiKey, baseURL });
    grokClient = {
      images: {
        generate: openai.images.generate.bind(openai.images) as GrokClient["images"]["generate"],
        editJson: async (params) => {
          const response = await fetch(`${baseURL}/images/edits`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(params),
          });
          if (!response.ok) {
            const detail = (await response.text()).trim();
            throw new Error(`xAI image edit failed (${response.status})${detail ? `: ${detail}` : ""}`);
          }
          return await response.json() as GrokImageResponse;
        },
      },
    };
  }
  return grokClient;
}

export async function generateGrokImage({
  prompt,
  output_path,
  model,
  input_images,
  aspect_ratio,
  resolution,
  quality,
}: GrokParams): Promise<GenerateResult<GrokResult>> {
  const outputFormat = resolveOutputFormat("grok", output_path);
  if (!outputFormat.ok) {
    return { ok: false, error: outputFormat.error };
  }

  const loadedImages = await loadInputImages(input_images);
  if (!loadedImages.ok) {
    return loadedImages;
  }

  let imageData: string | undefined;

  if (loadedImages.data.length > 0) {
    const imageInputs = loadedImages.data.map((image) => ({
      url: `data:${getMimeType(image.path)};base64,${Buffer.from(image.data).toString("base64")}`,
      type: "image_url" as const,
    }));
    const response = await getGrok().images.editJson({
      model,
      prompt,
      ...(imageInputs.length === 1 ? { image: imageInputs[0]! } : { images: imageInputs }),
      response_format: "b64_json",
      ...(aspect_ratio && { aspect_ratio }),
      ...(resolution && { resolution }),
      ...(quality && { quality }),
    });
    imageData = response.data?.[0]?.b64_json;
  } else {
    const response = await getGrok().images.generate({
      model,
      prompt,
      n: 1,
      response_format: "b64_json",
      ...(aspect_ratio && { aspect_ratio }),
      ...(resolution && { resolution }),
      ...(quality && { quality }),
    } as Parameters<OpenAI["images"]["generate"]>[0]);
    imageData = response.data?.[0]?.b64_json;
  }

  if (!imageData) {
    return { ok: false, error: "No image data received from xAI" };
  }

  const saved = await saveImage(imageData, output_path);
  return {
    ok: true,
    data: {
      success: true,
      ...saved,
      model,
      aspect_ratio,
      resolution,
      quality,
      input_images_count: input_images?.length ?? 0,
    },
  };
}
