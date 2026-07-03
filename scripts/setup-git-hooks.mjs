// Pointe core.hooksPath vers scripts/git-hooks (versionné) plutôt que le
// .git/hooks/ local par défaut (jamais versionné par git, donc perdu à
// chaque nouveau clone ou changement de machine). Lancé automatiquement par
// `npm install` (postinstall) ; ne doit jamais faire échouer l'install si le
// dépôt git est absent (ex. install depuis une archive) ou si git n'est pas
// disponible (ex. certains environnements CI).
import { execSync } from 'node:child_process';

try {
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  execSync('git config core.hooksPath scripts/git-hooks', { stdio: 'ignore' });
  console.log('git hooks : core.hooksPath -> scripts/git-hooks');
} catch (e) {
  // Pas un dépôt git, ou git absent : rien à faire, install non bloquée.
}
