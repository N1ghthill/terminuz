/**
 * ShellInputPrompt — Terminuz stub.
 *
 * Qwen Code's embedded PTY shell (keystrokes piped into a live terminal inside
 * a tool card) is not part of Terminuz. The stub renders nothing; shell tool
 * output is still shown by `ToolMessage` as regular captured output.
 */

export interface ShellInputPromptProps {
  activeShellPtyId: number | null;
  focus: boolean;
}

export function ShellInputPrompt(_props: ShellInputPromptProps): null {
  return null;
}
