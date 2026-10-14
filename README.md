# FORGE — Visual Universe

Minimal deployment repository for **https://forgetopia.github.io/**. The Astro
website is maintained in the public source repository
[`forgetopia/forge-portfolio`](https://github.com/forgetopia/forge-portfolio), branch
`main`. Website code and generated output are not copied into this repository.

## GitHub Pages setup

In this repository's **Settings → Pages → Build and deployment**, select
**GitHub Actions** as the source. Ensure repository Actions are enabled and that
the `github-pages` environment permits deployments from `main`. If environment
review is required, approve the deployment through GitHub after the build passes.

The [deployment workflow](.github/workflows/deploy.yml) runs manually or on pushes
to this repository's `main` branch. It checks out the source into `source/`, uses
Node.js **22.23.3**, installs the committed lockfile with `npm ci`, runs Astro checks
and unit tests, and builds with `FORGE_SITE_ORIGIN=https://forgetopia.github.io`.
It confirms `source/dist/index.html` exists and runs the source's Chromium browser
tests and a static artifact audit before uploading the complete `source/dist/`
artifact. A separate job deploys that artifact through the `github-pages`
environment.

The build job has only `contents: read` and `pages: read`; the deployment job has
only `pages: write` and `id-token: write`. GitHub supplies the workflow's
`GITHUB_TOKEN` and deployment identity. Reading the public source needs no personal
access token, source-repository secret, or cross-repository write token.

The uploaded directory becomes the website root. It includes images, media,
captions, CSS, JavaScript, and self-hosted fonts, including the generated
`_astro/` directory. Actions Pages artifacts are served directly without Jekyll;
no `.nojekyll` file or `/forge-portfolio/` base path is required.

This workflow deploys only GitHub Pages. It does not modify the source repository,
Cloudflare Workers, the existing Cloudflare integration, DNS, or custom domains.
Keep the Pages origin override scoped to this workflow; the Cloudflare build
continues to use its existing origin and configuration.

## Redeploy after source changes

Changes to `forgetopia/forge-portfolio` **do not automatically trigger** workflows
in this separate deployment repository. After reviewed source changes reach its
`main` branch:

1. Open this repository's **Actions** tab.
2. Select **Deploy FORGE to GitHub Pages**.
3. Select **Run workflow**, choose deployment branch **main**, and run it.
4. Wait for the build checks and the `github-pages` deployment to pass. Each run
   fetches the source repository's current `main`; its resolved commit is recorded
   in the checkout log.

With an already authenticated GitHub CLI, the equivalent manual command is:

```sh
gh workflow run deploy.yml --repo forgetopia/forgetopia.github.io --ref main
```

The workflow becomes available for manual runs after it is merged into this
repository's default branch. No source-repository dispatch hook is configured.

## Validation

The source unit tests include separate hosting builds that check canonical,
Open Graph, social-image, and sitemap URLs for both origins, public project
routes, and root-relative links/assets. Browser tests run against the actual
Pages-origin production build and cover Home, Work, About, Contact, project
details, navigation, images, CSS, fonts, JavaScript, showreel/native media controls,
and loading/error fallbacks. All checks must pass before the artifact is uploaded.
The deployment-side artifact audit also verifies emitted HTML and CSS references,
including generated JavaScript and font files, against files in `dist/`.
Astro may inline compiled JavaScript modules; the audit accepts those as well as
external script files.

YouTube tests use disposable content and intercepted synthetic embeds to verify
click-to-load behavior, iframe URLs, keyboard access, and persistent external
watch/error fallbacks. They do not publish test IDs or prove real YouTube playback.
Current source content uses labeled placeholder media; validate approved real
films and YouTube availability when those are supplied.

After the first deployment, check the hosted website separately:

- Open `/`, `/work/`, `/about/`, `/contact/`, and every public `/work/<slug>/`
  directly, then follow navigation and project links.
- Inspect image, CSS, font, JavaScript, video, and caption requests, especially
  `/_astro/`, for successful responses at root paths. Exercise showreel controls,
  native media playback, and failure fallbacks on desktop and mobile.
- For approved YouTube content, click to load the `youtube-nocookie.com` embed
  and verify playback and the persistent external watch link. Cross-origin
  restrictions limit automatic detection of deleted or restricted films.
- Confirm each page's canonical URL and `/sitemap.xml` use
  `https://forgetopia.github.io`, with no `/forge-portfolio/` prefix. Confirm an
  unknown route returns a real `404`.

Local checks establish build correctness; successful GitHub deployment and these
hosted checks establish Pages delivery. Keep any hosted results separate from
local test results.
