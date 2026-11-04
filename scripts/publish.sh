#!/bin/sh
# Builds the public game (public/, served by scripts/serve-public.py) from the last commit,
# so players only see committed work while dist/ follows every save. Run by the
# post-commit hook (scripts/install-hooks.sh); swaps the new build in whole.
# Publishes take turns (commits seconds apart once raced on one build folder and put a
# half-built one live), and a build without the game's files is never swapped in.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
exec 9>"$root/.publish.lock"
flock 9
tree=$(mktemp -d)
next=$(mktemp -d "$root/public.next.XXXXXX")
trap 'rm -rf "$tree" "$next"' EXIT
git -C "$root" archive HEAD | tar -x -C "$tree"
ln -s "$root/node_modules" "$tree/node_modules"
COMMIT=$(git -C "$root" rev-parse --short HEAD) "$HOME/.bun/bin/bun" "$tree/scripts/build.ts" --out "$next" >/dev/null
for f in index.html app.js goal-worker.js build.txt; do
  [ -s "$next/$f" ] || { echo "Not published: the build has no $f" >&2; exit 1; }
done
chmod 755 "$next"
rm -rf "$root/public.old"
[ -d "$root/public" ] && mv "$root/public" "$root/public.old"
mv "$next" "$root/public"
rm -rf "$root/public.old"
echo "Published $(git -C "$root" rev-parse --short HEAD) to public/"
