#!/usr/bin/env bash

set -euo pipefail

pattern='(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----|\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|OPENROUTER_API_KEY|GROQ_API_KEY|OPENCODE_API_KEY|GITHUB_TOKEN|NPM_TOKEN|NODE_AUTH_TOKEN)\b\s*[:=]\s*"?[A-Za-z0-9_./+=-]{20,})'

mapfile -d '' tracked_files < <(git ls-files -z)
mapfile -d '' untracked_files < <(git ls-files --others --exclude-standard -z)

files=("${tracked_files[@]}" "${untracked_files[@]}")

if [[ "${#files[@]}" -eq 0 ]]; then
  echo "Secret scan skipped: no tracked or untracked files."
  exit 0
fi

matches="$(rg -nHI -e "$pattern" "${files[@]}" || true)"

if [[ -n "$matches" ]]; then
  echo "Potential secrets found in tracked files:"
  echo "$matches"
  exit 1
fi

tracked_count="${#tracked_files[@]}"
untracked_count="${#untracked_files[@]}"
echo "Secret scan passed for ${tracked_count} tracked files and ${untracked_count} untracked files."
