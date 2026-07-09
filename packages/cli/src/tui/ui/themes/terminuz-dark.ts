/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Terminuz-native dark theme.
 */

import { type ColorsTheme, Theme } from "./theme.js";
import type { SemanticColors } from "./semantic-tokens.js";

const terminuzDarkColors: ColorsTheme = {
  type: "dark",
  Background: "#0C1116",
  Foreground: "#D9E2EC",
  LightBlue: "#7CC7E8",
  AccentBlue: "#4EA1D3",
  AccentPurple: "#B08CFF",
  AccentCyan: "#3FD6C6",
  AccentGreen: "#78D17A",
  AccentYellow: "#E7C15D",
  AccentRed: "#F26D6D",
  AccentYellowDim: "#7B6425",
  AccentRedDim: "#743333",
  DiffAdded: "#163B2A",
  DiffRemoved: "#4A1F24",
  Comment: "#75808A",
  Gray: "#596672",
  GradientColors: ["#3FD6C6", "#4EA1D3", "#E7C15D"],
};

const terminuzDarkSemantic: SemanticColors = {
  text: {
    primary: terminuzDarkColors.Foreground,
    secondary: "#A6B4C0",
    link: terminuzDarkColors.AccentBlue,
    accent: terminuzDarkColors.AccentCyan,
    code: terminuzDarkColors.LightBlue,
  },
  background: {
    primary: terminuzDarkColors.Background,
    diff: {
      added: terminuzDarkColors.DiffAdded,
      removed: terminuzDarkColors.DiffRemoved,
    },
  },
  border: {
    default: "#33424F",
    focused: terminuzDarkColors.AccentCyan,
  },
  ui: {
    comment: terminuzDarkColors.Comment,
    symbol: terminuzDarkColors.AccentBlue,
    gradient: terminuzDarkColors.GradientColors,
  },
  status: {
    error: terminuzDarkColors.AccentRed,
    success: terminuzDarkColors.AccentGreen,
    warning: terminuzDarkColors.AccentYellow,
    errorDim: terminuzDarkColors.AccentRedDim,
    warningDim: terminuzDarkColors.AccentYellowDim,
  },
};

export const TerminuzDark: Theme = new Theme(
  "Terminuz Dark",
  "dark",
  {
    hljs: {
      display: "block",
      overflowX: "auto",
      padding: "0.5em",
      background: terminuzDarkColors.Background,
      color: terminuzDarkColors.Foreground,
    },
    "hljs-keyword": { color: terminuzDarkColors.AccentCyan },
    "hljs-literal": { color: terminuzDarkColors.AccentYellow },
    "hljs-symbol": { color: terminuzDarkColors.AccentBlue },
    "hljs-name": { color: terminuzDarkColors.LightBlue },
    "hljs-link": { color: terminuzDarkColors.AccentBlue },
    "hljs-string": { color: terminuzDarkColors.AccentGreen },
    "hljs-title": { color: terminuzDarkColors.LightBlue },
    "hljs-type": { color: terminuzDarkColors.AccentBlue },
    "hljs-attribute": { color: terminuzDarkColors.AccentYellow },
    "hljs-bullet": { color: terminuzDarkColors.AccentYellow },
    "hljs-addition": { color: terminuzDarkColors.AccentGreen },
    "hljs-variable": { color: terminuzDarkColors.Foreground },
    "hljs-template-tag": { color: terminuzDarkColors.AccentCyan },
    "hljs-template-variable": { color: terminuzDarkColors.AccentYellow },
    "hljs-comment": {
      color: terminuzDarkColors.Comment,
      fontStyle: "italic",
    },
    "hljs-quote": {
      color: terminuzDarkColors.Comment,
      fontStyle: "italic",
    },
    "hljs-deletion": { color: terminuzDarkColors.AccentRed },
    "hljs-meta": { color: terminuzDarkColors.AccentPurple },
    "hljs-doctag": { fontWeight: "bold" },
    "hljs-strong": { fontWeight: "bold" },
    "hljs-emphasis": { fontStyle: "italic" },
  },
  terminuzDarkColors,
  terminuzDarkSemantic,
);
