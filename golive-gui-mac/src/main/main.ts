import {
  app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, powerMonitor,
} from 'electron';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { makeRouter } from './ipc';
import { importConfig, readConfigState } from './config/store';
import { configPath, settingsPath, sessionDir, appDataDir } from './paths';
import { readDefaultRoute, publicIp } from './tunnel/collect';
import { deriveStateFromRoute } from './tunnel/status';
import { restartDiscord } from './discord/restart';
import { primaryService } from './net/ipv6';
import { activate } from './tunnel/up';
import { deactivate } from './tunnel/down';
import { runActivation, runDeactivation } from './tunnel/activation';
import { ProtonFetcher } from './proton/fetch';
import { installVencord, vencordStatus } from './vencord/install';
import { checkForUpdate, downloadAndInstall } from './updater';
import type { AppSettings, TunnelState } from '../shared/types';

const home   = os.homedir();
const user   = os.userInfo().username;
const binDir = path.join(process.resourcesPath ?? path.join(__dirname, '../../resources'), 'bin');
const IFACE  = 'golive';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let tunnelActive = false;

// ─── Persistência de estado ──────────────────────────────────────────────────

function loadSettings(): AppSettings {
  try {
    const p = settingsPath(home);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return {};
}

function saveSettings(patch: Partial<AppSettings>): void {
  try {
    fs.mkdirSync(appDataDir(home), { recursive: true });
    const prev = loadSettings();
    fs.writeFileSync(settingsPath(home), JSON.stringify({ ...prev, ...patch }, null, 2));
  } catch {}
}

// ─── Config WireGuard ────────────────────────────────────────────────────────

let needsIpv6Off = false;

function refreshConfigState() {
  const p = configPath(home);
  const state = readConfigState({ read: () => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null) });
  needsIpv6Off = state.needsIpv6Off;
  return state;
}

async function activationOpts() {
  const service = await primaryService();
  return { home, user, binDir, service, setV6Off: needsIpv6Off };
}

// ─── Shutdown gracioso (#1) ──────────────────────────────────────────────────

async function deactivateBeforeQuit(): Promise<void> {
  if (!tunnelActive) return;
  try {
    const opts = await activationOpts();
    await runDeactivation(opts);
    tunnelActive = false;
    saveSettings({ lastTunnelState: 'inactive' });
  } catch {}
}

// ─── Tray ────────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: tunnelActive ? 'Bypass: ATIVO' : 'Bypass: inativo',
      enabled: false,
    },
    { type: 'separator' },
    { label: 'Abrir janela', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: 'Sair',
      click: async () => {
        isQuitting = true;
        await deactivateBeforeQuit();
        app.quit();
      },
    },
  ]);
}

function updateTray() {
  tray?.setContextMenu(buildTrayMenu());
  tray?.setToolTip(tunnelActive ? 'GoLiveBypass — ATIVO' : 'GoLiveBypass');
}

function createTray() {
  const iconPath = path.join(__dirname, '../../resources', 'icon-tray.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.on('click', () => mainWindow?.show());
  updateTray();
}

// ─── Janela principal ────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 560,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Fechar esconde para tray, não encerra o app
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

const protonFetcher = new ProtonFetcher();

const handlers = {
  async importConfig({ rawText }: { rawText: string }) {
    const r = importConfig(rawText, {
      configPath: () => configPath(home),
      mkdirp: (p: string) => fs.mkdirSync(p, { recursive: true, mode: 0o700 }),
      write: (p: string, data: string, mode: number) => { fs.writeFileSync(p, data, { mode }); fs.chmodSync(p, mode); },
    });
    if (r.ok) needsIpv6Off = r.needsIpv6Off ?? false;
    return r;
  },

  async activate() {
    const opts = await activationOpts();
    const r = await activate({
      opts,
      restartDiscord,
      publicIp,
    });
    if (!('error' in r)) {
      tunnelActive = true;
      saveSettings({ lastTunnelState: 'active' });
      updateTray();
    }
    return r;
  },

  async deactivate() {
    const opts = await activationOpts();
    const r = await deactivate({ opts, restartDiscord });
    if (!('error' in r)) {
      tunnelActive = false;
      saveSettings({ lastTunnelState: 'inactive' });
      updateTray();
    }
    return r;
  },

  async status() {
    const state = deriveStateFromRoute(await readDefaultRoute());
    tunnelActive = state === 'active';
    return { state, hasConfig: refreshConfigState().hasConfig };
  },

  async fetchProton({ username, password }: { username: string; password: string }) {
    return new Promise<object>((resolve) => {
      const confOut = configPath(home);
      fs.mkdirSync(appDataDir(home), { recursive: true });

      protonFetcher.removeAllListeners();

      protonFetcher.on('progress', (msg: string) => {
        mainWindow?.webContents.send('proton:progress', msg);
      });

      protonFetcher.on('done', (result: object) => {
        resolve(result);
      });

      protonFetcher.fetch({
        username,
        password,
        binDir,
        sessDir: sessionDir(home),
        confOut,
      });
    });
  },

  async installVencord() {
    const tmpDir = app.getPath('temp');
    return installVencord(tmpDir, (p) => {
      mainWindow?.webContents.send('vencord:progress', p.step);
    });
  },

  async vencordStatus() {
    return { status: vencordStatus() };
  },

  async checkUpdate() {
    return checkForUpdate();
  },

  async downloadUpdate({ url }: { url: string }) {
    return downloadAndInstall(url, (msg) => {
      mainWindow?.webContents.send('update:progress', msg);
    });
  },
};

const router = makeRouter(handlers as any);

// ─── Inicialização ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  refreshConfigState();
  createTray();
  createWindow();

  ipcMain.handle('golive', (_e, channel: string, payload: unknown) => router(channel, payload));
  ipcMain.handle('golive:pick-conf', async () => {
    const r = await dialog.showOpenDialog({
      filters: [{ name: 'WireGuard', extensions: ['conf'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return fs.readFileSync(r.filePaths[0], 'utf8');
  });

  // Auto-reconnect: restaura último estado
  const { lastTunnelState } = loadSettings();
  if (lastTunnelState === 'active' && refreshConfigState().hasConfig) {
    setTimeout(async () => {
      mainWindow?.webContents.send('log', 'Auto-reconectando bypass…');
      try {
        await handlers.activate();
      } catch {}
    }, 1500);
  }

  // Verifica atualizações em segundo plano
  checkForUpdate().then((info) => {
    if (info.available) {
      mainWindow?.webContents.send('update:available', info);
    }
  }).catch(() => {});
});

// ─── Shutdown gracioso ────────────────────────────────────────────────────────

app.on('before-quit', async (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  await deactivateBeforeQuit();
  app.quit();
});

// Detecta suspensão / desligamento do sistema
powerMonitor.on('shutdown', async () => {
  await deactivateBeforeQuit();
});

powerMonitor.on('suspend', async () => {
  // Derruba o túnel ao suspender para evitar leak de estado
  if (tunnelActive) {
    try {
      const opts = await activationOpts();
      await runDeactivation(opts);
      tunnelActive = false;
      saveSettings({ lastTunnelState: 'inactive' });
      updateTray();
    } catch {}
  }
});

app.on('window-all-closed', () => {
  // No macOS, manter vivo no tray
});

app.on('activate', () => {
  mainWindow?.show();
});
