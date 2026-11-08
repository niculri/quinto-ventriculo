#!/bin/sh
# Turns on the hooks of .githooks/ in this clone (step 1.9). Runs from `npm install` (the `prepare` script), so it
# never fails: in the CI, outside a git repository or with other hooks already configured it does nothing.
if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ]; then exit 0; fi
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
current=$(git config --get core.hooksPath 2>/dev/null)
if [ "$current" = ".githooks" ]; then exit 0; fi
if [ -n "$current" ]; then
  echo "Aviso: core.hooksPath ya apunta a «$current»; no lo cambio (el pre-push de .githooks/ no corre)."
  exit 0
fi
# Hooks of its own in .git/hooks would stop running once core.hooksPath points elsewhere: then nothing is changed.
hooks=$(git rev-parse --git-path hooks 2>/dev/null)
if [ -n "$hooks" ] && [ -d "$hooks" ]; then
  for hook in "$hooks"/*; do
    [ -f "$hook" ] || continue
    case "$hook" in *.sample) continue ;; esac
    echo "Aviso: ya hay hooks en «$hooks» (por ejemplo «$(basename "$hook")»); no activo .githooks/."
    echo "  Para usar el pre-push del proyecto: git config core.hooksPath .githooks (y pasa ahí esos hooks)."
    exit 0
  done
fi
git config core.hooksPath .githooks && echo "Hooks de git activados (.githooks/pre-push)."
exit 0
