#!/bin/sh
# Publishes the game after every commit (scripts/publish.sh), in the background.
hook=$(git rev-parse --git-path hooks)/post-commit
printf '#!/bin/sh\n(scripts/publish.sh >/tmp/unblock-me-publish.log 2>&1 &)\n' > "$hook"
chmod +x "$hook"
