import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { app } from 'electron';

const REPO = 'bezumiya/GoLiveBypass';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface UpdateInfo {
  available: boolean;
  latestVersion?: string;
  downloadUrl?: string;
  currentVersion: string;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const get = (u: string) => {
      https.get(u, {
        headers: { 'User-Agent': 'GoLiveBypass-Updater', Accept: 'application/vnd.github+json' },
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) return get(res.headers.location!);
        let data = '';
        res.on('data', (c: Buffer) => { data += c.toString(); });
        res.on('end', () => {
          if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
          else resolve(data);
        });
      }).on('error', reject);
    };
    get(url);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u: string) => {
      https.get(u, { headers: { 'User-Agent': 'GoLiveBypass-Updater' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          return get(res.headers.location!);
        }
        if (res.statusCode !== 200) { file.close(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      }).on('error', reject);
    };
    get(url);
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

/** Consulta GitHub Releases e retorna info de atualização */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion();
  try {
    const body = await httpsGet(API_URL);
    const release = JSON.parse(body);
    const latest: string = release.tag_name?.replace(/^v/, '') ?? '0.0.0';

    if (!semverGt(latest, current)) return { available: false, currentVersion: current };

    // Encontra asset DMG universal
    const asset = (release.assets as any[])?.find(
      (a: any) => /universal.*\.dmg$|\.dmg$/i.test(a.name),
    );

    return {
      available: true,
      latestVersion: latest,
      downloadUrl: asset?.browser_download_url,
      currentVersion: current,
    };
  } catch {
    return { available: false, currentVersion: current };
  }
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
