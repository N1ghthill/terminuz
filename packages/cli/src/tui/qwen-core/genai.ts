/**
 * Local shim standing in for `@google/genai`.
 *
 * The Qwen-derived TUI passes content around using `@google/genai`'s `Part`
 * union types. Terminuz does not depend on that SDK, so this module provides
 * structurally-compatible type definitions for the surface the TUI uses.
 */

export interface Blob {
  mimeType?: string;
  data?: string;
}

export interface FileData {
  mimeType?: string;
  fileUri?: string;
}

export interface FunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export interface FunctionResponse {
  id?: string;
  name?: string;
  response?: Record<string, unknown>;
}

export interface Part {
  text?: string;
  inlineData?: Blob;
  fileData?: FileData;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  thought?: boolean;
  thoughtSignature?: string;
  [key: string]: unknown;
}

export type PartUnion = Part | string;
export type PartListUnion = PartUnion | PartUnion[];

export enum FinishReason {
  FINISH_REASON_UNSPECIFIED = "FINISH_REASON_UNSPECIFIED",
  STOP = "STOP",
  MAX_TOKENS = "MAX_TOKENS",
  SAFETY = "SAFETY",
  RECITATION = "RECITATION",
  LANGUAGE = "LANGUAGE",
  OTHER = "OTHER",
  BLOCKLIST = "BLOCKLIST",
  PROHIBITED_CONTENT = "PROHIBITED_CONTENT",
  SPII = "SPII",
  MALFORMED_FUNCTION_CALL = "MALFORMED_FUNCTION_CALL",
  IMAGE_SAFETY = "IMAGE_SAFETY",
  UNEXPECTED_TOOL_CALL = "UNEXPECTED_TOOL_CALL",
}
