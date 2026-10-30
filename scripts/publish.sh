#!/bin/sh
# Builds the public game (public/, served by scripts/serve-public.py) from the last commit,
# so players only see committed work while dist/ follows every save. Run by the
# post-commit hook (scripts/install-hooks.sh); swaps the new build in whole.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
tree=$(mktemp -d)
trap 'rm -rf "$tree"' EXIT
git -C "$root" archive HEAD | tar -x -C "$tree"
ln -s "$root/node_modules" "$tree/node_modules"
COMMIT=$(git -C "$root" rev-parse --short HEAD) "$HOME/.bun/bin/bun" "$tree/scripts/build.ts" --out "$root/public.next" >/dev/null
rm -rf "$root/public.old"
[ -d "$root/public" ] && mv "$root/public" "$root/public.old"
mv "$root/public.next" "$root/public"
rm -rf "$root/public.old"
echo "Published $(git -C "$root" rev-parse --short HEAD) to public/"
