import type { ChatImageAttachmentDraft } from "@/shared/types/messages";
const EVENT = "berd:canvas-attach";
export interface CanvasAttachmentRequest {
  sessionId: string;
  attachment: ChatImageAttachmentDraft;
  prompt?: string;
}
export function attachCanvasToChat(request: CanvasAttachmentRequest) {
  window.dispatchEvent(
    new CustomEvent<CanvasAttachmentRequest>(EVENT, { detail: request }),
  );
}
export function onCanvasAttachment(
  listener: (request: CanvasAttachmentRequest) => void,
) {
  const receive = (event: Event) =>
    listener((event as CustomEvent<CanvasAttachmentRequest>).detail);
  window.addEventListener(EVENT, receive);
  return () => window.removeEventListener(EVENT, receive);
}
