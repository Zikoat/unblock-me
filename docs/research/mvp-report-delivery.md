# MVP verification-report delivery

Checked 2026-07-20 against official documentation and the repository itself. `Zikoat/unblock-me` is currently a private repository owned by a personal GitHub account.

## Recommendation

For the first MVP, publish the self-contained `verification-report.html` as a **private GitHub Release asset**. This requires no additional hosting account, preserves the repository's access boundary, has no automatic retention expiry documented by GitHub, and permits an individual asset up to 2 GiB. On Android, the owner signs into GitHub, downloads the single HTML file, and opens it with a browser or HTML-capable viewer. The last step must be tested on the actual phone because it is a download workflow, not a hosted page. GitHub documents that releases are visible to readers of the repository and that release assets may be up to 2 GiB, with no total release-size or bandwidth limit stated ([About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)).

For the recurring agent-feedback workflow, prefer a **separate authenticated hosted preview**, such as a protected Vercel preview deployment. It supplies a normal cross-network HTTPS URL, so Android can authenticate and render the report and embedded video directly in the browser. Vercel Authentication and Standard Protection are available on all plans for preview/deployment URLs; protecting a production domain requires Pro or Enterprise ([Vercel Deployment Protection](https://vercel.com/docs/deployment-protection), [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)). This adds a vendor account, deployment configuration, and another authorization boundary, so it should be validated after the MVP rather than made part of the MVP's game scope.

If requiring a Vercel account is undesirable, Vercel Shareable Links are available on all plans and grant external access through a secure query parameter. That is convenient on a phone, but possession of the URL effectively grants access, so it is link secrecy rather than an identity login wall ([Vercel bypass and Shareable Links](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection)).

## Comparison

| Option | Privacy and access | Android path | Retention / limits | Assessment |
| --- | --- | --- | --- | --- |
| GitHub Pages | Ordinary Pages sites are public even when their source repository is private. Private Pages access control is limited to project sites owned by an organization using GitHub Enterprise Cloud; it is unavailable to this personal-account repository. Publishing Pages from a private repository also requires a paid GitHub plan. | Open a URL directly; best raw viewing experience. | Published site limit 1 GiB; source repository files are subject to GitHub's 100 MiB object limit. | Reject for private report content. It is viable only if the report is intentionally public. |
| GitHub Actions artifact | The viewer must be signed into GitHub and have repository read access. | Navigate to the workflow run, download a ZIP, extract it, then open the HTML locally. This friction is an inference from GitHub's documented archive-download flow. | Default retention is 90 days and is configurable; deleting the workflow run deletes its artifacts. Downloads are ZIP archives. | Keep as CI evidence, not as the main human-facing surface. |
| GitHub Release asset | Repository readers can view releases; the private repository therefore supplies the access boundary. | Sign in, open the release, download one `.html` asset, then open it locally. Easier than an artifact because no ZIP extraction is required, but still not click-to-render. | No automatic expiry documented; each asset may be up to 2 GiB. | Best zero-new-infrastructure MVP option. |
| Separate authenticated host | Access is enforced by the host rather than by GitHub. A protected Vercel preview requires an authorized Vercel login; a Shareable Link instead acts as a bearer-style secret URL. | Open cross-network HTTPS URL, authenticate if required, and watch the embedded video in-page. | Host-specific. Preview protection is available without an Enterprise GitHub account; production-domain protection has Vercel plan limits. | Best durable phone UX, with additional setup and vendor surface. |

## Supporting details

- GitHub explicitly warns that a Pages site is publicly available even when its source repository is private. Private repositories require GitHub Pro, Team, Enterprise Cloud, or Enterprise Server for Pages ([Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)).
- GitHub's private Pages access control requires an organization on GitHub Enterprise Cloud, and authorized viewers need repository read access ([Changing the visibility of a GitHub Pages site](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)).
- GitHub Pages sites may be at most 1 GiB ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)); Git repositories block individual files larger than 100 MiB ([Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)). Embedding video as base64 increases the HTML file size, so the report should not be committed casually even if it fits.
- Actions artifacts require a signed-in GitHub user with repository read access and default to 90-day retention ([Downloading workflow artifacts](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts?tool=webui)). The artifact API downloads ZIP archives through a one-minute redirect URL ([Actions artifacts REST API](https://docs.github.com/en/rest/actions/artifacts)); artifacts are removed with their workflow run ([Workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)).
- A local-network server is unsuitable here: it depends on routing between the remote Codex environment and the phone and on the serving process remaining alive. A release or hosted preview persists independently and works across networks.

## MVP verification of the delivery itself

1. Keep the report to one HTML file with the video embedded and encoded for Android browser playback.
2. Upload it to a private MVP release without committing the generated binary report to Git history.
3. From the Android phone, while signed into the repository owner's GitHub account, download and open it.
4. Confirm that text is readable without horizontal scrolling, the video plays with controls, seeking works, and reopening the downloaded file still works.
5. Record any Android viewer or authentication friction. If the file does not open reliably in one step after download, treat that as evidence to adopt an authenticated hosted preview for subsequent reports.
