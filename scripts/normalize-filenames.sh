#!/usr/bin/env bash
# Fixes file names whose casing doesn't match the imports that use them.
# Windows and macOS ignore the difference, but Linux (Vercel, CI) does, so the build fails there.
# Only files whose imports are actually broken are renamed. Errormessages.js, Options.js and
# Storage.js are imported with matching casing everywhere, so they work and are left alone.
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

# --- Files whose names don't match how they are imported ---
rename src/hooks/Useinterview.js              src/hooks/useInterview.js
rename src/components/Livetranscript.jsx      src/components/LiveTranscript.jsx
rename src/components/login/Lightscene.jsx    src/components/login/LightScene.jsx
rename src/components/login/Providericons.jsx src/components/login/ProviderIcons.jsx
rename src/lib/AuthErrors.js                  src/lib/authErrors.js
rename src/context/Autherrors.test.js         src/context/authErrors.test.js

# --- The one import that pointed at the old AuthErrors name (the test file) ---
FILES=$(git ls-files -z 'src/*.js' 'src/*.jsx' | tr '\0' '\n')
echo "$FILES" | tr '\n' '\0' | xargs -0 perl -pi -e '
  s#/AuthErrors(?=["\x27])#/authErrors#g;
'

echo
echo "Remaining references to old names (should print nothing):"
grep -rnE "/(Useinterview|Livetranscript|Lightscene|Providericons|AuthErrors)[\"']" src || true

echo
echo "Done. Now run: npm run build   (ideally on Linux/WSL or in CI, since that's where case errors show up)"