import { describe, expect, it } from "vitest";
import { getCanvasBoardIdentity } from "./canvasIdentity";

describe("getCanvasBoardIdentity", () => {
  it("uses the chat session as the private board owner", () => {
    expect(
      getCanvasBoardIdentity({
        scope: "chat",
        sessionId: " session/one ",
        projectId: "project-1",
      }),
    ).toEqual({
      boardId: "chat:session%2Fone",
      persistenceKey: "berd-canvas:v1:chat:session%2Fone",
      scope: "chat",
      sessionId: "session/one",
      projectId: "project-1",
    });
  });

  it("uses the project as the shared board owner", () => {
    expect(
      getCanvasBoardIdentity({
        scope: "project",
        sessionId: "session-1",
        projectId: " project/one ",
      }),
    ).toEqual({
      boardId: "project:project%2Fone",
      persistenceKey: "berd-canvas:v1:project:project%2Fone",
      scope: "project",
      sessionId: "session-1",
      projectId: "project/one",
    });
  });

  it("keeps chat and project persistence isolated", () => {
    const chat = getCanvasBoardIdentity({
      scope: "chat",
      sessionId: "same-id",
      projectId: "project-1",
    });
    const project = getCanvasBoardIdentity({
      scope: "project",
      sessionId: "same-id",
      projectId: "project-1",
    });

    expect(chat.persistenceKey).not.toBe(project.persistenceKey);
    expect(chat.boardId).not.toBe(project.boardId);
  });

  it.each([
    ["", "sessionId"],
    ["   ", "sessionId"],
  ])("rejects a missing chat session id (%s)", (sessionId, field) => {
    expect(() =>
      getCanvasBoardIdentity({
        scope: "chat",
        sessionId,
      }),
    ).toThrow(`${field} is required`);
  });

  it("rejects a project canvas without a project id", () => {
    expect(() =>
      getCanvasBoardIdentity({
        scope: "project",
        sessionId: "session-1",
      }),
    ).toThrow("projectId is required for a project canvas");

    expect(() =>
      getCanvasBoardIdentity({
        scope: "project",
        sessionId: "session-1",
        projectId: "   ",
      }),
    ).toThrow("projectId is required for a project canvas");
  });

  it("keeps an explicit default board on the original persistence key", () => {
    const implicit = getCanvasBoardIdentity({
      scope: "project",
      sessionId: "s",
      projectId: "p",
    });
    const explicit = getCanvasBoardIdentity({
      scope: "project",
      sessionId: "s",
      projectId: "p",
      boardId: implicit.boardId,
    });
    expect(explicit).toEqual(implicit);
  });

  it("rejects unsafe catalog board ids", () => {
    expect(() =>
      getCanvasBoardIdentity({
        scope: "chat",
        sessionId: "s",
        boardId: "../escape",
      }),
    ).toThrow(/unsupported/);
  });
});
