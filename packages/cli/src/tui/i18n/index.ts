/**
 * Small runtime i18n layer for the Terminuz TUI.
 *
 * Translation keys remain English strings so untranslated entries degrade to
 * readable English. This keeps ported Qwen components working while allowing
 * Terminuz-owned surfaces to opt into localized copy incrementally.
 */

export type SupportedLanguage = "en" | "pt-BR";

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ["en", "pt-BR"];

type TranslationValue = string | string[];

const dictionaries: Record<SupportedLanguage, Record<string, TranslationValue>> = {
  en: {},
  "pt-BR": {
    "Configuration not available.": "Configuracao indisponivel.",
    "Could not determine current working directory.":
      "Nao foi possivel determinar o diretorio atual.",
    "Failed to compute git diff stats": "Falha ao calcular estatisticas do git diff",
    "Clean working tree — no changes against HEAD.": "Arvore limpa - sem mudancas contra HEAD.",
    "{{count}} file changed, +{{added}} / -{{removed}}":
      "{{count}} arquivo alterado, +{{added}} / -{{removed}}",
    "{{count}} files changed, +{{added}} / -{{removed}}":
      "{{count}} arquivos alterados, +{{added}} / -{{removed}}",
    "Show working-tree change stats versus HEAD":
      "Mostrar estatisticas de mudancas da arvore contra HEAD",
    "Clear the on-screen conversation history": "Limpar o historico de conversa na tela",
    "Show available slash commands": "Mostrar comandos slash disponiveis",
    "Undo the last file write or edit made by the agent":
      "Desfazer a ultima escrita ou edicao feita pelo agente",
    "Toggle Vim mode (Normal/Insert)": "Alternar modo Vim (Normal/Insercao)",
    "Summarize and compact the conversation history to free context window":
      "Resumir e compactar a conversa para liberar contexto",
    "Open settings dialog": "Abrir configuracoes",
    "Open theme dialog": "Abrir temas",
    "Open permissions dialog": "Abrir permissoes",
    "Open authentication dialog": "Abrir autenticacao",
    "Browse and resume a previous session": "Navegar e retomar uma sessao anterior",
    "Show or set current provider": "Mostrar ou definir o provider atual",
    "Show or set current model": "Mostrar ou definir o modelo atual",
    "Rename the current session": "Renomear a sessao atual",
    "Show or set execution mode (build|plan)": "Mostrar ou definir o modo de execucao (build|plan)",
    "Press Ctrl+C again to exit.": "Pressione Ctrl+C novamente para sair.",
    "Press Ctrl+D again to exit.": "Pressione Ctrl+D novamente para sair.",
    "Press Esc again to clear.": "Pressione Esc novamente para limpar.",
    "Press Esc again to rewind conversation.": "Pressione Esc novamente para voltar a conversa.",
    "(tab to cycle)": "(tab para alternar)",
    "(shift + tab to cycle)": "(shift + tab para alternar)",
    "plan mode": "modo plano",
    "auto-accept edits": "autoaceitar edicoes",
    "YOLO mode": "modo YOLO",
    "Type your message or @path/to/file": "Digite sua mensagem ou @caminho/arquivo",
    "Press 'i' for INSERT mode and 'Esc' for NORMAL mode.":
      "Pressione 'i' para INSERCAO e 'Esc' para NORMAL.",
    "Esc to cancel": "Esc para cancelar",
    Submit: "Enviar",
    Cancel: "Cancelar",
    "Type something...": "Digite algo...",
    "Loading suggestions...": "Carregando sugestoes...",
    "Press ↑ to edit queued messages": "Pressione ↑ para editar mensagens na fila",
    "Shell mode": "Modo shell",
    "Accepting edits": "Aceitando edicoes",
    "Attachments: ": "Anexos: ",
  },
};

let currentLanguage: SupportedLanguage = "en";

/** Translate with `{{param}}` interpolation. */
export function t(key: string, params?: Record<string, string | number>): string {
  const translated = dictionaries[currentLanguage][key] ?? dictionaries.en[key] ?? key;
  const value = Array.isArray(translated) ? translated.join("\n") : translated;
  return interpolate(value, params);
}

/** Translate to a string array. */
export function ta(key: string, params?: Record<string, string | number>): string[] {
  const translated = dictionaries[currentLanguage][key] ?? dictionaries.en[key] ?? key;
  if (Array.isArray(translated)) {
    return translated.map((line) => interpolate(line, params));
  }
  return interpolate(translated, params).split("\n");
}

export function getCurrentLanguage(): SupportedLanguage {
  return currentLanguage;
}

export function setLanguage(lang: SupportedLanguage | "auto"): void {
  if (lang === "auto") {
    currentLanguage = resolveAutoLanguage();
    return;
  }
  currentLanguage = SUPPORTED_LANGUAGES.includes(lang) ? lang : "en";
}

export async function initializeI18n(lang: SupportedLanguage | "auto" = "auto"): Promise<void> {
  setLanguage(lang);
}

function interpolate(value: string, params?: Record<string, string | number>): string {
  if (!params) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

function resolveAutoLanguage(): SupportedLanguage {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  return locale.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}
