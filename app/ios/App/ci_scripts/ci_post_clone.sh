#!/bin/sh
# Xcode Cloud clone le repo à nu (pas de node_modules) puis tente aussitôt de
# résoudre Package.swift, qui référence des chemins locaux dans node_modules/
# (@capacitor/*, @capacitor-community/in-app-review) : sans cette étape, la
# résolution SPM échoue systématiquement ("doesn't exist in file system").
# Codemagic avait cette étape explicite dans codemagic.yaml ; Xcode Cloud a
# besoin de son propre hook (ci_post_clone.sh, lancé automatiquement après
# le clone, avant la résolution des paquets).
set -e

cd "$CI_WORKSPACE"

if ! command -v node >/dev/null 2>&1; then
  # Version figée (celle utilisée en local via nvm pour ce projet) plutôt
  # que "brew install node" (dernière version Homebrew, non testée avec ce
  # projet — un premier échec ici a coïncidé avec un brew install node qui a
  # attrapé du 26.8.2 flambant neuf).
  brew install node@24
  brew link --force node@24
fi

npm install

echo "--- diagnostic avant cap sync ios ---"
node -v
npm -v
pwd
cat capacitor.config.json
ls node_modules/@capacitor/ios 2>&1 || echo "node_modules/@capacitor/ios introuvable"

# app/ios/App/App/public/ est gitignoré (régénéré depuis app/pwa/ à chaque
# sync), donc absent d'un clone propre — mais référencé comme ressource
# requise par le projet Xcode : sans ce sync, le build échoue au link
# ("public" couldn't be opened).
npx cap sync ios
