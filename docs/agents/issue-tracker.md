# Issue tracker: GitHub

Issues, PRDs, Wayfinder maps, and Wayfinder tickets for this repository live in GitHub Issues at `Zikoat/unblock-me`. Use the authenticated `gh` CLI for operations.

## Conventions

- Create: `gh issue create --repo Zikoat/unblock-me --title "..." --body "..."`
- Read: `gh issue view <number> --repo Zikoat/unblock-me --comments`
- List: `gh issue list --repo Zikoat/unblock-me --state open`
- Comment: `gh issue comment <number> --repo Zikoat/unblock-me --body "..."`
- Label: `gh issue edit <number> --repo Zikoat/unblock-me --add-label "..."`
- Assign: `gh issue edit <number> --repo Zikoat/unblock-me --add-assignee "@me"`
- Close: `gh issue close <number> --repo Zikoat/unblock-me --comment "..."`

When a skill says to publish to the issue tracker, create a GitHub issue. When it says to fetch a ticket, read the issue body, labels, assignees, relationships, and comments.

## Wayfinding operations

- A map is an issue labelled `wayfinder:map`.
- A decision ticket is an issue labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- Use GitHub's native sub-issue and dependency relationships.
- Claim a ticket before working it by assigning the current developer.
- The frontier contains open, unassigned child issues with no open blockers.
- Record a decision in a resolution comment, close its ticket, and add only a one-line linked gist to the map's `Decisions so far` section.

Verified with `gh` 2.96.0 in this repository:

- Add children after creating them: `gh issue edit <map> --add-sub-issue <number>[,<number>...]`.
- Add dependency edges from the blocked issue: `gh issue edit <blocked> --add-blocked-by <number>[,<number>...]`.
- Inspect the native graph with `gh issue view <number> --json parent,subIssues,blockedBy,blocking`.

Comma-separated issue numbers work for both relationship flags. Create issues first, then wire relationships in a second pass.

`gh issue close` does not accept `--comment-file` in gh 2.96.0. For a multiline
resolution, pipe the text to `gh issue comment <number> --body-file -`, then run
`gh issue close <number> --reason completed` separately.

In PowerShell, a single-quoted `--body 'line one`nline two'` sends the backtick and `n` literally. For multiline bodies, use a here-string piped to `--body-file -`; repair an affected issue with the same pattern through `gh issue edit`.

Use issue titles as names in human-facing text. Include the issue link behind the title rather than referring to an issue only by number.

Add command guidance here only after exercising the operation in this repository. Prefer a short note about observed setup requirements, error-prone argument shapes, and recovery steps over reproducing GitHub's general documentation.

For locally recorded Playwright videos on this Windows setup, run `npx playwright install ffmpeg` once after adding Playwright. The installed Edge browser is sufficient for browser control, but Playwright's recorder separately requires its FFmpeg helper. `bunx` was not available on PATH here, so use `npx` for this setup command.

GitHub Pages was unavailable while this repository was private on the current account plan. The repository was made public so its own workflow can deploy directly to Pages.
