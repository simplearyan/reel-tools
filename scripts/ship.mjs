#!/usr/bin/env node
/**
 * npm run ship "what changed"      validate, build, commit and push (GitHub then deploys)
 * npm run ship "msg" -- --dry      show what it would do, change nothing
 * npm run ship "msg" -- --no-push  commit but do not push
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry'), NOPUSH = argv.includes('--no-push');
const msg = argv.filter((a) => !a.startsWith('--')).join(' ') || 'update';
const out = (c) => { try { return execSync(c, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const run = (c) => { console.log('> ' + c); if (!DRY) execSync(c, { cwd: ROOT, stdio: 'inherit' }); };

if (!out('git rev-parse --is-inside-work-tree')) { console.error('This folder is not a git repository. Run: git init'); process.exit(1); }
try { run('node scripts/validate.mjs'); run('node scripts/build.mjs'); } catch { console.error('\nStopped: fix the errors above, then run ship again.'); process.exit(1); }
if (!out('git status --porcelain') && !DRY) { console.log('Nothing to commit.'); process.exit(0); }
run('git add -A');
run(`git commit -m ${JSON.stringify(msg)}`);
if (NOPUSH) { console.log('Committed. Skipped push (--no-push).'); process.exit(0); }
if (!out('git remote get-url origin')) { console.log('Committed. No remote set, so nothing was pushed. Run: git remote add origin <your repo url>'); process.exit(0); }
run('git push -u origin HEAD');
console.log('\nPushed. GitHub Actions will build and deploy in a minute or two.');
