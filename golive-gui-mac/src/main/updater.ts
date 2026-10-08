import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { app } from 'electron';

const REPO = 'bezumiya/GoLiveBypass';
// GOLIVE_UPDATE_FEED aponta para um feed local (http://127.0.0.1) só em testes
const API_URL = process.env.GOLIVE_UPDATE_FEED
  ?? `https://api.github.com/repos/${REPO}/releases?per_page=30`;

export interface UpdateInfo {
  available: boolean;
  latestVersion?: string;
  downloadUrl?: string;
  currentVersion: string;
}

const isLocal = (u: string) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u);

/** GET com redirecionamentos; http só é aceito para localhost. */
function request(url: string, redirects = 5): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https://') ? https : isLocal(url) ? http : null;
    if (!mod) return reject(new Error(`URL não permitida: ${url}`));
    mod.get(url, {
      headers: { 'User-Agent': 'GoLiveBypass-Updater', Accept: 'application/vnd.github+json, application/octet-stream' },
      timeout: 30_000,
    }, (res) => {
      const code = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Redirecionamentos demais'));
        return resolve(request(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (code !== 200) { res.resume(); return reject(new Error(`HTTP ${code}`)); }
      resolve(res);
    }).on('error', reject).on('timeout', function (this: http.ClientRequest) { this.destroy(new Error('timeout')); });
  });
}

async function httpsGet(url: string): Promise<string> {
  const res = await request(url);
  let data = '';
  for await (const c of res) data += c.toString();
  return data;
}

export async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await request(url);
  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => file.close(() => resolve()));
    file.on('error', reject);
    res.on('error', reject);
  });
}

function semverGt(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [am, an, ap] = parse(a);
  const [bm, bn, bp] = parse(b);
  if (am !== bm) return am > bm;
  if (an !== bn) return an > bn;
  return ap > bp;
}

// Só o DMG deste app; o GoLiveBypass.dmg das releases upstream é outro produto
const ASSET_RE = /^GoLiveBypass-macos-.+-(arm64|x64|universal)\.dmg$/;

function pickAsset(assets: any[]): any | undefined {
  const mine = (assets ?? []).filter((a: any) => ASSET_RE.test(a.name));
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return mine.find((a: any) => a.name.endsWith(`-${arch}.dmg`))
      ?? mine.find((a: any) => a.name.endsWith('-universal.dmg'));
}

/** Consulta GitHub Releases estáveis e retorna info de atualização */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion();
  try {
    const releases = JSON.parse(await httpsGet(API_URL)) as any[];
    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      const asset = pickAsset(release.assets);
      if (!asset) continue;
      const latest: string = String(release.tag_name ?? '').replace(/^v/, '');
      if (!/^\d+\.\d+\.\d+$/.test(latest) || !semverGt(latest, current)) break;
      return { available: true, latestVersion: latest, downloadUrl: asset.browser_download_url, currentVersion: current };
    }
  } catch {}
  return { available: false, currentVersion: current };
}

/** Baixa a nova versão e abre o Finder para instalar */
export async function downloadAndInstall(
  downloadUrl: string,
  onProgress: (msg: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  const tmpDir = path.join(app.getPath('temp'), 'golivebypass-update');
  fs.mkdirSync(tmpDir, { recursive: true });
  const dmgPath = path.join(tmpDir, 'GoLiveBypass-update.dmg');

  try {
    onProgress('Baixando atualização…');
    await downloadFile(downloadUrl, dmgPath);
    onProgress('Abrindo instalador…');
    child_process.spawn('open', [dmgPath], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? String(e) };
  }
}
