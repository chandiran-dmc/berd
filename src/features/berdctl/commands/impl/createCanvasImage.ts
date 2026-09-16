import { z } from "zod/v4";
import { defineCommand } from "../types";
import {
  canvasTargetFields,
  coordinateField,
  dimensionField,
  resolveAndCallCanvasRuntime,
} from "./canvasCommandHelpers";

const schema = z
  .object({
    ...canvasTargetFields,
    src: z
      .string()
      .min(1)
      .max(15000000)
      .regex(/^data:image\/(png|jpeg|webp);base64,/)
      .optional()
      .describe("PNG, JPEG, or WebP data URL. Prefer path for local files."),
    path: z
      .string()
      .min(1)
      .max(4096)
      .optional()
      .describe("Local PNG, JPEG, or WebP file path to import persistently."),
    mime_type: z
      .enum(["image/png", "image/jpeg", "image/webp"])
      .optional()
      .describe("Image MIME type. Required with src and inferred for path."),
    name: z.string().min(1).max(500).describe("Image name shown in metadata."),
    x: coordinateField("Page x position."),
    y: coordinateField("Page y position."),
    width: dimensionField("Image width."),
    height: dimensionField("Image height."),
    file_size: z
      .number()
      .int()
      .nonnegative()
      .max(100000000)
      .optional()
      .describe("Image file size in bytes."),
    alt_text: z
      .string()
      .max(2000)
      .optional()
      .describe("Accessible image description."),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.src ? 1 : 0) + (value.path ? 1 : 0) !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of src or path.",
      });
    }
    if (value.src && !value.mime_type) {
      ctx.addIssue({
        code: "custom",
        message: "mime_type is required with src.",
      });
    }
  });

export const createCanvasImageCommand = defineCommand({
  effect: "create",
  visibility: "immediate",
  destructive: false,
  summary: "Place one visible image on the canvas",
  description: "Place an image on an open canvas within bounded dimensions.",
  helpFooter: `Example:\n  berdctl canvas image --session-id <session-id> --path /absolute/path/sketch.png --name sketch.png --x 100 --y 100 --width 320 --height 200\n\nResult:\n  {"action": "place-image"} — the image is copied into the board's persistent asset store and appears on the open canvas.`,
  schema,
  execute: async (args, ctx) => {
    let src = args.src;
    let mimeType = args.mime_type;
    if (args.path) {
      const { readImageAttachment } = await import("@/shared/api/system");
      const image = await readImageAttachment(args.path);
      src = `data:${image.mimeType};base64,${image.base64}`;
      mimeType = image.mimeType as typeof mimeType;
    }
    if (!src || !mimeType) throw new Error("Image source could not be read.");
    const { result } = await resolveAndCallCanvasRuntime(
      args,
      "place-image",
      {
        src,
        mimeType,
        name: args.name,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
        ...(args.file_size === undefined ? {} : { fileSize: args.file_size }),
        ...(args.alt_text === undefined ? {} : { altText: args.alt_text }),
      },
      ctx,
    );
    return result;
  },
});
