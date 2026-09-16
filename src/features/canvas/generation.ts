import { invoke } from "@tauri-apps/api/core";
import { z } from "zod/v4";

const publicReferenceSchema = z
  .object({
    base64: z.string().min(1).max(12_000_000),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  })
  .strict();

const requestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4_000),
    references: z.array(publicReferenceSchema).max(4).default([]),
    count: z.number().int().min(1).max(4),
  })
  .strict();

const statusSchema = z.object({
  configured: z.boolean(),
  provider: z.literal("OpenAI"),
  model: z.literal("gpt-image-2"),
  supportsReferences: z.boolean(),
});

const responseSchema = z.object({
  images: z
    .array(
      z.object({
        data: z.string().min(1),
        mimeType: z.literal("image/png"),
      }),
    )
    .min(1)
    .max(4),
  model: z.literal("gpt-image-2"),
});

export type CanvasGenerationRequest = z.input<typeof requestSchema>;
export type CanvasGenerationStatus = z.output<typeof statusSchema>;
export interface GeneratedCanvasImage {
  base64: string;
  mimeType: "image/png";
}

export async function getCanvasGenerationStatus(): Promise<CanvasGenerationStatus> {
  return statusSchema.parse(
    await invoke<unknown>("get_canvas_generation_status"),
  );
}

export async function generateCanvasImages(
  input: CanvasGenerationRequest,
): Promise<GeneratedCanvasImage[]> {
  const request = requestSchema.parse(input);
  const response = responseSchema.parse(
    await invoke<unknown>("generate_canvas_images", {
      request: {
        prompt: request.prompt,
        count: request.count,
        references: request.references.map((reference, index) => ({
          data: reference.base64,
          mimeType: reference.mimeType,
          name: `reference-${index + 1}.${reference.mimeType.split("/")[1]}`,
        })),
      },
    }),
  );
  return response.images.map((image) => ({
    base64: image.data,
    mimeType: image.mimeType,
  }));
}
