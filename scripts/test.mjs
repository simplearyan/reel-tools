#!/usr/bin/env node
/** npm test : runs every tests/*.test.mjs with Node's built-in test runner (no dependencies). */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'tests');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join('tests', f)) : [];
if (!files.length) { console.error('No tests found in tests/'); process.exit(1); }
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { cwd: ROOT, stdio: 'inherit' });
process.exit(r.status ?? 1);
