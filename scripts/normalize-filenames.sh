#!/usr/bin/env bash
# Normalizes file names to one convention (camelCase for lib/hooks, PascalCase for components)
# and rewrites every import that pointed at the old names.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Two-step rename so case-only renames work on case-insensitive file systems.
rename() {
  local from="$1" to="$2"
  if [ ! -e "$from" ]; then
    echo "skip (not found): $from"
    return
  fi
  git mv "$from" "$from.tmp-rename"
  git mv "$from.tmp-rename" "$to"
  echo "renamed: $from -> $to"
}

# --- Imports that currently don't match the real file name (these break on Linux/Vercel) ---
rename src/lib/AuthErrors.js                  src/lib/authErrors.js
rename src/context/Autherrors.test.js         src/context/authErrors.test.js
rename src/hooks/Useinterview.js              src/hooks/useInterview.js
rename src/components/Livetranscript.jsx      src/components/LiveTranscript.jsx
rename src/components/login/Lightscene.jsx    src/components/login/LightScene.jsx
rename src/components/login/Providericons.jsx src/components/login/ProviderIcons.jsx

# --- Odd casing that happened to be consistent, normalized to camelCase ---
rename src/lib/Errormessages.js               src/lib/errorMessages.js
rename src/lib/Options.js                     src/lib/options.js
rename src/lib/Storage.js                     src/lib/storage.js

# --- Rewrite imports for the old names (single or double quotes) ---
# Only names whose files were renamed need rewriting. The others
# (useInterview, LiveTranscript, LightScene, ProviderIcons) were already imported correctly.
FILES=$(git ls-files -z 'src/*.js' 'src/*.jsx' | tr '\0' '\n')
echo "$FILES" | tr '\n' '\0' | xargs -0 perl -pi -e '
  s#/Errormessages(?=["\x27])#/errorMessages#g;
  s#/Options(?=["\x27])#/options#g;
  s#/Storage(?=["\x27])#/storage#g;
  s#/AuthErrors(?=["\x27])#/authErrors#g;
'

echo
echo "Remaining references to old names (should print nothing):"
grep -rnE "/(Errormessages|Options|Storage|AuthErrors|Useinterview|Livetranscript|Lightscene|Providericons)[\"']" src || true

echo
echo "Done. Now run: npm run build   (ideally on Linux/WSL or in CI, since that's where case errors show up)"