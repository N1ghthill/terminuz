/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * DeepCode-native dark theme.
 */

import { type ColorsTheme, Theme } from './theme.js';
import type { SemanticColors } from './semantic-tokens.js';

const deepCodeDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#0C1116',
  Foreground: '#D9E2EC',
  LightBlue: '#7CC7E8',
  AccentBlue: '#4EA1D3',
  AccentPurple: '#B08CFF',
  AccentCyan: '#3FD6C6',
  AccentGreen: '#78D17A',
  AccentYellow: '#E7C15D',
  AccentRed: '#F26D6D',
  AccentYellowDim: '#7B6425',
  AccentRedDim: '#743333',
  DiffAdded: '#163B2A',
  DiffRemoved: '#4A1F24',
  Comment: '#75808A',
  Gray: '#596672',
  GradientColors: ['#3FD6C6', '#4EA1D3', '#E7C15D'],
};

const deepCodeDarkSemantic: SemanticColors = {
  text: {
    primary: deepCodeDarkColors.Foreground,
    secondary: '#A6B4C0',
    link: deepCodeDarkColors.AccentBlue,
    accent: deepCodeDarkColors.AccentCyan,
    code: deepCodeDarkColors.LightBlue,
  },
  background: {
    primary: deepCodeDarkColors.Background,
    diff: {
      added: deepCodeDarkColors.DiffAdded,
      removed: deepCodeDarkColors.DiffRemoved,
    },
  },
  border: {
    default: '#33424F',
    focused: deepCodeDarkColors.AccentCyan,
  },
  ui: {
    comment: deepCodeDarkColors.Comment,
    symbol: deepCodeDarkColors.AccentBlue,
    gradient: deepCodeDarkColors.GradientColors,
  },
  status: {
    error: deepCodeDarkColors.AccentRed,
    success: deepCodeDarkColors.AccentGreen,
    warning: deepCodeDarkColors.AccentYellow,
    errorDim: deepCodeDarkColors.AccentRedDim,
    warningDim: deepCodeDarkColors.AccentYellowDim,
  },
};

export const DeepCodeDark: Theme = new Theme(
  'DeepCode Dark',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: deepCodeDarkColors.Background,
      color: deepCodeDarkColors.Foreground,
    },
    'hljs-keyword': { color: deepCodeDarkColors.AccentCyan },
    'hljs-literal': { color: deepCodeDarkColors.AccentYellow },
    'hljs-symbol': { color: deepCodeDarkColors.AccentBlue },
    'hljs-name': { color: deepCodeDarkColors.LightBlue },
    'hljs-link': { color: deepCodeDarkColors.AccentBlue },
    'hljs-string': { color: deepCodeDarkColors.AccentGreen },
    'hljs-title': { color: deepCodeDarkColors.LightBlue },
    'hljs-type': { color: deepCodeDarkColors.AccentBlue },
    'hljs-attribute': { color: deepCodeDarkColors.AccentYellow },
    'hljs-bullet': { color: deepCodeDarkColors.AccentYellow },
    'hljs-addition': { color: deepCodeDarkColors.AccentGreen },
    'hljs-variable': { color: deepCodeDarkColors.Foreground },
    'hljs-template-tag': { color: deepCodeDarkColors.AccentCyan },
    'hljs-template-variable': { color: deepCodeDarkColors.AccentYellow },
    'hljs-comment': {
      color: deepCodeDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: deepCodeDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-deletion': { color: deepCodeDarkColors.AccentRed },
    'hljs-meta': { color: deepCodeDarkColors.AccentPurple },
    'hljs-doctag': { fontWeight: 'bold' },
    'hljs-strong': { fontWeight: 'bold' },
    'hljs-emphasis': { fontStyle: 'italic' },
  },
  deepCodeDarkColors,
  deepCodeDarkSemantic,
);
