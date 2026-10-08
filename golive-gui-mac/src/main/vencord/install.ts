import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import * as https from 'https';
import { promisify } from 'util';

const execFile = promisify(child_process.execFile);

/** Encontra o diretório de recursos do Discord instalado */
function findDiscordApp(): string | null {
  const candidates = [
    '/Applications/Discord.app',
    `${process.env.HOME}/Applications/Discord.app`,
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u: string) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          return get(res.headers.location!);
        }
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      }).on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
    };
    get(url);
  });
}

export type VencordStatus =
  | 'not_installed'
  | 'installed'
  | 'discord_not_found';

export function vencordStatus(): VencordStatus {
  const discord = findDiscordApp();
  if (!discord) return 'discord_not_found';
  // Vencord injeta um loader em app/app.asar — verifica presença de patcher
  const patchMarker = path.join(discord, 'Contents/Resources/app/package.json');
  if (fs.existsSync(patchMarker)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(patchMarker, 'utf8'));
      if (pkg.name === 'vencord' || pkg._vencord) return 'installed';
    } catch {}
  }
  return 'not_installed';
}

export type VencordInstallProgress = { step: string };
export type VencordInstallResult =
  | { ok: true }
  | { ok: false; error: string };

/** Instala o Vencord e activa o FakeNitro via instalador oficial CLI */
export async function installVencord(
  tmpDir: string,
  onProgress: (p: VencordInstallProgress) => void,
): Promise<VencordInstallResult> {
  const discord = findDiscordApp();
  if (!discord) return { ok: false, error: 'Discord não encontrado em /Applications.' };

  // URL do instalador CLI do Vencord para macOS arm64/x64
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const installerUrl =
    `https://github.com/Vendicated/VencordInstaller/releases/latest/download/VencordInstaller-macos-${arch}`;

  const installerPath = path.join(tmpDir, 'VencordInstaller');

  try {
    onProgress({ step: 'Baixando instalador do Vencord…' });
    await downloadFile(installerUrl, installerPath);
    fs.chmodSync(installerPath, 0o755);

    onProgress({ step: 'Instalando Vencord no Discord…' });
    const r = await execFile(installerPath, ['--install-stable'], {
      timeout: 120_000,
      encoding: 'utf8',
    }).catch((e: any) => ({ stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code }));

    const out = (r as any).stdout + (r as any).stderr;
    if ((r as any).code !== 0 && (r as any).code != null) {
      return { ok: false, error: `Instalador falhou: ${out.slice(0, 300)}` };
    }

    onProgress({ step: 'Ativando FakeNitro…' });
    await enableFakeNitro();

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? String(e) };
  }
}

/** Escreve FakeNitro na lista de plugins habilitados do Vencord */
async function enableFakeNitro(): Promise<void> {
  const settingsDir = path.join(
    process.env.HOME!,
    'Library/Application Support/Vencord/settings',
  );
  const settingsFile = path.join(settingsDir, 'settings.json');

  let settings: any = {};
  try {
    if (fs.existsSync(settingsFile)) {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
  } catch {}

  if (!settings.enabledPlugins) settings.enabledPlugins = [];
  if (!settings.enabledPlugins.includes('FakeNitro')) {
    settings.enabledPlugins.push('FakeNitro');
  }

  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}
