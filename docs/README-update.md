# How to install this update safely

1. Unzip it anywhere (for example D:\Code\reel-update).
2. In your repo (D:\Code\reel) run:

       node D:\Code\reel-update\layout.mjs --from D:\Code\reel-update

   It puts every file in its right folder, backs up anything it replaces in _backup\, never overwrites
   site.json, about.md, LICENSE or apps\, keeps your package.json and only updates its scripts.
3. Run `npm run doctor`, then `npm run dev`.

To check the folder layout any time: `npm run layout -- --dry`
