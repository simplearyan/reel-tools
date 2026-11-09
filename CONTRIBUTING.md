# Contributing to Reel

Thank you for helping. Reel is a family of small, free tools for animation, video and sound. Each tool is one HTML file, so most contributions are easy to read, try and review.

## Ways to help

- **Report a bug.** Open an issue with the tool name, what you did, what you expected and what happened. Add your browser and version, and a screenshot if it helps.
- **Suggest a tool or feature.** Open an issue first so we can talk about it before you build it.
- **Fix or improve a tool.** Edit `apps/<name>/index.html` and open a pull request.
- **Add a tool.** See "Adding a tool" below.
- **Improve the site.** The home page, the shared head and the scripts live in `shared/` and `scripts/`.
- **Write taglines, descriptions and docs.** Many tools need a one-line summary in their `app.json`.

## Set up

You need [Node.js](https://nodejs.org) 18 or newer and git. There are no packages to install.

```
git clone https://github.com/simplearyan/reel.git
cd reel
npm run dev
```

`npm run dev` opens a live preview at http://localhost:3000 that rebuilds when you save. `npm run admin` opens the same preview with the **Reel Dev** dashboard, where you can edit tool details and see problems without touching files.

## How the repo is organised

```
apps/<name>/index.html     the tool (the latest version)
apps/<name>/app.json       name, tagline, description, tags
apps/<name>/versions/      older versions (maintainers manage these)
shared/                    home page, shared <head>, SEO, dashboard
scripts/                   Node scripts that build and tidy the site
site.json                  site-wide settings
```

## Adding a tool

1. Run `npm run new my-tool "My Tool"`. It creates `apps/my-tool/` with a starter page.
2. Build the tool in `apps/my-tool/index.html`.
3. Fill in `tagline`, `description` and `tags` in `apps/my-tool/app.json`.
4. Run `npm run dev` and try it. Run `npm run validate` to check it.
5. Open a pull request.

## Rules for a tool

- **One self-contained HTML file.** Put the CSS and JavaScript inside it. Small images can be embedded.
- **Do not add your own page title, description, favicon, social tags, ads or analytics.** The build adds them for every tool, so they stay consistent.
- **No tracking and no external accounts.** A tool should work without signing in. If it uses a library, prefer inlining it, or load an exact pinned version from a public CDN such as jsDelivr or cdnjs. Never load a script over plain `http://`.
- **Responsive and accessible.** It should work on a phone and a desktop, support light and dark mode where it makes sense, be usable with a keyboard, and keep tap targets at least 44px.
- **Look like Reel.** Use the Hanken Grotesk font, rounded corners, and the Reel colours. `npm run new` gives you the starting tokens.
- **Keep it readable.** Use clear section banners such as `/* ===== EXPORT ===== */` and a short table of contents comment at the top, so a stranger can find their way around a large file.
- **Respect privacy.** Process files in the browser. Do not upload a user's files anywhere.

## Changing an existing tool

- Edit `apps/<name>/index.html` only. Please do not edit files in `versions/`; maintainers save older versions before big changes.
- Keep a change focused. Several small pull requests are easier to review than one large one.
- Describe what changed and why, and say how you tested it (browser and steps).

## Before you open a pull request

- [ ] The tool loads and works in a current Chrome, Firefox or Safari.
- [ ] `npm run validate` shows no errors.
- [ ] `npm run build` finishes without errors.
- [ ] `app.json` has a tagline, description and tags.
- [ ] You did not commit `dist/`, `_trash/`, `_backup/` or `node_modules/`.

## Commit messages

Short and clear, in the present tense: `Add paper stock options to Cutout`, `Fix export crash in Keyer`.

## Licensing of contributions

By sending a pull request you agree that your contribution is licensed under the same license as this repository (see [LICENSE](LICENSE)). Only submit work you wrote or have the right to share. If you include third-party code, tell us where it comes from and its license.

## Be kind

Be respectful and patient. We want everyone, whatever their experience, to feel welcome here. Harassment or personal attacks are not accepted.

Thank you for making Reel better.
