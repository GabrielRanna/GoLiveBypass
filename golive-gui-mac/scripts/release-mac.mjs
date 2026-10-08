// Publica a release macOS com make_latest=false e falha se qualquer regra de
// scripts/release-guard.mjs não for cumprida, antes ou depois de publicar.
//
// Uso: node scripts/release-mac.mjs --repo bezumiya/GoLiveBypass --notes-file notas.md [--draft]
//      [--dmg dist-build/GoLiveBypass-macos-<versão>-universal.dmg] [--target <commit>]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  createPayload, dmgName, postflightErrors, preflightErrors, publishPayload, releaseTag,
} from './release-guard.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const flag = name => process.argv.includes(`--${name}`);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}
const gh = (args, input) => run('gh', args, input === undefined ? {} : { input });
const sha256 = p => createHash('sha256').update(readFileSync(p)).digest('hex');
function fail(errors) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}

function inspectDmg(dmg) {
  const mount = mkdtempSync(path.join(tmpdir(), 'glb-dmg-'));
  run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg]);
  try {
    const res = path.join(mount, 'GoLiveBypass.app', 'Contents', 'Resources');
    const asar = require('@electron/asar');
    const pkg = JSON.parse(asar.extractFile(path.join(res, 'app.asar'), 'package.json').toString('utf8'));
    const pcDir = path.join(res, 'extra', 'proton-confgen');
    const manifest = JSON.parse(readFileSync(path.join(pcDir, 'proton-confgen-manifest.json'), 'utf8'));
    return {
      version: pkg.version,
      updateRepo: pkg.updateRepo,
      protonSha: sha256(path.join(pcDir, 'proton-confgen')),
      protonManifestSha: manifest?.universal?.sha256,
    };
  } finally {
    run('hdiutil', ['detach', mount, '-quiet']);
  }
}

async function latestTag(repo) {
  const r = spawnSync('gh', ['api', `repos/${repo}/releases/latest`, '--jq', '.tag_name'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const repo = arg('repo');
const notesFile = arg('notes-file');
const dmg = path.resolve(arg('dmg', path.join(root, 'dist-build', dmgName(version))));
const target = arg('target', run('git', ['rev-parse', 'HEAD'], { cwd: root }));
const tag = releaseTag(version);

if (!notesFile || !existsSync(notesFile)) fail(['--notes-file é obrigatório']);
const files = {};
if (existsSync(dmg)) {
  const sidecar = `${dmg}.sha256`;
  writeFileSync(sidecar, `${sha256(dmg)}  ${path.basename(dmg)}\n`);
  files[path.basename(dmg)] = dmg;
  files[path.basename(sidecar)] = sidecar;
}
const bundled = files[dmgName(version)] ? inspectDmg(dmg) : null;
const pre = preflightErrors({ version, repo, files, bundled });
const existing = spawnSync('gh', ['api', `repos/${repo}/releases/tags/${tag}`], { encoding: 'utf8' });
if (existing.status === 0) pre.push(`a release ${tag} já existe em ${repo}`);
if (pre.length) fail(pre);

const latestBefore = await latestTag(repo);
const body = { ...createPayload({ version, target, notes: readFileSync(notesFile, 'utf8') }) };
const created = JSON.parse(gh(['api', '-X', 'POST', `repos/${repo}/releases`, '--input', '-'], JSON.stringify(body)));
console.log(`release ${tag} criada como draft (id ${created.id})`);
gh(['release', 'upload', tag, ...Object.values(files), '--repo', repo]);
if (!flag('draft')) {
  gh(['api', '-X', 'PATCH', `repos/${repo}/releases/${created.id}`, '--input', '-'], JSON.stringify(publishPayload()));
}

const release = JSON.parse(gh(['api', `repos/${repo}/releases/${created.id}`]));
const latestAfter = await latestTag(repo);
const post = postflightErrors({ version, release, latestTagBefore: latestBefore, latestTagAfter: latestAfter, dmgSha256: sha256(dmg) });
if (post.length) {
  // Devolve a latest para quem era antes; a release macOS fica como está para inspeção
  if (latestAfter !== latestBefore && latestBefore) {
    const prev = JSON.parse(gh(['api', `repos/${repo}/releases/tags/${latestBefore}`]));
    gh(['api', '-X', 'PATCH', `repos/${repo}/releases/${prev.id}`, '--input', '-'], JSON.stringify({ make_latest: 'true' }));
    post.push(`latest devolvida para ${latestBefore}`);
  }
  fail(post);
}
console.log(`✓ ${release.html_url} (${flag('draft') ? 'draft' : 'publicada'}); latest continua ${latestAfter ?? 'nenhuma'}`);
