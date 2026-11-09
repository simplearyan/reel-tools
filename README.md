# Reel

**Small, free tools for making animation, video and sound. One HTML file each.**

[Live site](https://simplearyan.github.io/reel) · [Where it all started](https://github.com/simplearyan/studio-pro) · [Support on Ko-fi](https://ko-fi.com/simplearyan)

Reel is a family of creative tools that run in your browser. There is nothing to install, no account to make and no build step to run. Open a tool and start making.

## The story

Reel started as a pile of experiments.

Over many months I built separate tools for animation, video editing and sound editing, each one testing a different idea. They all began in one repository, [studio-pro](https://github.com/simplearyan/studio-pro), and that repository grew by accident, one experiment at a time.

Now they are being rebranded, redesigned and reorganised as clean, production-ready tools under one name. Every tool is still independent and still a single HTML file, but they share one look, one structure and one home, so they are easier to use, learn from and improve.

## A few of the tools

| Tool | What it does |
|---|---|
| **Reel Studio** | Video editor with built-in markup and motion code |
| **Reel Canvas** | HTML animation to video |
| **Reel Cutout** | Paper-cutout and card animation with video export |
| **Reel Relight** | Relight photos and clips |
| **Reel Keyer** | Remove video backgrounds |
| **Reel Wave** | Sound editing in the browser |
| **Reel Sound** | Sound effects generator |
| **Reel Cover** | Thumbnails and covers for your Reel videos |
| **Reel Parallax** | Layered depth scenes |

The [live site](https://simplearyan.github.io/reel) always has the full, current list.

## Why one file per tool?

Download a tool, open it, edit it, fork it. Nothing is hidden and nothing needs installing, so every tool is easy to understand and easy to improve. Shared things such as the page title, favicon, search tags and ads are added when the site is built, so no tool has to repeat them.

## How this repo works

```
apps/<name>/index.html      the tool itself (the latest version)
apps/<name>/app.json        its name, tagline, description and tags
apps/<name>/versions/       older versions: v1.html, v2.html ...
shared/                     the home page, shared <head>, SEO and the dev dashboard
scripts/                    the Node scripts that build, preview and tidy the site
site.json                   site-wide settings (URL, links, ads, analytics)
about.md                    the text of the About page
```

`npm run build` turns `apps/` into the finished site in `dist/`, and a GitHub Action publishes it to GitHub Pages on every push to `main`.

## Getting started

You need [Node.js](https://nodejs.org) 18 or newer. There are no packages to install.

```
git clone https://github.com/simplearyan/reel.git
cd reel
npm run dev
```

`npm run dev` builds the site, opens a live preview at http://localhost:3000 and rebuilds when you save a file. `npm run admin` opens the same preview with the **Reel Dev** dashboard, where you can edit, hide, reorder and delete tools without touching files.

| Command | What it does |
|---|---|
| `npm run dev` | Live preview |
| `npm run admin` | Live preview with the Reel Dev dashboard |
| `npm run build` | Build the site into `dist/` |
| `npm run new my-tool "My Tool"` | Start a new tool |
| `npm run archive my-tool` | Save the current file as an older version before you change it |
| `npm run list` | Table of every tool |
| `npm run validate` | Check tools and site settings |
| `npm run doctor` | Check that your setup is ready |
| `npm run init` | Fill in missing `app.json` fields |
| `npm run organize "<folder>"` | Sort a messy folder of saved HTML files into `apps/` |
| `npm run layout` | Put every repo file in its correct folder |
| `npm run ship "message"` | Validate, build, commit and push |

## Adding a tool

1. Run `npm run new my-tool "My Tool"`.
2. Build it inside `apps/my-tool/index.html`. Keep it one self-contained file.
3. Fill in the tagline, description and tags in `apps/my-tool/app.json`.
4. Run `npm run dev` to try it, then open a pull request.

Please do not add your own `<title>`, description, favicon, ad or analytics tags. The build adds them.

## Contributing

New tool ideas, bug fixes and polish are all welcome. Open an issue to talk about an idea first, or send a pull request.

## Deploying

The workflow in `.github/workflows/deploy.yml` builds and deploys to GitHub Pages. In your repository settings, go to **Pages** and set the source to **GitHub Actions**. Replace the placeholder URLs in `site.json` with your own.

## Support

Reel is free and open source. If it helps you make something, you can support it on [Ko-fi](https://ko-fi.com/simplearyan).

## License

MPL-2.0 license. See [LICENSE](LICENSE).
