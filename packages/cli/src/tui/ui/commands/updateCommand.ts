import { checkForUpdate, isNewer } from "../../../update-checker.js";
import { VERSION } from "../../../version.js";
import {
  CommandKind,
  type MessageActionReturn,
  type SlashCommand,
} from "./types.js";

export const updateCommand: SlashCommand = {
  name: "update",
  description: "Verifica versões publicadas do DeepCode",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: async (): Promise<MessageActionReturn> => {
    const update = await checkForUpdate(VERSION, { force: true });
    const lines = [`Versão atual:   ${VERSION}`];

    if (!update) {
      lines.push("Não foi possível acessar o registro npm agora.");
    } else {
      const latestStatus = isNewer(VERSION, update.latest)
        ? "disponível"
        : "atual ou mais recente";
      lines.push(`Versão latest:  ${update.latest} (${latestStatus})`);

      if (update.stable) {
        const stableStatus = isNewer(VERSION, update.stable)
          ? "disponível"
          : "atual ou mais recente";
        lines.push(`Versão stable:  ${update.stable} (${stableStatus})`);
      } else {
        lines.push("Versão stable:  ainda não publicada");
      }
    }

    lines.push("");
    lines.push("Instalar latest:  npm install -g deepcode-ai@latest");
    lines.push("Instalar stable:  npm install -g deepcode-ai@stable");

    return { type: "message", messageType: "info", content: lines.join("\n") };
  },
};
