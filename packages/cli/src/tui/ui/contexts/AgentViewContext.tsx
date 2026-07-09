/**
 * AgentView context — Terminuz stub.
 *
 * Qwen Code's in-process agent tabs (arena / multi-agent view) are not part of
 * Terminuz's feature set. This stub keeps the ported components compiling and
 * renders them in single ("main") view; the roster is always empty.
 */

import type { ReactNode } from "react";

export interface AgentViewState {
  activeView: string;
  agents: ReadonlyMap<string, unknown>;
  agentShellFocused: boolean;
  agentTabBarFocused: boolean;
}

export interface AgentViewActions {
  setAgentTabBarFocused(focused: boolean): void;
  switchToMain(): void;
}

const STATE: AgentViewState = {
  activeView: "main",
  agents: new Map(),
  agentShellFocused: false,
  agentTabBarFocused: false,
};

const ACTIONS: AgentViewActions = {
  setAgentTabBarFocused: () => {},
  switchToMain: () => {},
};

export function useAgentViewState(): AgentViewState {
  return STATE;
}

export function useAgentViewActions(): AgentViewActions {
  return ACTIONS;
}

export function AgentViewProvider({ children }: { children: ReactNode }): ReactNode {
  return children;
}
