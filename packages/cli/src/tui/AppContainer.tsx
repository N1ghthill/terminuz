import fs from "node:fs";
import path from "node:path";
import React, { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdin, type DOMElement } from "ink";
import {
  ConfigLoader,
  runToolEffect,
  type ApprovalRequest,
  type ProviderValidationResult,
  type TaskPlan,
} from "@deepcode/core";
import { createRuntime, type DeepCodeRuntime } from "../runtime.js";
import {
  PROVIDER_IDS,
  ProviderIdSchema,
  createId,
  resolveConfiguredModelForProvider,
  type AgentMode,
  type DeepCodeConfig,
  type ProviderId,
  type Session,
  type ToolCall,
} from "@deepcode/shared";
import type { Config } from "@deepcode/tui-shim";
import { ApprovalMode } from "@deepcode/tui-shim";
import { useHistory } from "./ui/hooks/useHistoryManager.js";
import {
  ToolCallStatus,
  StreamingState,
  type HistoryItem,
  type HistoryItemWithoutId,
  type IndividualToolCallDisplay,
} from "./ui/types.js";
import { MainContent } from "./ui/components/MainContent.js";
import { Composer } from "./ui/components/Composer.js";
import { useTextBuffer } from "./ui/components/shared/text-buffer.js";
import { calculatePromptWidths } from "./ui/utils/layoutUtils.js";
import { formatTokenCount } from "./ui/utils/formatters.js";
import { ConfigContext } from "./ui/contexts/ConfigContext.js";
import { SettingsContext } from "./ui/contexts/SettingsContext.js";
import { CompactModeProvider } from "./ui/contexts/CompactModeContext.js";
import { StreamingContext } from "./ui/contexts/StreamingContext.js";
import { VimModeProvider } from "./ui/contexts/VimModeContext.js";
import { KeypressProvider } from "./ui/contexts/KeypressContext.js";
import { ShellFocusContext } from "./ui/contexts/ShellFocusContext.js";
import { UIStateContext, type UIState } from "./ui/contexts/UIStateContext.js";
import { UIActionsContext, type UIActions } from "./ui/contexts/UIActionsContext.js";
import { AgentViewProvider } from "./ui/contexts/AgentViewContext.js";
import { BackgroundTaskViewProvider } from "./ui/contexts/BackgroundTaskViewContext.js";
import { useTerminalSize } from "./ui/hooks/useTerminalSize.js";
import { theme } from "./ui/semantic-colors.js";
import type { LoadedSettings } from "./config/settings.js";
import type {
  CommandContext,
  DialogType,
  SlashCommand,
  SlashCommandActionReturn,
} from "./ui/commands/types.js";
import type {
  RecentSlashCommand,
  RecentSlashCommands,
} from "./ui/hooks/useSlashCompletion.js";
import { diffCommand } from "./ui/commands/diffCommand.js";
import { clearCommand, compactCommand, helpCommand, undoCommand } from "./ui/commands/basicCommands.js";
import { updateCommand } from "./ui/commands/updateCommand.js";
import {
  modeCommand,
  modelCommand,
  providerCommand,
  renameCommand,
} from "./ui/commands/sessionCommands.js";
import {
  authDialogCommand,
  feedbackDialogCommand,
  permissionsDialogCommand,
  sessionsDialogCommand,
  settingsDialogCommand,
  themeDialogCommand,
} from "./ui/commands/dialogCommands.js";
import { CommandDialog } from "./ui/components/CommandDialog.js";
import { ThemeDialog } from "./ui/components/ThemeDialog.js";
import {
  ProviderDialog,
  type ProviderTestResult,
} from "./ui/components/ProviderDialog.js";
import {
  PermissionsDialog,
  type PermissionModes,
} from "./ui/components/PermissionsDialog.js";
import { AuthDialog } from "./ui/components/AuthDialog.js";
import { ModelDialog } from "./ui/components/ModelDialog.js";
import { FeedbackDialog } from "./ui/FeedbackDialog.js";
import { SessionsDialog } from "./ui/components/SessionsDialog.js";
import { SubagentsPanel } from "./ui/components/SubagentsPanel.js";
import { themeManager } from "./ui/themes/theme-manager.js";
import {
  mapMessagesToHistoryItems,
  reduceToolActivity,
  resolveSlashInvocation,
  restoreHistoryFromSession,
  toToolCallDisplay,
} from "./bridge.js";
import { buildSummaryMessage, generateCompactSummary } from "./compact-summary.js";
import { generateSessionName } from "./session-name.js";
import { resolveSessionTarget } from "../target-resolution.js";
import { generateFollowupSuggestion } from "./followup-suggestion.js";
import { checkForUpdate, isNewer } from "../update-checker.js";
import { VERSION } from "../version.js";

function formatModelCatalogSummary(
  result: Pick<ProviderValidationResult, "modelCatalogStatus" | "modelCount">,
): string {
  if (result.modelCatalogStatus === "checked") {
    return `${result.modelCount} models visible`;
  }
  if (result.modelCatalogStatus === "skipped") {
    return "model catalog skipped";
  }
  return "model catalog unavailable";
}

export interface AppContainerProps {
  cwd: string;
  config?: string;
  provider?: string;
  model?: string;
  resumeSessionId?: string;
}

type TargetSource = "config" | "cli" | "session";

const APPROVAL_ENTER_ARM_DELAY_MS = 350;

export const AppContainer = ({ cwd, config, provider, model, resumeSessionId }: AppContainerProps) => {
  const historyManager = useHistory();
  const addHistoryItem = historyManager.addItem;
  const [initError, setInitError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [pendingAssistantText, setPendingAssistantText] = useState("");
  const [approvalQueue, setApprovalQueue] = useState<ApprovalRequest[]>([]);
  const [providerLabel, setProviderLabel] = useState<string>("(unconfigured)");
  const [targetSource, setTargetSource] = useState<TargetSource>("config");
  const [currentModel, setCurrentModel] = useState<string>("(unconfigured)");
  const [agentMode, setAgentMode] = useState<AgentMode>("build");
  const [streamingState, setStreamingState] = useState<StreamingState>(StreamingState.Idle);
  const [compactMode, setCompactMode] = useState(false);
  const [shellModeActive, setShellModeActive] = useState(false);
  const [showEscapePrompt, setShowEscapePrompt] = useState(false);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [historyRemountKey, setHistoryRemountKey] = useState(0);
  const [pendingItem, setPendingItem] = useState<HistoryItemWithoutId | null>(null);
  const [lastPromptTokenCount, setLastPromptTokenCount] = useState(0);
  const [lastOutputTokenCount, setLastOutputTokenCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isReceivingContent, setIsReceivingContent] = useState(false);
  const [iterationInfo, setIterationInfo] = useState<{ round: number; max: number } | null>(null);
  const [liveToolCalls, setLiveToolCalls] = useState<IndividualToolCallDisplay[]>([]);
  const [taskPlan, setTaskPlan] = useState<TaskPlan | null>(null);
  const [taskStreams, setTaskStreams] = useState<Record<string, string>>({});
  const [recentSlashCommandsState, setRecentSlashCommandsState] = useState<
    Map<string, RecentSlashCommand>
  >(new Map());
  const [activeDialog, setActiveDialog] = useState<DialogType | null>(null);
  const [themeName, setThemeName] = useState<string>("(unknown)");
  const [permissionSummary, setPermissionSummary] = useState<string>("(unknown)");
  const [authSummary, setAuthSummary] = useState<string>("(unknown)");
  const [permissionModes, setPermissionModes] = useState<PermissionModes>({
    read: "allow",
    write: "ask",
    gitLocal: "allow",
    shell: "ask",
    dangerous: "ask",
  });
  const [providerConfigVersion, setProviderConfigVersion] = useState(0);
  const [, setThemeVersion] = useState(0);
  const [mcpConnected, setMcpConnected] = useState(0);
  const [mcpTotal, setMcpTotal] = useState(0);
  const [subagentMap, setSubagentMap] = useState<Map<string, import("./ui/contexts/UIStateContext.js").SubagentEntry>>(new Map());
  const [, setDrainTick] = useState(0);
  const [pendingCommandConfirmation, setPendingCommandConfirmation] = useState<{
    rawInvocation: string;
    promptLines: string[];
  } | null>(null);

  const runtimeRef = useRef<DeepCodeRuntime | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const configAdapterRef = useRef<DeepCodeConfigAdapter | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const unsubscribeRef = useRef<Array<() => void>>([]);
  const lastSubmittedPromptRef = useRef<string | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const streamingResponseLengthRef = useRef(0);
  const pendingTextBufferRef = useRef('');
  const taskStreamsBufferRef = useRef<Record<string, string>>({});
  const drainingQueueRef = useRef(false);
  const messageQueueRef = useRef<string[]>([]);
  const sessionShellAllowlistRef = useRef<Set<string>>(new Set());
  const mainControlsRef = useRef<DOMElement | null>(null);
  const approvalPromptVisibleAtRef = useRef<number | null>(null);

  const { stdin, setRawMode } = useStdin();
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const mainAreaWidth = Math.min(Math.max(terminalWidth - 4, 20), 120);
  const promptWidths = useMemo(
    () => calculatePromptWidths(terminalWidth),
    [terminalWidth],
  );
  const bufferViewportHeight = Math.max(3, Math.min(8, terminalHeight - 10));

  const loadedSettings = useMemo<LoadedSettings>(
    () => ({
      merged: {
        general: { vimMode: false },
        ui: { shellOutputMaxLines: 5, showLineNumbers: false },
      },
      setValue: () => {},
    }),
    [],
  );

  const configAdapter = configAdapterRef.current ?? new DeepCodeConfigAdapter(cwd);

  const isValidPath = useCallback(
    (candidate: string): boolean => {
      const resolved = path.resolve(cwd, candidate);
      const relative = path.relative(cwd, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return false;
      }
      return fs.existsSync(resolved);
    },
    [cwd],
  );

  const buffer = useTextBuffer({
    viewport: { width: promptWidths.inputWidth, height: bufferViewportHeight },
    stdin,
    setRawMode,
    isValidPath,
    shellModeActive,
  });

  const pendingGeminiHistoryItems = useMemo<HistoryItemWithoutId[]>(
    () => (pendingAssistantText
      ? [{ type: "gemini", text: pendingAssistantText }]
      : []),
    [pendingAssistantText],
  );

  const userMessages = useMemo(
    () =>
      historyManager.history
        .filter((item): item is Extract<HistoryItem, { type: "user" }> => item.type === "user")
        .map((item) => item.text),
    [historyManager.history],
  );

  const slashCommands = useMemo<readonly SlashCommand[]>(
    () => [
      helpCommand,
      clearCommand,
      undoCommand,
      compactCommand,
      diffCommand,
      providerCommand,
      modelCommand,
      modeCommand,
      renameCommand,
      updateCommand,
      settingsDialogCommand,
      themeDialogCommand,
      permissionsDialogCommand,
      authDialogCommand,
      feedbackDialogCommand,
      sessionsDialogCommand,
    ],
    [],
  );
  const recentSlashCommands = useMemo<RecentSlashCommands>(
    () => recentSlashCommandsState,
    [recentSlashCommandsState],
  );
  const [promptSuggestion, setPromptSuggestion] = useState<string | null>(null);
  const dismissPromptSuggestion = useCallback(() => setPromptSuggestion(null), []);
  const registerSlashCommandUsage = useCallback((name: string) => {
    setRecentSlashCommandsState((prev) => {
      const next = new Map(prev);
      const existing = next.get(name);
      next.set(name, {
        name,
        usedAt: Date.now(),
        count: (existing?.count ?? 0) + 1,
      });
      return next;
    });
  }, []);

  const listAvailableProviders = useCallback((): readonly ProviderId[] => PROVIDER_IDS, []);

  const getSessionCommandState = useCallback(() => {
    const runtime = runtimeRef.current;
    const session = sessionRef.current;
    const fallbackProvider = runtime?.config.defaultProvider ?? PROVIDER_IDS[0];
    const provider = session?.provider ?? fallbackProvider;
    const model = session?.model ?? (
      runtime
        ? resolveConfiguredModelForProvider(runtime.config, provider)
        : undefined
    );
    return {
      provider,
      model,
      mode: agentMode,
    };
  }, [agentMode]);

  const setSessionProvider = useCallback((provider: ProviderId) => {
    const runtime = runtimeRef.current;
    const session = sessionRef.current;
    if (!runtime || !session) return;

    session.provider = provider;
    session.model = resolveConfiguredModelForProvider(runtime.config, provider);
    session.metadata = { ...session.metadata, providerPinned: true };
    runtime.sessions.save(session);
    writeSavedProvider(cwd, provider, session.model);
    setTargetSource("session");
    setCurrentModel(session.model ?? "(unconfigured)");
    setProviderLabel(formatProviderLabel(session.provider, session.model));
    if (!session.model) {
      historyManager.addItem(
        {
          type: "warning",
          text: `Provider changed to ${provider}, but no model is configured. Run /model or set defaultModels.${provider}.`,
        },
        Date.now(),
      );
    }
  }, [cwd, historyManager]);

  const setSessionModel = useCallback((model: string) => {
    const runtime = runtimeRef.current;
    const session = sessionRef.current;
    if (!runtime || !session) return;

    const normalized = model.trim();
    session.model = normalized.length > 0 ? normalized : undefined;
    session.metadata = { ...session.metadata, providerPinned: true };
    runtime.sessions.save(session);
    writeSavedProvider(cwd, session.provider, session.model);
    setTargetSource("session");
    setCurrentModel(session.model ?? "(unconfigured)");
    setProviderLabel(formatProviderLabel(session.provider, session.model));
  }, [cwd]);

  const setSessionMode = useCallback((mode: AgentMode) => {
    setAgentMode(mode);
    const runtime = runtimeRef.current;
    const session = sessionRef.current;
    if (runtime && session) {
      session.metadata = { ...session.metadata, agentMode: mode };
      runtime.sessions.save(session);
      runtime.sessions.persist(session.id).catch(() => {});
    }
  }, []);

  const setSessionName = useCallback((name: string) => {
    const runtime = runtimeRef.current;
    const session = sessionRef.current;
    if (!runtime || !session) return;
    session.metadata = { ...session.metadata, name: name.trim() };
    runtime.sessions.save(session);
    runtime.sessions.persist(session.id).catch(() => {});
  }, []);

  const sessionCommandServices = useMemo(
    () => ({
      getState: getSessionCommandState,
      setProvider: setSessionProvider,
      setModel: setSessionModel,
      setMode: setSessionMode,
      setName: setSessionName,
      listProviders: listAvailableProviders,
    }),
    [
      getSessionCommandState,
      listAvailableProviders,
      setSessionModel,
      setSessionMode,
      setSessionName,
      setSessionProvider,
    ],
  );

  const handleUndo = useCallback(async () => {
    const runtime = runtimeRef.current;
    const session = sessionRef.current;
    if (!runtime || !session) return null;
    return runtime.agent.undo(session.id);
  }, []);

  const handleCompact = useCallback(async () => {
    const runtime = runtimeRef.current;
    const session = sessionRef.current;
    if (!runtime || !session) return;

    if (session.messages.length === 0) {
      addHistoryItem({ type: "info", text: "Nothing to compact — conversation is empty." }, Date.now());
      return;
    }

    setIsRunning(true);
    try {
      const summary = await generateCompactSummary(runtime, session, undefined);
      if (!summary) {
        addHistoryItem({ type: "warning", text: "Compaction failed: could not generate summary." }, Date.now());
        return;
      }
      // Replace session messages with a single summary message.
      const summaryMsg = buildSummaryMessage(summary);
      runtime.sessions.replaceMessages(session.id, [summaryMsg]);
      await runtime.sessions.persist(session.id).catch(() => {});

      // Replace TUI history with just the summary.
      historyManager.clearItems();
      setHistoryRemountKey((k) => k + 1);
      addHistoryItem({ type: "info", text: "Conversation compacted." }, Date.now());
      addHistoryItem({ type: "gemini", text: summary }, Date.now());
    } catch {
      addHistoryItem({ type: "error", text: "Compaction failed." }, Date.now());
    } finally {
      setIsRunning(false);
    }
  }, [addHistoryItem, historyManager]);

  const commandContext = useMemo<CommandContext>(
    () => ({
      executionMode: "interactive",
      services: {
        config: configAdapter,
        session: sessionCommandServices,
      },
      ui: {
        addItem: historyManager.addItem,
        clear: historyManager.clearItems,
        setDebugMessage: (message: string) => {
          historyManager.addItem({ type: "info", text: message }, Date.now());
        },
        pendingItem,
        setPendingItem,
        loadHistory: historyManager.loadHistory,
        toggleVimEnabled: async () => false,
        reloadCommands: () => {},
        undo: handleUndo,
        compact: handleCompact,
      },
      session: {
        sessionShellAllowlist: sessionShellAllowlistRef.current,
      },
    }),
    [configAdapter, handleCompact, handleUndo, historyManager, pendingItem, sessionCommandServices],
  );

  useEffect(() => {
    messageQueueRef.current = messageQueue;
  }, [messageQueue]);

  useEffect(() => {
    if (approvalQueue.length > 0) {
      approvalPromptVisibleAtRef.current ??= Date.now();
      setStreamingState(StreamingState.WaitingForConfirmation);
      return;
    }
    approvalPromptVisibleAtRef.current = null;
    if (isRunning) {
      setStreamingState(StreamingState.Responding);
      return;
    }
    setStreamingState(StreamingState.Idle);
  }, [approvalQueue.length, isRunning]);

  useEffect(() => {
    if (!isRunning) {
      runStartedAtRef.current = null;
      setElapsedTime(0);
      setIsReceivingContent(false);
      return;
    }

    runStartedAtRef.current = Date.now();
    setElapsedTime(0);
    const interval = setInterval(() => {
      if (!runStartedAtRef.current) return;
      const seconds = Math.floor((Date.now() - runStartedAtRef.current) / 1000);
      setElapsedTime(seconds);
    }, 250);

    return () => clearInterval(interval);
  }, [isRunning]);

  // Throttle streaming re-renders: batch token chunks and flush at ~20fps
  // instead of calling setState on every individual token.
  useEffect(() => {
    const id = setInterval(() => {
      const text = pendingTextBufferRef.current;
      if (text) {
        pendingTextBufferRef.current = '';
        setPendingAssistantText((prev) => prev + text);
      }
      const taskBuf = taskStreamsBufferRef.current;
      const taskKeys = Object.keys(taskBuf);
      if (taskKeys.length > 0) {
        taskStreamsBufferRef.current = {};
        setTaskStreams((prev) => {
          const next = { ...prev };
          for (const taskId of taskKeys) {
            next[taskId] = (next[taskId] ?? '') + taskBuf[taskId];
          }
          return next;
        });
      }
    }, 50);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const runtime = await createRuntime({
          cwd,
          configPath: config,
          interactive: true,
        });
        if (!mounted) return;

        const savedProvider = !provider && !model ? readSavedProvider(cwd) : null;
        const target = resolveSessionTarget(runtime.config, {
          provider: provider ?? savedProvider?.provider,
          model: model ?? savedProvider?.model,
        });
        let session: Session;
        let resumed = false;

        if (resumeSessionId) {
          const allSessions = await runtime.sessions.loadAll();
          const existing = allSessions.find(
            (s) => s.id === resumeSessionId && s.worktree === cwd,
          );
          if (existing) {
            session = existing;
            // CLI flags override the persisted provider/model when supplied.
            if (provider) session.provider = target.provider;
            if (model) session.model = target.model;
            if (provider || model) {
              session.metadata = { ...session.metadata, providerPinned: true };
            }
            runtime.sessions.save(session);
            resumed = true;
          } else {
            session = runtime.sessions.create(target);
            if (provider || model || savedProvider) {
              session.metadata = { ...session.metadata, providerPinned: true };
              runtime.sessions.save(session);
            }
            addHistoryItem(
              { type: "warning", text: `Session ${resumeSessionId} not found; starting new session.` },
              Date.now(),
            );
          }
        } else {
          session = runtime.sessions.create(target);
          if (provider || model || savedProvider) {
            session.metadata = { ...session.metadata, providerPinned: true };
            runtime.sessions.save(session);
          }
        }

        runtimeRef.current = runtime;
        sessionRef.current = session;
        configAdapterRef.current = new DeepCodeConfigAdapter(cwd);
        setCompactMode(runtime.config.tui.compactMode);
        const savedTheme = readSavedTheme(cwd) ?? runtime.config.tui.theme;
        themeManager.setActiveTheme(savedTheme);
        setThemeName(themeManager.getActiveTheme().name);
        setThemeVersion((version) => version + 1);
        setPermissionSummary(formatPermissionSummary(runtime.config.permissions));
        setPermissionModes({
          read: runtime.config.permissions.read,
          write: runtime.config.permissions.write,
          gitLocal: runtime.config.permissions.gitLocal,
          shell: runtime.config.permissions.shell,
          dangerous: runtime.config.permissions.dangerous,
        });
        setAuthSummary(formatAuthSummary(runtime.config.github));
        const persistedMode = typeof session.metadata.agentMode === "string"
          && (session.metadata.agentMode === "build" || session.metadata.agentMode === "plan")
          ? session.metadata.agentMode as AgentMode
          : runtime.config.agentMode;
        setAgentMode(persistedMode);
        setTargetSource(provider || model ? "cli" : savedProvider ? "session" : "config");
        setCurrentModel(session.model ?? "(unconfigured)");
        setProviderLabel(formatProviderLabel(session.provider, session.model));
        setMcpConnected(runtime.mcp.connectedCount);
        setMcpTotal(runtime.config.mcpServers.length);

        const unsubscribers: Array<() => void> = [];
        unsubscribers.push(
          runtime.events.on("approval:request", (request) => {
            setApprovalQueue((prev) => [...prev, request]);
          }),
        );
        unsubscribers.push(
          runtime.events.on("app:warn", (payload) => {
            addHistoryItem({ type: "warning", text: payload.message }, Date.now());
          }),
        );
        unsubscribers.push(
          runtime.events.on("app:error", (payload) => {
            // Tool failures already surface in their tool group (Error
            // status) — skip the redundant standalone error line for those.
            if (payload.context?.tool) return;
            addHistoryItem(
              { type: "error", text: payload.error.message || "Unknown runtime error" },
              Date.now(),
            );
          }),
        );
        unsubscribers.push(
          runtime.events.on("budget:warning", (payload) => {
            addHistoryItem(
              {
                type: "warning",
                text: `Budget warning (${payload.kind}): ${formatNumber(payload.used)} / ${formatNumber(payload.limit)}`,
              },
              Date.now(),
            );
          }),
        );
        unsubscribers.push(
          runtime.events.on("budget:exceeded", (payload) => {
            addHistoryItem(
              {
                type: "error",
                text: `Budget exceeded (${payload.kind}): ${formatNumber(payload.used)} / ${formatNumber(payload.limit)}`,
              },
              Date.now(),
            );
          }),
        );
        unsubscribers.push(
          runtime.events.on("activity", (activity) => {
            setLiveToolCalls((prev) => reduceToolActivity(prev, activity));
          }),
        );
        unsubscribers.push(
          runtime.events.on("subagent:start", ({ taskId, prompt }) => {
            setSubagentMap((prev) => {
              const next = new Map(prev);
              next.set(taskId, {
                taskId,
                prompt: prompt.slice(0, 50),
                status: "running",
                startedAt: Date.now(),
              });
              return next;
            });
          }),
        );
        unsubscribers.push(
          runtime.events.on("subagent:chunk", ({ taskId, text }) => {
            setSubagentMap((prev) => {
              const entry = prev.get(taskId);
              if (!entry) return prev;
              const next = new Map(prev);
              const combined = ((entry.currentOutput ?? "") + text).slice(-80);
              next.set(taskId, { ...entry, currentOutput: combined });
              return next;
            });
          }),
        );
        unsubscribers.push(
          runtime.events.on("subagent:tool", ({ taskId, toolName, active }) => {
            setSubagentMap((prev) => {
              const entry = prev.get(taskId);
              if (!entry) return prev;
              const next = new Map(prev);
              next.set(taskId, { ...entry, currentTool: active ? toolName : undefined });
              return next;
            });
          }),
        );
        unsubscribers.push(
          runtime.events.on("subagent:complete", ({ taskId, error }) => {
            setSubagentMap((prev) => {
              const entry = prev.get(taskId);
              if (!entry) return prev;
              const next = new Map(prev);
              next.set(taskId, { ...entry, status: error ? "failed" : "done", currentTool: undefined, error });
              // Remove após 3 s para dar feedback visual de conclusão
              setTimeout(() => {
                setSubagentMap((m) => {
                  const updated = new Map(m);
                  updated.delete(taskId);
                  return updated;
                });
              }, 3000);
              return next;
            });
          }),
        );
        unsubscribeRef.current = unsubscribers;

        if (resumed) {
          restoreHistoryFromSession(session, (item) => addHistoryItem(item, Date.now()));
          addHistoryItem(
            {
              type: "info",
              text: `Session ${session.id.slice(-8)} resumed (${session.messages.length} messages).`,
            },
            Date.now(),
          );
        } else {
          addHistoryItem(
            {
              type: "info",
              text: `DeepCode runtime initialized on ${cwd}.`,
            },
            Date.now(),
          );
        }
        setIsInitializing(false);
        checkForUpdate(VERSION)
          .then((update) => {
            if (!mounted || !update) return;

            const available: string[] = [];
            if (isNewer(VERSION, update.latest)) {
              available.push(`latest v${update.latest}`);
            }
            if (update.stable && isNewer(VERSION, update.stable)) {
              available.push(`stable v${update.stable}`);
            }
            if (available.length === 0) return;

            addHistoryItem(
              {
                type: "info",
                text: `Update available: ${available.join(", ")}. Run /update for install commands.`,
              },
              Date.now(),
            );
          })
          .catch(() => {});
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : String(error);
        setInitError(message);
        setIsInitializing(false);
      }
    };

    void initialize();

    return () => {
      mounted = false;
      abortRef.current?.abort();
      abortRef.current = null;
      for (const unsubscribe of unsubscribeRef.current) {
        unsubscribe();
      }
      unsubscribeRef.current = [];
    };
  }, [addHistoryItem, config, cwd, model, provider, resumeSessionId]);

  const resolveApproval = useCallback(
    (decision: { allowed: boolean; scope?: "once" | "session" | "always"; reason?: string }) => {
      const runtime = runtimeRef.current;
      const current = approvalQueue[0];
      if (!runtime || !current) return;

      runtime.events.emit("approval:decision", {
        requestId: current.id,
        decision,
      });
      setApprovalQueue((prev) => prev.slice(1));
    },
    [approvalQueue],
  );

  const appendTurnItems = useCallback(
    (items: HistoryItemWithoutId[]) => {
      const base = Date.now();
      for (const item of items) {
        historyManager.addItem(item, base);
      }
    },
    [historyManager],
  );

  const runPrompt = useCallback(
    async (rawPrompt: string) => {
      const runtime = runtimeRef.current;
      const session = sessionRef.current;
      if (!runtime || !session) return;

      const prompt = rawPrompt.trim();
      if (!prompt) return;

      historyManager.addItem({ type: "user", text: prompt }, Date.now());
      lastSubmittedPromptRef.current = prompt;
      setPromptSuggestion(null);
      pendingTextBufferRef.current = '';
      taskStreamsBufferRef.current = {};
      setPendingAssistantText("");
      setIsRunning(true);
      setIsReceivingContent(false);
      streamingResponseLengthRef.current = 0;
      setLiveToolCalls([]);
      setTaskPlan(null);
      setTaskStreams({});
      setIterationInfo(null);

      const startIndex = session.messages.length;
      const isFirstTurn = startIndex === 0;
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const output = await runtime.agent.run({
          session,
          input: prompt,
          mode: agentMode,
          signal: controller.signal,
          onChunk: (text: string) => {
            streamingResponseLengthRef.current += text.length;
            pendingTextBufferRef.current += text;
            setIsReceivingContent(true);
          },
          onChunkForTask: (taskId: string, text: string) => {
            streamingResponseLengthRef.current += text.length;
            taskStreamsBufferRef.current[taskId] = (taskStreamsBufferRef.current[taskId] ?? '') + text;
            setIsReceivingContent(true);
          },
          onUsage: (inputTokens: number, outputTokens: number) => {
            setLastPromptTokenCount(inputTokens);
            setLastOutputTokenCount(outputTokens);
          },
          onIteration: (round: number, max: number) => {
            setIterationInfo({ round, max });
          },
          onTaskUpdate: (_task, plan) => {
            setTaskPlan({
              objective: plan.objective,
              tasks: plan.tasks.map((task) => ({ ...task })),
              currentTaskId: plan.currentTaskId,
              raw: plan.raw,
            });
          },
        });

        const newMessages = session.messages.slice(startIndex);
        const turnItems = mapMessagesToHistoryItems(newMessages);
        if (
          !turnItems.some((item) => item.type === "gemini")
          && output.trim().length > 0
        ) {
          turnItems.push({ type: "gemini", text: output.trim() });
        }
        appendTurnItems(turnItems);

        // Generate follow-up suggestions only for turns that actually used the model.
        const rt = runtimeRef.current;
        const sess = sessionRef.current;
        const usedLlm = sess?.metadata["lastTurnUsedLlm"] === true;
        if (rt && sess && usedLlm && output.trim()) {
          generateFollowupSuggestion(rt, sess, output, controller.signal)
            .then((s) => { if (s) setPromptSuggestion(s); })
            .catch(() => {});
        }
        // Name generation also uses the model, so keep local-only turns at zero tokens.
        if (rt && sess && usedLlm && isFirstTurn && !sess.metadata["name"]) {
          generateSessionName(rt, sess, controller.signal)
            .then((name) => {
              if (name) {
                sess.metadata["name"] = name;
                rt.sessions.save(sess);
                rt.sessions.persist(sess.id).catch(() => {});
              }
            })
            .catch(() => {});
        }
      } catch (error) {
        const aborted = controller.signal.aborted;
        // Render whatever the agent committed before the abort/error so the
        // partial turn is not lost — only the warning would otherwise show.
        const partialMessages = session.messages.slice(startIndex);
        appendTurnItems(mapMessagesToHistoryItems(partialMessages, { aborted }));
        const message = aborted
          ? "Execution cancelled."
          : (error instanceof Error ? error.message : String(error));
        historyManager.addItem(
          { type: aborted ? "warning" : "error", text: message },
          Date.now(),
        );
      } finally {
        abortRef.current = null;
        pendingTextBufferRef.current = '';
        taskStreamsBufferRef.current = {};
        setPendingAssistantText("");
        setIsRunning(false);
        setLiveToolCalls([]);
        setTaskPlan(null);
        setTaskStreams({});
        setIterationInfo(null);
        // Reflect the actual provider/model used (agent may have fallen back).
        const sess = sessionRef.current;
        if (sess) {
          setProviderLabel(formatProviderLabel(sess.provider, sess.model));
          setCurrentModel(sess.model ?? "(unconfigured)");
        }
        // Persist session after every turn (success, abort, and error paths).
        const rt = runtimeRef.current;
        if (rt && sess) {
          rt.sessions.persist(sess.id).catch(() => {});
        }
      }
    },
    [agentMode, appendTurnItems, historyManager],
  );

  const executeClientToolCommand = useCallback(
    async (toolName: string, toolArgs: Record<string, unknown>) => {
      const runtime = runtimeRef.current;
      const session = sessionRef.current;
      if (!runtime || !session) {
        historyManager.addItem(
          { type: "error", text: "Runtime is not ready to execute tool commands." },
          Date.now(),
        );
        return;
      }

      const tool = runtime.tools.get(toolName);
      if (!tool) {
        const available = runtime.tools.list().map((entry) => entry.name).join(", ");
        historyManager.addItem(
          {
            type: "error",
            text: `Unknown tool: ${toolName}${available ? ` (available: ${available})` : ""}`,
          },
          Date.now(),
        );
        return;
      }

      const parsed = tool.parameters.safeParse(toolArgs);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ");
        historyManager.addItem(
          {
            type: "error",
            text: `Invalid arguments for tool '${toolName}': ${issues}`,
          },
          Date.now(),
        );
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setIsRunning(true);
      setIsReceivingContent(false);
      setLiveToolCalls([]);

      const callId = createId("toolcall");
      const toolCall: ToolCall = {
        id: callId,
        name: toolName,
        arguments: toolArgs,
      };

      let status = ToolCallStatus.Success;
      let resultDisplay = "(no output)";

      try {
        const pathSecurity = runtime.pathSecurity.forWorktree(session.worktree);
        const permissions = runtime.permissions.forPathSecurity(pathSecurity);
        const result = await runToolEffect(
          tool.execute(parsed.data, {
            sessionId: session.id,
            messageId: createId("msg"),
            worktree: session.worktree,
            directory: session.worktree,
            abortSignal: controller.signal,
            config: runtime.config,
            agentMode,
            cache: runtime.cache,
            permissions,
            pathSecurity,
            logActivity: (activity) => {
              runtime.events.emit("activity", {
                id: createId("activity"),
                createdAt: new Date().toISOString(),
                ...activity,
              });
            },
          }),
        );
        resultDisplay = formatToolOutput(result);
      } catch (error) {
        status = controller.signal.aborted
          ? ToolCallStatus.Canceled
          : ToolCallStatus.Error;
        resultDisplay = controller.signal.aborted
          ? "Execution cancelled."
          : (error instanceof Error ? error.message : String(error));
      } finally {
        abortRef.current = null;
        setIsRunning(false);
        setLiveToolCalls([]);
      }

      const display = toToolCallDisplay(toolCall);
      display.status = status;
      display.resultDisplay = resultDisplay;
      historyManager.addItem(
        ({
          type: "tool_group",
          tools: [display],
          isUserInitiated: true,
        } as HistoryItemWithoutId),
        Date.now(),
      );
    },
    [agentMode, historyManager],
  );

  const applySlashCommandResult = useCallback(
    async (
      result: void | SlashCommandActionReturn,
      _rawInvocation: string,
    ) => {
      if (!result) return;

      switch (result.type) {
        case "message": {
          historyManager.addItem(
            {
              type: result.messageType === "error" ? "error" : "info",
              text: result.content,
            },
            Date.now(),
          );
          return;
        }
        case "submit_prompt": {
          const content = result.content.trim();
          if (content) {
            await runPrompt(content);
          }
          if (result.onComplete) {
            await result.onComplete();
          }
          return;
        }
        case "load_history": {
          historyManager.clearItems();
          appendTurnItems(result.history);
          return;
        }
        case "quit": {
          historyManager.loadHistory(result.messages);
          return;
        }
        case "tool": {
          await executeClientToolCommand(result.toolName, result.toolArgs);
          return;
        }
        case "dialog": {
          setActiveDialog(result.dialog);
          return;
        }
        case "confirm_action": {
          const promptText = stringifyReactNode(result.prompt).trim();
          const promptLines = promptText.length > 0
            ? promptText.split(/\r?\n/).map((line) => line.trimEnd())
            : [`Confirm command: ${result.originalInvocation.raw}`];
          setPendingCommandConfirmation({
            rawInvocation: result.originalInvocation.raw,
            promptLines,
          });
          return;
        }
        default: {
          const _exhaustive: never = result;
          historyManager.addItem(
            { type: "error", text: `Unhandled command result: ${String(_exhaustive)}` },
            Date.now(),
          );
        }
      }
    },
    [appendTurnItems, executeClientToolCommand, historyManager, runPrompt],
  );

  const executeSlashCommand = useCallback(
    async (rawInput: string, overwriteConfirmed = false): Promise<boolean> => {
      const trimmed = rawInput.trim();
      if (!trimmed.startsWith("/")) return false;

      if (trimmed === "/") {
        historyManager.addItem(
          {
            type: "info",
            text: `Available commands: ${slashCommands.map((command) => `/${command.name}`).join(", ")}`,
          },
          Date.now(),
        );
        return true;
      }

      const invocation = resolveSlashInvocation(trimmed, slashCommands);
      if (!invocation) {
        historyManager.addItem(
          {
            type: "error",
            text: `Unknown command: ${trimmed}. Try /help for available commands.`,
          },
          Date.now(),
        );
        return true;
      }

      const { command, name, args } = invocation;
      if (!command.action) {
        historyManager.addItem(
          { type: "warning", text: `Command has no action: /${name}` },
          Date.now(),
        );
        return true;
      }

      if (
        command.supportedModes
        && !command.supportedModes.includes("interactive")
      ) {
        historyManager.addItem(
          { type: "error", text: `Command not supported in interactive mode: /${name}` },
          Date.now(),
        );
        return true;
      }

      try {
        const commandContextWithInvocation: CommandContext = {
          ...commandContext,
          overwriteConfirmed,
          executionMode: "interactive",
          invocation: {
            raw: trimmed,
            name,
            args,
          },
        };

        const result = await command.action(commandContextWithInvocation, args);
        await applySlashCommandResult(result, trimmed);
        registerSlashCommandUsage(name);
      } catch (error) {
        historyManager.addItem(
          {
            type: "error",
            text: `Command failed (${trimmed}): ${error instanceof Error ? error.message : String(error)}`,
          },
          Date.now(),
        );
      }

      return true;
    },
    [
      applySlashCommandResult,
      commandContext,
      historyManager,
      registerSlashCommandUsage,
      slashCommands,
    ],
  );

  const executeSubmission = useCallback(
    async (value: string): Promise<void> => {
      const trimmed = value.trim();
      if (!trimmed) return;

      const slashHandled = await executeSlashCommand(trimmed);
      if (slashHandled) return;

      await runPrompt(trimmed);
    },
    [executeSlashCommand, runPrompt],
  );

  const handleFinalSubmit = useCallback(
    (value: string) => {
      const prompt = value.trim();
      if (!prompt) return;

      if (initError) {
        historyManager.addItem(
          { type: "error", text: `Cannot submit prompt: ${initError}` },
          Date.now(),
        );
        return;
      }

      if (isInitializing || isRunning || approvalQueue.length > 0) {
        setMessageQueue((prev) => [...prev, prompt]);
        return;
      }

      void executeSubmission(prompt);
    },
    [
      approvalQueue.length,
      executeSubmission,
      historyManager,
      initError,
      isInitializing,
      isRunning,
    ],
  );

  const handleRetryLastPrompt = useCallback(() => {
    const lastPrompt = lastSubmittedPromptRef.current;
    if (!lastPrompt) {
      historyManager.addItem(
        { type: "warning", text: "No previous prompt to retry." },
        Date.now(),
      );
      return;
    }

    if (isRunning || isInitializing || approvalQueue.length > 0) {
      setMessageQueue((prev) => [...prev, lastPrompt]);
      return;
    }

    void runPrompt(lastPrompt);
  }, [approvalQueue.length, historyManager, isInitializing, isRunning, runPrompt]);

  const resolveCommandConfirmation = useCallback(
    (confirmed: boolean) => {
      const pending = pendingCommandConfirmation;
      if (!pending) return;

      setPendingCommandConfirmation(null);

      if (!confirmed) {
        historyManager.addItem({ type: "info", text: "Operation cancelled." }, Date.now());
        return;
      }

      if (isInitializing || isRunning || approvalQueue.length > 0 || initError) {
        historyManager.addItem(
          {
            type: "warning",
            text: `Could not run confirmed command right now. Try again: ${pending.rawInvocation}`,
          },
          Date.now(),
        );
        return;
      }

      void executeSlashCommand(pending.rawInvocation, true);
    },
    [
      approvalQueue.length,
      executeSlashCommand,
      historyManager,
      initError,
      isInitializing,
      isRunning,
      pendingCommandConfirmation,
    ],
  );

  const persistConfig = useCallback(
    async (mutate: (fileConfig: DeepCodeConfig) => DeepCodeConfig) => {
      const loader = new ConfigLoader();
      const options = { cwd, configPath: config };
      const fileConfig = await loader.loadFile(options);
      await loader.save(options, mutate(fileConfig));
    },
    [config, cwd],
  );

  const handleSelectTheme = useCallback(
    (nextThemeName: string) => {
      themeManager.setActiveTheme(nextThemeName);
      setThemeName(themeManager.getActiveTheme().name);
      setThemeVersion((version) => version + 1);
      setHistoryRemountKey((key) => key + 1);
      setActiveDialog(null);
      try {
        writeSavedTheme(cwd, nextThemeName);
      } catch (error) {
        historyManager.addItem(
          {
            type: "warning",
            text: `Theme applied but not persisted: ${errorMessage(error)}`,
          },
          Date.now(),
        );
      }
    },
    [cwd, historyManager],
  );

  const handleSavePermissions = useCallback(
    (modes: PermissionModes) => {
      setPermissionModes(modes);
      setPermissionSummary(formatPermissionSummary(modes));
      const runtime = runtimeRef.current;
      if (runtime) {
        Object.assign(runtime.config.permissions, modes);
      }
      setActiveDialog(null);
      void persistConfig((cfg) => ({
        ...cfg,
        permissions: { ...cfg.permissions, ...modes },
      }))
        .then(() => {
          historyManager.addItem(
            { type: "info", text: "Permission policy updated." },
            Date.now(),
          );
        })
        .catch((error) => {
          historyManager.addItem(
            {
              type: "warning",
              text: `Permissions applied but not persisted: ${errorMessage(error)}`,
            },
            Date.now(),
          );
        });
    },
    [historyManager, persistConfig],
  );

  const handlePersistToken = useCallback(
    async (token: string | undefined) => {
      await persistConfig((cfg) => ({
        ...cfg,
        github: { ...cfg.github, token },
      }));
      const runtime = runtimeRef.current;
      if (runtime) {
        runtime.config.github.token = token;
        setAuthSummary(formatAuthSummary(runtime.config.github));
      }
    },
    [persistConfig],
  );

  const providerHasApiKey = useCallback((provider: ProviderId): boolean => {
    const runtime = runtimeRef.current;
    void providerConfigVersion;
    return Boolean(runtime?.config.providers[provider]?.apiKey?.trim());
  }, [providerConfigVersion]);

  const getProviderKeyHint = useCallback((provider: ProviderId): string | undefined => {
    const runtime = runtimeRef.current;
    void providerConfigVersion;
    const key = runtime?.config.providers[provider]?.apiKey?.trim();
    if (!key) return undefined;
    if (key.length <= 8) return "●".repeat(key.length);
    return `${key.slice(0, 6)}●●●●${key.slice(-4)}`;
  }, [providerConfigVersion]);

  const handleSaveProviderApiKey = useCallback(
    async (provider: ProviderId, apiKey: string) => {
      await persistConfig((cfg) => ({
        ...cfg,
        providers: {
          ...cfg.providers,
          [provider]: {
            ...cfg.providers[provider],
            apiKey,
          },
        },
      }));

      const runtime = runtimeRef.current;
      if (runtime) {
        runtime.config.providers[provider].apiKey = apiKey;
        runtime.providers.reload(runtime.config);
      }
      setProviderConfigVersion((version) => version + 1);
      historyManager.addItem(
        { type: "info", text: `API key updated for ${provider}.` },
        Date.now(),
      );
    },
    [historyManager, persistConfig],
  );

  const handleSetDefaultProvider = useCallback(
    async (provider: ProviderId) => {
      const runtime = runtimeRef.current;
      const session = sessionRef.current;
      const previousDefaultProvider = runtime?.config.defaultProvider;
      const configuredModel = runtime
        ? previousDefaultProvider === provider
          ? resolveConfiguredModelForProvider(runtime.config, provider)
          : runtime.config.defaultModels?.[provider]
        : undefined;

      await persistConfig((cfg) => ({
        ...cfg,
        defaultProvider: provider,
        defaultModel: cfg.defaultProvider === provider ? cfg.defaultModel : undefined,
      }));

      if (runtime) {
        runtime.config.defaultProvider = provider;
        if (previousDefaultProvider !== provider) {
          runtime.config.defaultModel = undefined;
        }
      }
      if (session) {
        session.provider = provider;
        session.model = configuredModel;
        session.metadata = { ...session.metadata, providerPinned: true };
        runtime?.sessions.save(session);
        writeSavedProvider(cwd, provider, configuredModel);
        setProviderLabel(formatProviderLabel(session.provider, session.model));
        setCurrentModel(session.model ?? "(unconfigured)");
      }
      setTargetSource("config");
      setProviderConfigVersion((version) => version + 1);
      historyManager.addItem(
        { type: "info", text: `Default provider saved: ${provider}.` },
        Date.now(),
      );
      if (!configuredModel) {
        historyManager.addItem(
          {
            type: "warning",
            text: `Default provider ${provider} has no configured model. Run /model or set defaultModels.${provider}.`,
          },
          Date.now(),
        );
      }
    },
    [cwd, historyManager, persistConfig],
  );

  const handleTestProvider = useCallback(
    async (provider: ProviderId): Promise<ProviderTestResult> => {
      const runtime = runtimeRef.current;
      const session = sessionRef.current;
      if (!runtime) {
        return { ok: false, detail: "Runtime is not ready." };
      }

      const started = Date.now();
      const model = resolveConfiguredModelForProvider(runtime.config, provider)
        ?? (session?.provider === provider ? session.model : undefined);
      if (model) {
        try {
          const result = await runtime.providers.validateProviderModel(provider, {
            model,
            timeoutMs: 15_000,
          });
          return {
            ok: true,
            latencyMs: result.latencyMs,
            detail: `${formatModelCatalogSummary(result)}; model call ok (${result.model})`,
          };
        } catch (error) {
          return {
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }

      const providerClient = runtime.providers.get(provider);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const models = await providerClient.listModels({ signal: controller.signal });
        return {
          ok: true,
          latencyMs: Date.now() - started,
          detail: `${models.length} models visible; configure a model to run a model call.`,
        };
      } catch (error) {
        return {
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    [],
  );

  const handleFetchModels = useCallback(
    async (provider: ProviderId, signal: AbortSignal) => {
      const runtime = runtimeRef.current;
      if (!runtime) throw new Error("Runtime not ready.");
      return await runtime.providers.get(provider).listModels({ signal });
    },
    [],
  );

  const handleSelectModel = useCallback(
    (modelId: string) => {
      setSessionModel(modelId);
      setActiveDialog(null);
    },
    [setSessionModel],
  );

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      const allSessions = await runtime.sessions.loadAll();
      const existing = allSessions.find((s) => s.id === sessionId);
      if (!existing) {
        historyManager.addItem(
          { type: "warning", text: `Session ${sessionId.slice(-8)} not found.` },
          Date.now(),
        );
        setActiveDialog(null);
        return;
      }
      sessionRef.current = existing;
      setCurrentModel(existing.model ?? "(unconfigured)");
      setProviderLabel(formatProviderLabel(existing.provider, existing.model));
      setTargetSource("session");
      historyManager.clearItems();
      setHistoryRemountKey((k) => k + 1);
      restoreHistoryFromSession(existing, (item) => historyManager.addItem(item, Date.now()));
      historyManager.addItem(
        { type: "info", text: `Session ${sessionId.slice(-8)} resumed (${existing.messages.length} messages).` },
        Date.now(),
      );
      setActiveDialog(null);
    },
    [historyManager],
  );

  const closeDialog = useCallback(() => setActiveDialog(null), []);
  const previewTheme = useCallback(() => setThemeVersion((version) => version + 1), []);

  useEffect(() => {
    if (
      drainingQueueRef.current
      || isRunning
      || isInitializing
      || Boolean(initError)
      || approvalQueue.length > 0
      || messageQueue.length === 0
    ) {
      return;
    }

    const [next, ...rest] = messageQueue;
    drainingQueueRef.current = true;
    setMessageQueue(rest);
    void (async () => {
      try {
        await executeSubmission(next);
      } finally {
        drainingQueueRef.current = false;
        // Slash commands don't set isRunning, so they don't naturally trigger
        // a re-render when they finish. Bump this counter so the effect re-runs
        // and picks up the next queued message.
        setDrainTick((n) => n + 1);
      }
    })();
  }, [
    approvalQueue.length,
    executeSubmission,
    initError,
    isInitializing,
    isRunning,
    messageQueue,
  ]);

  useInput((input, key) => {
    if (pendingCommandConfirmation) {
      const pressed = input.toLowerCase();
      if (pressed === "y" || key.return) {
        resolveCommandConfirmation(true);
        return;
      }
      if (pressed === "n" || key.escape || (key.ctrl && input === "c")) {
        resolveCommandConfirmation(false);
      }
      return;
    }

    if (activeDialog) {
      if (isInteractiveDialog(activeDialog)) {
        // Interactive dialogs own their own keyboard handling (incl. Esc).
        return;
      }
      if (key.escape || key.return || (key.ctrl && input === "c")) {
        setActiveDialog(null);
      }
      return;
    }

    if (key.ctrl && input === "p") {
      setActiveDialog("provider");
      return;
    }

    if (approvalQueue.length > 0) {
      const pressed = input.toLowerCase();
      const enterArmed = approvalPromptVisibleAtRef.current !== null
        && Date.now() - approvalPromptVisibleAtRef.current >= APPROVAL_ENTER_ARM_DELAY_MS;
      if (pressed === "y" || (key.return && enterArmed)) {
        resolveApproval({ allowed: true, scope: "once", reason: "Approved in TUI" });
        return;
      }
      if (key.return) return;
      if (pressed === "s") {
        resolveApproval({ allowed: true, scope: "session", reason: "Approved for session in TUI" });
        return;
      }
      if (pressed === "a") {
        resolveApproval({ allowed: true, scope: "always", reason: "Always approved in TUI" });
        return;
      }
      if (pressed === "n" || key.escape || (key.ctrl && input === "c")) {
        resolveApproval({ allowed: false, reason: "Rejected in TUI" });
      }
      return;
    }

    if (isRunning && (key.escape || (key.ctrl && input === "c"))) {
      abortRef.current?.abort();
    }
  });

  const uiActions = useMemo<UIActions>(
    () => ({
      refreshStatic: () => {
        setHistoryRemountKey((prev) => prev + 1);
      },
      handleFinalSubmit,
      handleClearScreen: () => {
        historyManager.clearItems();
        setHistoryRemountKey((prev) => prev + 1);
      },
      setShellModeActive,
      onEscapePromptChange: setShowEscapePrompt,
      onSuggestionsVisibilityChange: () => {},
      vimHandleInput: () => false,
      temporaryCloseFeedbackDialog: () => {},
      popAllQueuedMessages: () => {
        const queued = messageQueueRef.current;
        if (queued.length === 0) return "";
        setMessageQueue([]);
        return queued.join("\n");
      },
      handleRetryLastPrompt,
    }),
    [handleFinalSubmit, handleRetryLastPrompt, historyManager],
  );

  const dialogModel = useMemo(
    () => buildDialogModel(activeDialog, {
      cwd,
      providerLabel,
      targetSource,
      currentModel,
      agentMode,
      compactMode,
      themeName,
      permissionSummary,
      authSummary,
      commandNames: slashCommands.map((command) => `/${command.name}`),
    }),
    [
      activeDialog,
      agentMode,
      compactMode,
      currentModel,
      cwd,
      authSummary,
      permissionSummary,
      providerLabel,
      targetSource,
      slashCommands,
      themeName,
    ],
  );

  const activeSubagents = useMemo(() => Array.from(subagentMap.values()), [subagentMap]);

  const uiState = useMemo<UIState>(
    () => ({
      history: historyManager.history,
      historyManager,
      pendingHistoryItems: pendingGeminiHistoryItems,
      pendingGeminiHistoryItems,
      historyRemountKey,
      quittingMessages: null,

      streamingState,
      thought: null,
      currentLoadingPhrase: iterationInfo
        ? `Iteration ${iterationInfo.round}/${iterationInfo.max}`
        : "",
      elapsedTime,
      streamingResponseLengthRef,
      isReceivingContent,
      initError,

      buffer,
      inputWidth: promptWidths.inputWidth,
      suggestionsWidth: promptWidths.suggestionsWidth,
      isInputActive: (
        approvalQueue.length === 0
        && !initError
        && activeDialog === null
        && pendingCommandConfirmation === null
      ),
      userMessages,
      messageQueue,
      shellModeActive,
      ctrlCPressedOnce: false,
      ctrlDPressedOnce: false,
      showEscapePrompt,
      rewindEscPending: false,

      slashCommands,
      commandContext,
      recentSlashCommands,

      embeddedShellFocused: false,

      promptSuggestion,
      dismissPromptSuggestion,

      terminalWidth,
      terminalHeight,
      mainAreaWidth,
      availableTerminalHeight: undefined,
      staticAreaMaxItemHeight: 200,
      mainControlsRef,
      constrainHeight: false,

      currentModel,

      sessionName: path.basename(cwd),
      isConfigInitialized: !isInitializing && !initError,
      sessionStats: {
        lastPromptTokenCount,
        lastOutputTokenCount,
      },

      dialogsVisible: activeDialog !== null || pendingCommandConfirmation !== null,
      isHelpDialogOpen: activeDialog === "help",
      isThemeDialogOpen: activeDialog === "theme",
      isSettingsDialogOpen: activeDialog === "settings",
      isModelDialogOpen: activeDialog === "model",
      isProviderDialogOpen: activeDialog === "provider",
      isPermissionsDialogOpen: activeDialog === "permissions",
      isFeedbackDialogOpen: false,

      showAutoAcceptIndicator: ApprovalMode.DEFAULT,

      mcpConnected,
      mcpTotal,
      activeSubagents,
    }),
    [
      approvalQueue.length,
      subagentMap,
      activeDialog,
      buffer,
      commandContext,
      compactMode,
      currentModel,
      cwd,
      dismissPromptSuggestion,
      promptSuggestion,
      elapsedTime,
      historyManager,
      historyRemountKey,
      initError,
      isInitializing,
      isReceivingContent,
      iterationInfo,
      lastOutputTokenCount,
      lastPromptTokenCount,
      mainAreaWidth,
      mcpConnected,
      mcpTotal,
      messageQueue,
      pendingCommandConfirmation,
      pendingGeminiHistoryItems,
      promptWidths.inputWidth,
      promptWidths.suggestionsWidth,
      recentSlashCommands,
      shellModeActive,
      showEscapePrompt,
      slashCommands,
      streamingState,
      terminalHeight,
      terminalWidth,
      userMessages,
    ],
  );

  return (
    <CompactModeProvider value={{ compactMode }}>
      <ConfigContext.Provider value={configAdapter}>
        <SettingsContext.Provider value={loadedSettings}>
          <StreamingContext.Provider value={streamingState}>
            <VimModeProvider initialVimEnabled={loadedSettings.merged.general?.vimMode ?? false}>
              <KeypressProvider kittyProtocolEnabled={false} config={configAdapter}>
                <ShellFocusContext.Provider value={true}>
                  <AgentViewProvider>
                    <BackgroundTaskViewProvider>
                      <UIStateContext.Provider value={uiState}>
                        <UIActionsContext.Provider value={uiActions}>
                          <Box flexDirection="column" flexGrow={1}>
                            <Box marginLeft={2} marginRight={2} marginTop={1} marginBottom={1}>
                              <Text bold color={theme.text.accent}>DeepCode</Text>
                              <Text color={theme.text.secondary}>  Target: </Text>
                              <Text color={theme.text.primary}>{providerLabel}</Text>
                              <Text color={theme.text.secondary}> ({targetSource})</Text>
                              <Text color={theme.text.secondary}>  Mode: </Text>
                              <Text
                                bold
                                color={agentMode === "build" ? theme.status.success : theme.status.warning}
                              >
                                {agentMode.toUpperCase()}
                              </Text>
                              <Text color={theme.text.secondary}>
                                {"  "}
                                {streamingState === StreamingState.Responding
                                  ? "running"
                                  : streamingState === StreamingState.WaitingForConfirmation
                                    ? "waiting-approval"
                                    : "idle"}
                              </Text>
                              {iterationInfo && (
                                <Text color={theme.text.secondary}>
                                  {"  "}iter {iterationInfo.round}/{iterationInfo.max}
                                </Text>
                              )}
                              {lastPromptTokenCount > 0 && (
                                <Text color={theme.text.secondary}>
                                  {"  "}↑{formatTokenCount(lastPromptTokenCount)}
                                  {" ↓"}{formatTokenCount(lastOutputTokenCount)}
                                </Text>
                              )}
                            </Box>

                            {initError ? (
                              <Box marginLeft={2} marginRight={2}>
                                <Text color={theme.status.error}>Failed to initialize runtime: {initError}</Text>
                              </Box>
                            ) : (
                              <MainContent
                                key={historyRemountKey}
                                history={historyManager.history}
                                pendingAssistantText={pendingAssistantText}
                                liveToolCalls={liveToolCalls}
                                taskPlan={taskPlan}
                                taskStreams={taskStreams}
                                terminalWidth={terminalWidth}
                                mainAreaWidth={mainAreaWidth}
                                isFocused={approvalQueue.length === 0}
                              />
                            )}

                            {approvalQueue.length > 0 && (
                              <Box marginLeft={2} marginRight={2} marginTop={1}>
                                <ApprovalPrompt request={approvalQueue[0]} />
                              </Box>
                            )}

                            {dialogModel && (
                              <CommandDialog title={dialogModel.title} lines={dialogModel.lines} />
                            )}

                            {activeDialog === "provider" && (
                              <ProviderDialog
                                providers={listAvailableProviders()}
                                currentProvider={getSessionCommandState().provider}
                                currentModel={getSessionCommandState().model}
                                hasApiKey={providerHasApiKey}
                                getProviderKeyHint={getProviderKeyHint}
                                onSelectProvider={setSessionProvider}
                                onSetDefaultProvider={handleSetDefaultProvider}
                                onSaveApiKey={handleSaveProviderApiKey}
                                onTestProvider={handleTestProvider}
                                onClose={closeDialog}
                              />
                            )}

                            {activeDialog === "model" && (
                              <ModelDialog
                                currentProvider={getSessionCommandState().provider}
                                currentModel={getSessionCommandState().model}
                                onFetchModels={handleFetchModels}
                                onSelectModel={handleSelectModel}
                                onClose={closeDialog}
                              />
                            )}

                            {activeDialog === "theme" && (
                              <ThemeDialog
                                onSelect={handleSelectTheme}
                                onClose={closeDialog}
                                onPreview={previewTheme}
                              />
                            )}

                            {activeDialog === "permissions" && (
                              <PermissionsDialog
                                current={permissionModes}
                                onSave={handleSavePermissions}
                                onClose={closeDialog}
                              />
                            )}

                            {activeDialog === "auth" && runtimeRef.current && (
                              <AuthDialog
                                clientId={runtimeRef.current.config.github.oauthClientId}
                                scopes={runtimeRef.current.config.github.oauthScopes}
                                enterpriseUrl={runtimeRef.current.config.github.enterpriseUrl}
                                worktree={cwd}
                                statusSummary={authSummary}
                                hasToken={Boolean(runtimeRef.current.config.github.token)}
                                onPersistToken={handlePersistToken}
                                onClose={closeDialog}
                              />
                            )}

                            {activeDialog === "feedback" && (
                              <FeedbackDialog cwd={cwd} onClose={closeDialog} />
                            )}

                            {activeDialog === "sessions" && (
                              <SessionsDialog
                                cwd={cwd}
                                onSelect={handleSelectSession}
                                onClose={closeDialog}
                              />
                            )}

                            {pendingCommandConfirmation && (
                              <CommandDialog
                                title="Confirm action"
                                lines={[
                                  ...pendingCommandConfirmation.promptLines,
                                  "",
                                  `Command: ${pendingCommandConfirmation.rawInvocation}`,
                                ]}
                                footerText="Press y or Enter to confirm. Press n or Esc to cancel."
                              />
                            )}

                            <SubagentsPanel
                              subagents={Array.from(subagentMap.values())}
                              mainAreaWidth={mainAreaWidth}
                            />

                            <Composer />
                          </Box>
                        </UIActionsContext.Provider>
                      </UIStateContext.Provider>
                    </BackgroundTaskViewProvider>
                  </AgentViewProvider>
                </ShellFocusContext.Provider>
              </KeypressProvider>
            </VimModeProvider>
          </StreamingContext.Provider>
        </SettingsContext.Provider>
      </ConfigContext.Provider>
    </CompactModeProvider>
  );
};

function formatProviderLabel(provider: string, model?: string): string {
  return model ? `${provider} › ${model}` : `${provider} › (model unset)`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatToolOutput(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : "(no output)";
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized && serialized.trim().length > 0
      ? serialized
      : "(no output)";
  } catch {
    return String(value);
  }
}

function stringifyReactNode(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node
      .map((child) => stringifyReactNode(child))
      .filter((part) => part.length > 0)
      .join("\n");
  }
  if (isValidElement<{ children?: unknown }>(node)) {
    return stringifyReactNode(node.props.children);
  }
  return "";
}

function formatPermissionSummary(config: {
  read: string;
  write: string;
  shell: string;
  dangerous: string;
  gitLocal: string;
}): string {
  return `read=${config.read}, write=${config.write}, shell=${config.shell}, dangerous=${config.dangerous}, gitLocal=${config.gitLocal}`;
}

function isInteractiveDialog(dialog: DialogType): boolean {
  return dialog === "theme" || dialog === "permissions" || dialog === "auth" || dialog === "provider" || dialog === "model" || dialog === "feedback" || dialog === "sessions";
}

/**
 * The TUI theme is persisted in a TUI-owned file rather than the core config:
 * `DeepCodeConfig.tui.theme` is a fixed enum inherited from the legacy TUI and
 * cannot represent the Qwen theme set, and `packages/shared` must not change.
 */
function tuiThemeFilePath(cwd: string): string {
  return path.join(cwd, ".deepcode", "tui-theme.json");
}

function readSavedTheme(cwd: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(tuiThemeFilePath(cwd), "utf8")) as {
      theme?: unknown;
    };
    return typeof parsed.theme === "string" ? parsed.theme : null;
  } catch {
    return null;
  }
}

function writeSavedTheme(cwd: string, themeName: string): void {
  const file = tuiThemeFilePath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ theme: themeName }, null, 2)}\n`);
}

function tuiProviderFilePath(cwd: string): string {
  return path.join(cwd, ".deepcode", "tui-provider.json");
}

function readSavedProvider(cwd: string): { provider: ProviderId; model?: string } | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(tuiProviderFilePath(cwd), "utf8")) as {
      provider?: unknown;
      model?: unknown;
    };
    const result = ProviderIdSchema.safeParse(parsed.provider);
    if (!result.success) return null;
    return {
      provider: result.data,
      model: typeof parsed.model === "string" ? parsed.model : undefined,
    };
  } catch {
    return null;
  }
}

function writeSavedProvider(cwd: string, provider: ProviderId, model?: string): void {
  const file = tuiProviderFilePath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ provider, model }, null, 2)}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildDialogModel(
  dialog: DialogType | null,
  options: {
    cwd: string;
    providerLabel: string;
    targetSource: TargetSource;
    currentModel: string;
    agentMode: AgentMode;
    compactMode: boolean;
    themeName: string;
    permissionSummary: string;
    authSummary: string;
    commandNames: string[];
  },
): { title: string; lines: string[] } | null {
  if (!dialog) return null;

  if (dialog === "help") {
    return {
      title: "Help",
      lines: [
        "Available commands:",
        ...options.commandNames,
      ],
    };
  }

  if (dialog === "settings") {
    return {
      title: "Settings",
      lines: [
        `Working directory: ${options.cwd}`,
        `Provider/Model: ${options.providerLabel} (${options.targetSource})`,
        `Mode: ${options.agentMode}`,
        `Compact mode: ${options.compactMode ? "on" : "off"}`,
        `Theme: ${options.themeName}`,
      ],
    };
  }

  // Interactive dialogs render as React components, not as a static CommandDialog.
  if (dialog === "theme" || dialog === "provider" || dialog === "permissions" || dialog === "auth" || dialog === "model" || dialog === "feedback" || dialog === "sessions") {
    return null;
  }

  return {
    title: "Dialog",
    lines: ["This dialog is not implemented yet."],
  };
}

function formatAuthSummary(config: {
  token?: string;
  enterpriseUrl?: string;
  oauthClientId?: string;
}): string {
  const tokenState = config.token?.trim() ? "configured" : "not configured";
  const oauthState = config.oauthClientId?.trim()
    ? "oauth client configured"
    : "oauth client not configured";
  const enterprise = config.enterpriseUrl?.trim()
    ? `enterprise=${config.enterpriseUrl}`
    : "enterprise=github.com";
  return `github token=${tokenState}, ${oauthState}, ${enterprise}`;
}

const ApprovalPrompt: React.FC<{ request?: ApprovalRequest }> = ({ request }) => {
  if (!request) return null;

  const operationLabel = formatApprovalOperationLabel(request);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.status.warning}>⚠ Allow {operationLabel}?</Text>
      {request.path && (
        <Text color={theme.text.secondary}>  {request.path}</Text>
      )}
      {request.preview?.command && (
        <Text color={theme.text.secondary}>
          {"  $ "}{request.preview.command}{request.preview.args?.length ? ` ${request.preview.args.join(" ")}` : ""}
        </Text>
      )}
      <Text color={theme.text.secondary}>
        {"  [↵/y] once   [s] session   [a] always   [n] deny"}
      </Text>
    </Box>
  );
};

function formatApprovalOperationLabel(request: ApprovalRequest): string {
  const labels: Record<string, string> = {
    write_file: "write file",
    edit_file: "edit file",
    read_file: "read file",
    bash: "run shell command",
    shell: "run shell command",
    git: "run git command",
    fetch_web: "fetch URL",
    search_text: "search files",
    list_dir: "list directory",
    analyze_code: "analyze code",
  };
  return labels[request.operation] ?? request.operation.replace(/_/g, " ");
}

class DeepCodeConfigAdapter implements Config {
  constructor(private readonly cwd: string) {}

  getDebugMode(): boolean {
    return false;
  }

  getFileFilteringOptions() {
    return undefined;
  }

  getEnableRecursiveFileSearch(): boolean {
    return true;
  }

  getFileFilteringEnableFuzzySearch(): boolean {
    return true;
  }

  getProjectRoot(): string {
    return this.cwd;
  }

  getTargetDir(): string {
    return this.cwd;
  }

  getWorkingDir(): string {
    return this.cwd;
  }

  getContentGeneratorConfig() {
    return undefined;
  }

  getAccessibility() {
    return undefined;
  }

  getIdeMode(): boolean {
    return false;
  }

  isTrustedFolder(): boolean {
    return true;
  }

  getShouldUseNodePtyShell(): boolean {
    return false;
  }
}
