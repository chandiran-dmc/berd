import {
  getCanvasBoardIdentity,
  type CanvasScope,
} from "@/features/canvas/canvasIdentity";
import { CommandError } from "../types";

export async function resolveCanvasTarget(args: {
  session_id: string;
  project_id?: string;
  scope: CanvasScope;
}) {
  const [{ loadSessionForBerdctl, requireSession }, { findProjectOrThrow }] =
    await Promise.all([
      import("../runtime/sessions"),
      import("../runtime/projects"),
    ]);
  await loadSessionForBerdctl(args.session_id);
  const session = requireSession(args.session_id);
  if (args.scope === "project") {
    if (!args.project_id)
      throw new CommandError(
        "project_not_found",
        "project_id is required for a project canvas.",
      );
    await findProjectOrThrow(args.project_id);
    if (session.projectId !== args.project_id) {
      throw new CommandError(
        "project_not_found",
        `Session "${args.session_id}" is not attached to project "${args.project_id}".`,
      );
    }
  } else if (args.project_id && session.projectId !== args.project_id) {
    throw new CommandError(
      "project_not_found",
      `Session "${args.session_id}" is not attached to project "${args.project_id}".`,
    );
  }
  return getCanvasBoardIdentity({
    sessionId: session.id,
    projectId: args.project_id,
    scope: args.scope,
  });
}
