import { describe, it, expect, vi } from "vitest";
import { PROVIDER_IDS } from "@deepcode/shared";
import type {
  CommandContext,
  SessionCommandServices,
  SessionCommandState,
} from "../../src/tui/ui/commands/types.js";
import {
  modeCommand,
  modelCommand,
  providerCommand,
} from "../../src/tui/ui/commands/sessionCommands.js";
import { clearCommand, helpCommand } from "../../src/tui/ui/commands/basicCommands.js";

function makeSession(initial: SessionCommandState) {
  let state = initial;
  const services: SessionCommandServices = {
    getState: () => state,
    setProvider: (provider) => {
      state = { ...state, provider };
    },
    setModel: (model) => {
      state = { ...state, model };
    },
    setMode: (mode) => {
      state = { ...state, mode };
    },
    listProviders: () => PROVIDER_IDS,
  };
  return { services, getState: () => state };
}

function makeContext(session: SessionCommandServices | null): CommandContext {
  return {
    executionMode: "interactive",
    services: { config: null, session },
    ui: {
      addItem: vi.fn(),
      clear: vi.fn(),
      setDebugMessage: vi.fn(),
      pendingItem: null,
      setPendingItem: vi.fn(),
      loadHistory: vi.fn(),
      toggleVimEnabled: vi.fn(async () => false),
      reloadCommands: vi.fn(),
    },
    session: { sessionShellAllowlist: new Set<string>() },
  };
}

const BASE_STATE: SessionCommandState = { provider: "anthropic", model: "x", mode: "build" };

describe("providerCommand", () => {
  it("opens the provider dialog when called with no args", () => {
    const session = makeSession({ ...BASE_STATE });
    const result = providerCommand.action!(makeContext(session.services), "");
    expect(result).toEqual({ type: "dialog", dialog: "provider" });
  });

  it("switches to a valid provider", () => {
    const session = makeSession({ ...BASE_STATE });
    const result = providerCommand.action!(makeContext(session.services), "openai");
    expect(session.getState().provider).toBe("openai");
    expect(result).toMatchObject({ messageType: "info" });
  });

  it("rejects an unknown provider", () => {
    const session = makeSession({ ...BASE_STATE });
    const result = providerCommand.action!(makeContext(session.services), "bogus");
    expect(result).toMatchObject({ type: "message", messageType: "error" });
    expect(session.getState().provider).toBe("anthropic");
  });

  it("errors when the session service is unavailable", () => {
    const result = providerCommand.action!(makeContext(null), "openai");
    expect(result).toMatchObject({ messageType: "error" });
  });
});

describe("modelCommand", () => {
  it("sets the model from the argument", () => {
    const session = makeSession({ ...BASE_STATE });
    modelCommand.action!(makeContext(session.services), "claude-opus-4-7");
    expect(session.getState().model).toBe("claude-opus-4-7");
  });

  it("opens the model dialog with no args", () => {
    const session = makeSession({ ...BASE_STATE });
    const result = modelCommand.action!(makeContext(session.services), "");
    expect(result).toMatchObject({ type: "dialog", dialog: "model" });
    expect(session.getState().model).toBe("x");
  });
});

describe("modeCommand", () => {
  it("switches to plan mode", () => {
    const session = makeSession({ ...BASE_STATE });
    modeCommand.action!(makeContext(session.services), "plan");
    expect(session.getState().mode).toBe("plan");
  });

  it("rejects an unknown mode and leaves the state unchanged", () => {
    const session = makeSession({ ...BASE_STATE });
    const result = modeCommand.action!(makeContext(session.services), "fly");
    expect(result).toMatchObject({ messageType: "error" });
    expect(session.getState().mode).toBe("build");
  });
});

describe("basicCommands", () => {
  it("clear invokes ui.clear", () => {
    const context = makeContext(null);
    clearCommand.action!(context, "");
    expect(context.ui.clear).toHaveBeenCalledOnce();
  });

  it("help opens the help dialog", () => {
    const result = helpCommand.action!(makeContext(null), "");
    expect(result).toEqual({ type: "dialog", dialog: "help" });
  });
});
