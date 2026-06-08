import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkForUpdate, isNewer } from "../../../update-checker.js";
import { VERSION } from "../../../version.js";
import {
  CommandKind,
  type CommandContext,
  type SlashCommandActionReturn,
  type SlashCommand,
} from "./types.js";

const execFileAsync = promisify(execFile);

export const updateCommand: SlashCommand = {
  name: "update",
  description: "Verifica e instala atualizações do DeepCode",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  argumentHint: "[latest|stable]",
  action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn | void> => {
    const tag = args.trim().toLowerCase();

    if (tag === "latest" || tag === "stable") {
      if (!context.overwriteConfirmed) {
        return {
          type: "confirm_action",
          prompt: `Instalar deepcode-ai@${tag} globalmente via npm?`,
          originalInvocation: { raw: context.invocation?.raw ?? `/update ${tag}` },
        };
      }

      try {
        const { stdout, stderr } = await execFileAsync(
          "npm",
          ["install", "-g", `deepcode-ai@${tag}`],
          { timeout: 120_000 },
        );
        const output = (stdout + stderr).trim();
        const lines = [`deepcode-ai@${tag} instalado com sucesso.`];
        if (output) lines.push("", output);
        lines.push("", "Reinicie o DeepCode para usar a nova versão.");
        return { type: "message", messageType: "info", content: lines.join("\n") };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          type: "message",
          messageType: "error",
          content: `Falha ao instalar deepcode-ai@${tag}:\n${message}`,
        };
      }
    }

    const update = await checkForUpdate(VERSION, { force: true });
    const lines = [`Versão atual:   ${VERSION}`];

    if (!update) {
      lines.push("Não foi possível acessar o registro npm agora.");
    } else {
      const latestStatus = isNewer(VERSION, update.latest)
        ? "disponível — use /update latest para instalar"
        : "atual ou mais recente";
      lines.push(`Versão latest:  ${update.latest} (${latestStatus})`);

      if (update.stable) {
        const stableStatus = isNewer(VERSION, update.stable)
          ? "disponível — use /update stable para instalar"
          : "atual ou mais recente";
        lines.push(`Versão stable:  ${update.stable} (${stableStatus})`);
      } else {
        lines.push("Versão stable:  ainda não publicada");
      }
    }

    return { type: "message", messageType: "info", content: lines.join("\n") };
  },
};
