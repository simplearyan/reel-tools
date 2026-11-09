#!/usr/bin/env node
/** npm run doctor : checks that this machine and repo are ready to build and deploy. */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (c) => { try { return execSync(c, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const has = (f) => fs.existsSync(path.join(ROOT, f));
let bad = 0;
const check = (ok, good, hint) => { console.log(`${ok ? '  ok ' : ' FIX '}  ${ok ? good : hint}`); if (!ok) bad++; };

check(+process.versions.node.split('.')[0] >= 18, `Node ${process.versions.node}`, `Node ${process.versions.node} is too old; install Node 18 or newer from nodejs.org`);
const git = run('git --version');
check(!!git, git, 'git is not installed; get it from git-scm.com');
check(has('.git'), 'this folder is a git repository', 'run: git init');
if (has('.git')) check(!!run('git remote get-url origin'), `remote origin: ${run('git remote get-url origin')}`, 'no GitHub remote; run: git remote add origin https://github.com/YOU/reel.git');
let site = {}; try { site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8')); } catch { /* reported below */ }
check(!!site.name, 'site.json found', 'site.json is missing or not valid JSON');
check(!/YOUR-NAME/.test(`${site.url} ${site.github}`), `site url: ${site.url}`, 'site.json still has YOUR-NAME in url and github');
check(has('LICENSE') || has('LICENSE.md') || has('LICENSE.txt'), 'LICENSE file present', 'add a LICENSE file in the repo root');
check(has('about.md') || has('README.md'), 'about page source present', 'add about.md in the repo root');
for (const f of ['scripts/build.mjs', 'scripts/dev.mjs', 'scripts/admin.mjs', 'shared/home.template.html', 'shared/head.html', 'shared/seo.mjs', 'shared/admin.html', '.github/workflows/deploy.yml']) check(has(f), f, `missing ${f}; run: npm run layout -- --from <folder with the unzipped update>`);
const apps = has('apps') ? fs.readdirSync(path.join(ROOT, 'apps'), { withFileTypes: true }).filter((d) => d.isDirectory()).length : 0;
check(apps > 0, `${apps} apps in apps/`, 'apps/ is empty; run npm run organize "<your messy folder>"');
check(!site.adsenseClient || /^ca-pub-\d+$/.test(site.adsenseClient), site.adsenseClient ? `AdSense: ${site.adsenseClient}` : 'AdSense not set (optional)', 'adsenseClient should look like ca-pub-1234567890123456');
console.log(bad ? `\n${bad} thing(s) to fix.` : '\nAll good. Try: npm run dev');
