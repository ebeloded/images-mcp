import { describe, expect, it } from "bun:test";
import {
  createOpenAIUploadFile,
  generateGeminiImage,
  generateGrokImage,
  generateOpenAIImage,
  getMimeType,
  resolveOutputFormat,
  setClientsForTests,
} from "./core.ts";

function tempPath(name: string): string {
  return `/tmp/image-gen-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`;
}

describe("core mime and output format handling", () => {
  it("detects upload MIME type from extension for OpenAI edits", () => {
    const data = new Uint8Array([1, 2, 3]).buffer;
    const file = createOpenAIUploadFile(data, "sample.webp");
    expect(file.type).toBe("image/webp");
    expect(file.name).toBe("sample.webp");
  });

  it("keeps MIME lookup behavior for known and unknown extensions", () => {
    expect(getMimeType("photo.JPG")).toBe("image/jpeg");
    expect(getMimeType("photo.unknown")).toBe("image/png");
  });

  it("infers OpenAI output format from extension", () => {
    const resolved = resolveOutputFormat("openai", "out.jpg");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.format).toBe("jpeg");
      expect(resolved.mimeType).toBe("image/jpeg");
    }
  });

  it("rejects unsupported extension/provider combinations", () => {
    const openai = resolveOutputFormat("openai", "out.gif");
    expect(openai.ok).toBe(false);
    if (!openai.ok) {
      expect(openai.error).toContain("Unsupported output extension for openai");
      expect(openai.error).toContain(".png, .jpg, .jpeg, .webp");
    }

    const gemini = resolveOutputFormat("gemini", "out.jpg");
    expect(gemini.ok).toBe(false);
    if (!gemini.ok) {
      expect(gemini.error).toContain("Unsupported output extension for gemini");
      expect(gemini.error).toContain(".png");
    }
  });
});

describe("core provider request mapping", () => {
  it("maps OpenAI generate args and writes output", async () => {
    const outputPath = tempPath("openai-generate.png");
    let generateArgs: Record<string, unknown> | undefined;

    setClientsForTests({
      openai: {
        images: {
          edit: async () => ({ data: [{ b64_json: "" }] }),
          generate: async (params) => {
            generateArgs = params as unknown as Record<string, unknown>;
            return { data: [{ b64_json: Buffer.from("openai").toString("base64") }] };
          },
        },
      },
      google: null,
    });

    const result = await generateOpenAIImage({
      prompt: "test prompt",
      output_path: outputPath,
      model: "gpt-image-1.5",
      size: "auto",
      quality: "high",
      background: "transparent",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.path).toBe(outputPath);
      expect(result.data.input_images_count).toBe(0);
      expect(result.data.bytes).toBeGreaterThan(0);
    }

    expect(generateArgs).toBeTruthy();
    expect(generateArgs?.model).toBe("gpt-image-1.5");
    expect(generateArgs?.prompt).toBe("test prompt");
    expect(generateArgs?.size).toBeUndefined();
    expect(generateArgs?.quality).toBe("high");
    expect(generateArgs?.background).toBe("transparent");
    expect(generateArgs?.output_format).toBe("png");
  });

  it("maps OpenAI edit args with image uploads", async () => {
    const inputPath = tempPath("openai-edit-input.png");
    const outputPath = tempPath("openai-edit-output.webp");
    await Bun.write(inputPath, new Uint8Array([1, 2, 3, 4]));

    let editArgs: Record<string, unknown> | undefined;

    setClientsForTests({
      openai: {
        images: {
          edit: async (params) => {
            editArgs = params as unknown as Record<string, unknown>;
            return { data: [{ b64_json: Buffer.from("edited").toString("base64") }] };
          },
          generate: async () => ({ data: [{ b64_json: "" }] }),
        },
      },
      google: null,
    });

    const result = await generateOpenAIImage({
      prompt: "edit prompt",
      output_path: outputPath,
      model: "gpt-image-1.5",
      input_images: [inputPath],
      size: "1024x1024",
      quality: "auto",
      background: "opaque",
    });

    expect(result.ok).toBe(true);
    expect(editArgs?.output_format).toBe("webp");
    expect(editArgs?.size).toBe("1024x1024");
    expect(editArgs?.prompt).toBe("edit prompt");

    const upload = editArgs?.image as File | File[] | undefined;
    if (upload && Array.isArray(upload)) {
      expect(upload.length).toBeGreaterThan(0);
      expect(upload[0]?.name.endsWith(".png")).toBe(true);
    } else {
      expect(upload instanceof File).toBe(true);
      if (upload instanceof File) {
        expect(upload.name.endsWith(".png")).toBe(true);
      }
    }
  });

  it("maps Gemini content/config and writes output", async () => {
    const inputPath = tempPath("gemini-input.jpg");
    const outputPath = tempPath("gemini-output.png");
    await Bun.write(inputPath, new Uint8Array([9, 8, 7]));

    let request: Record<string, unknown> | undefined;

    setClientsForTests({
      openai: null,
      google: {
        models: {
          generateContent: async (params) => {
            request = params as unknown as Record<string, unknown>;
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: {
                          data: Buffer.from("gemini").toString("base64"),
                        },
                      },
                    ],
                  },
                },
              ],
            };
          },
        },
      },
    });

    const result = await generateGeminiImage({
      prompt: "gemini prompt",
      output_path: outputPath,
      model: "gemini-3-pro-image",
      input_images: [inputPath],
      aspect_ratio: "16:9",
      image_size: "2K",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.path).toBe(outputPath);
      expect(result.data.input_images_count).toBe(1);
    }

    expect(request?.model).toBe("gemini-3-pro-image");
  });

  it("generates with gemini-3.1-flash-image (Nano Banana 2)", async () => {
    const outputPath = tempPath("gemini-nb2-output.png");
    let request: Record<string, unknown> | undefined;

    setClientsForTests({
      openai: null,
      google: {
        models: {
          generateContent: async (params) => {
            request = params as unknown as Record<string, unknown>;
            return {
              candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from("nb2").toString("base64") } }] } }],
            };
          },
        },
      },
    });

    const result = await generateGeminiImage({
      prompt: "nano banana test",
      output_path: outputPath,
      model: "gemini-3.1-flash-image",
    });

    expect(result.ok).toBe(true);
    expect(request?.model).toBe("gemini-3.1-flash-image");
    const contents = request?.contents as Array<Record<string, unknown>>;
    expect(contents[0]?.text).toBe("nano banana test");
    const config = request?.config as Record<string, unknown>;
    expect(config?.responseModalities).toEqual(["IMAGE", "TEXT"]);
  });

  it("generates with gemini-3.1-flash-lite-image (Nano Banana 2 Lite)", async () => {
    const outputPath = tempPath("gemini-nb2-lite-output.png");
    let request: Record<string, unknown> | undefined;

    setClientsForTests({
      openai: null,
      google: {
        models: {
          generateContent: async (params) => {
            request = params as unknown as Record<string, unknown>;
            return {
              candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from("nb2-lite").toString("base64") } }] } }],
            };
          },
        },
      },
    });

    const result = await generateGeminiImage({
      prompt: "nano banana lite test",
      output_path: outputPath,
      model: "gemini-3.1-flash-lite-image",
    });

    expect(result.ok).toBe(true);
    expect(request?.model).toBe("gemini-3.1-flash-lite-image");
  });

  it("maps Grok Imagine 2.0 generation controls", async () => {
    const outputPath = tempPath("grok-2-output.jpg");
    let generateArgs: Record<string, unknown> | undefined;

    setClientsForTests({
      grok: {
        images: {
          editJson: async () => ({ data: [{ b64_json: "" }] }),
          generate: async (params) => {
            generateArgs = params as unknown as Record<string, unknown>;
            return { data: [{ b64_json: Buffer.from("grok-2").toString("base64") }] };
          },
        },
      },
    });

    const result = await generateGrokImage({
      prompt: "grok prompt",
      output_path: outputPath,
      model: "grok-imagine-image-2.0",
      aspect_ratio: "21:9",
      resolution: "2k",
      quality: "low",
    });

    expect(result.ok).toBe(true);
    expect(generateArgs?.model).toBe("grok-imagine-image-2.0");
    expect(generateArgs?.aspect_ratio).toBe("21:9");
    expect(generateArgs?.resolution).toBe("2k");
    expect(generateArgs?.quality).toBe("low");
    expect(generateArgs?.response_format).toBe("b64_json");
  });

  it("maps Grok edits to the required JSON data-URI request", async () => {
    const inputPath = tempPath("grok-edit-input.png");
    const outputPath = tempPath("grok-edit-output.jpg");
    await Bun.write(inputPath, new Uint8Array([1, 2, 3]));
    let editArgs: Record<string, unknown> | undefined;

    setClientsForTests({
      grok: {
        images: {
          editJson: async (params) => {
            editArgs = params as unknown as Record<string, unknown>;
            return { data: [{ b64_json: Buffer.from("grok-edit").toString("base64") }] };
          },
          generate: async () => ({ data: [{ b64_json: "" }] }),
        },
      },
    });

    const result = await generateGrokImage({
      prompt: "edit this",
      output_path: outputPath,
      model: "grok-imagine-image-2.0",
      input_images: [inputPath],
      aspect_ratio: "1:1",
      resolution: "1k",
      quality: "medium",
    });

    expect(result.ok).toBe(true);
    const image = editArgs?.image as { url?: string; type?: string } | undefined;
    expect(image?.type).toBe("image_url");
    expect(image?.url).toStartWith("data:image/png;base64,");
    expect(editArgs?.aspect_ratio).toBe("1:1");
    expect(editArgs?.resolution).toBe("1k");
    expect(editArgs?.quality).toBe("medium");
  });
});
