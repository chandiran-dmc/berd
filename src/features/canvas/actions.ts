import { z } from "zod/v4";

const coordinate = z.number().finite().min(-100_000).max(100_000);
const dimension = z.number().finite().min(8).max(20_000);
const shapeId = z.string().min(1).max(300);
const shapeIds = z.array(shapeId).min(1).max(100);
const point = z.object({ x: coordinate, y: coordinate }).strict();
const color = z.enum([
  "black",
  "grey",
  "light-violet",
  "violet",
  "blue",
  "light-blue",
  "yellow",
  "orange",
  "green",
  "light-green",
  "light-red",
  "red",
]);

export const canvasActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("agent-state"),
      mode: z.enum(["working", "reviewing"]).optional(),
      todo: z
        .object({
          id: z.string().min(1).max(64),
          title: z.string().min(1).max(500),
          status: z.enum(["open", "in-progress", "done"]),
          remove: z.boolean().optional(),
        })
        .strict()
        .optional(),
    })
    .strict()
    .refine((value) => value.mode !== undefined || value.todo !== undefined, {
      message: "Provide a mode or todo update",
    }),
  z
    .object({
      type: z.literal("draw"),
      points: z.array(point).min(2).max(500),
      color: color.optional(),
      fill: z.enum(["none", "semi", "solid", "pattern"]).default("none"),
      closed: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      type: z.literal("create-arrow"),
      startShapeId: shapeId,
      endShapeId: shapeId,
      text: z.string().max(20_000).optional(),
      color: color.optional(),
    })
    .strict(),
  z.object({ type: z.literal("delete"), shapeIds }).strict(),
  z.object({ type: z.literal("clear") }).strict(),
  z
    .object({
      type: z.literal("place-image"),
      src: z.string().min(1).max(15_000_000),
      mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
      name: z.string().min(1).max(500),
      x: coordinate,
      y: coordinate,
      width: dimension,
      height: dimension,
      fileSize: z.number().int().nonnegative().max(100_000_000).optional(),
      altText: z.string().max(2_000).optional(),
    })
    .strict(),
  z.object({ type: z.literal("group"), shapeIds: shapeIds.min(2) }).strict(),
  z.object({ type: z.literal("ungroup"), shapeIds }).strict(),
  z
    .object({
      type: z.literal("move"),
      shapeIds,
      deltaX: z.number().finite().min(-100_000).max(100_000),
      deltaY: z.number().finite().min(-100_000).max(100_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("resize"),
      shapeIds,
      scaleX: z.number().finite().min(0.01).max(100),
      scaleY: z.number().finite().min(0.01).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("rotate"),
      shapeIds,
      degrees: z.number().finite().min(-3600).max(3600),
      originX: coordinate.optional(),
      originY: coordinate.optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if ((value.originX === undefined) !== (value.originY === undefined))
        ctx.addIssue({
          code: "custom",
          message: "originX and originY must be supplied together",
        });
    }),
  z
    .object({
      type: z.literal("stack"),
      shapeIds: shapeIds.min(2),
      direction: z.enum(["horizontal", "vertical"]),
      gap: z.number().finite().min(0).max(20_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("align"),
      shapeIds: shapeIds.min(2),
      alignment: z.enum([
        "left",
        "right",
        "top",
        "bottom",
        "center-horizontal",
        "center-vertical",
        "center",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("distribute"),
      shapeIds: shapeIds.min(3),
      axis: z.enum(["horizontal", "vertical"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("reorder"),
      shapeIds,
      position: z.enum(["front", "back", "forward", "backward"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("viewport"),
      mode: z.enum(["fit", "selection", "shapes", "camera"]),
      shapeIds: shapeIds.optional(),
      x: coordinate.optional(),
      y: coordinate.optional(),
      zoom: z.number().finite().min(0.05).max(16).optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.mode === "shapes" && !value.shapeIds?.length)
        ctx.addIssue({
          code: "custom",
          message: "shapeIds are required for shapes viewport mode",
        });
      if (
        value.mode === "camera" &&
        (value.x === undefined ||
          value.y === undefined ||
          value.zoom === undefined)
      )
        ctx.addIssue({
          code: "custom",
          message: "x, y, and zoom are required for camera viewport mode",
        });
    }),
  z
    .object({
      type: z.literal("undo"),
      steps: z.number().int().min(1).max(20).default(1),
    })
    .strict(),
]);

export type CanvasAction = z.input<typeof canvasActionSchema>;
export type ParsedCanvasAction = z.output<typeof canvasActionSchema>;

export interface CanvasActionResult {
  boardId: string;
  action: ParsedCanvasAction["type"] | "create-shape" | "update-shape";
  affectedShapeIds: string[];
  message: string;
}

export const CANVAS_ACTION_EVENT = "creative-harness:canvas-action";

export function announceCanvasAction(result: CanvasActionResult): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CANVAS_ACTION_EVENT, { detail: result }),
    );
  }
}

export function onCanvasAction(
  listener: (result: CanvasActionResult) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) =>
    listener((event as CustomEvent<CanvasActionResult>).detail);
  window.addEventListener(CANVAS_ACTION_EVENT, handle);
  return () => window.removeEventListener(CANVAS_ACTION_EVENT, handle);
}
