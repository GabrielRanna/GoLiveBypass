import {
  app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, powerMonitor,
} from 'electron';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { makeRouter } from './ipc';
import { importConfig, readConfigState } from './config/store';
import { configPath, settingsPath, sessionDir, appDataDir } from './paths';
import { readDefaultRoute, publicIp, exitInfo } from './tunnel/collect';
import { deriveStateFromRoute } from './tunnel/status';
import { restartDiscord } from './discord/restart';
import { defaultDiscordCandidates, pickDiscordPath } from './discord/locate';
import { injectVencord, AppManagementDenied, canModifyApp } from './vencord/inject';
import { shell } from 'electron';
import { activate } from './tunnel/up';
import { deactivate } from './tunnel/down';
import { runActivation, runDeactivation } from './tunnel/activation';
import { ProtonFetcher } from './proton/fetch';
import { readSavedAccount, clearSavedAccount } from './proton/account';
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

function readStoredConf(): string | null {
  const p = configPath(home);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function refreshConfigState() {
  return readConfigState({ read: readStoredConf });
}

async function activationOpts() {
  return { home, user, binDir };
}

function sendToWindow(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function storeConfig(rawText: string) {
  return importConfig(rawText, {
    configPath: () => configPath(home),
    mkdirp: (p: string) => fs.mkdirSync(p, { recursive: true, mode: 0o700 }),
    write: (p: string, data: string, mode: number) => { fs.writeFileSync(p, data, { mode }); fs.chmodSync(p, mode); },
  });
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
    { label: 'Abrir janela', click: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show(); } },
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
  tray.on('click', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show(); });
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

// ─── Vencord ─────────────────────────────────────────────────────────────────

const APP_MANAGEMENT_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles';

function discordAppPath(): string | null {
  return pickDiscordPath(defaultDiscordCandidates(home).map(p => ({ path: p, exists: fs.existsSync(p) })));
}

type InjectOutcome = 'ok' | 'needs_permission' | 'no_discord' | 'failed';

async function tryInjectVencord(): Promise<InjectOutcome> {
  const discordApp = discordAppPath();
  if (!discordApp) { sendToWindow('log', 'Discord não encontrado; Vencord não injetado.'); return 'no_discord'; }
  try {
    await injectVencord({
      home, discordApp, cacheDir: path.join(appDataDir(home), 'vencord'),
      log: m => sendToWindow('log', m),
    });
    sendToWindow('vencord:permission', { granted: true });
    return 'ok';
  } catch (e: any) {
    if (e instanceof AppManagementDenied) {
      sendToWindow('log', 'O macOS precisa liberar o GoLiveBypass em Gerenciamento de Apps para alterar o Discord.');
      sendToWindow('vencord:permission', { granted: false });
      return 'needs_permission';
    }
    sendToWindow('log', `Falha ao injetar Vencord: ${e?.message ?? e}`);
    return 'failed';
  }
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

const protonFetcher = new ProtonFetcher();

const handlers = {
  async importConfig({ rawText }: { rawText: string }) {
    return storeConfig(rawText);
  },

  async activate() {
    const opts = await activationOpts();
    const r = await activate({
      opts,
      // Injeta antes do restart para o Discord já subir com o Vencord
      restartDiscord: async () => { await tryInjectVencord(); await restartDiscord(); },
      publicIp,
    });
    if ('error' in r) sendToWindow('log', `Falha ao ativar: ${r.error}${r.detail ? ` — ${r.detail}` : ''}`);
    else {
      tunnelActive = true;
      saveSettings({ lastTunnelState: 'active' });
      updateTray();
    }
    return r;
  },

  async deactivate() {
    const opts = await activationOpts();
    const r = await deactivate({ opts, restartDiscord });
    if ('error' in r) sendToWindow('log', `Falha ao desativar: ${r.error}${r.detail ? ` — ${r.detail}` : ''}`);
    else {
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

  async fetchProton({ username, password }: { username: string; password?: string }) {
    return new Promise<object>((resolve) => {
      fs.mkdirSync(appDataDir(home), { recursive: true, mode: 0o700 });
      const confOut = path.join(appDataDir(home), 'proton-raw.conf');

      protonFetcher.removeAllListeners();

      protonFetcher.on('progress', (msg: string) => {
        sendToWindow('proton:progress', msg);
      });

      protonFetcher.on('done', (result: { ok: boolean }) => {
        if (!result.ok) return resolve(result);
        try {
          // O conf do Proton vem full-tunnel; passa pela reescrita split tunnel
          const stored = storeConfig(fs.readFileSync(confOut, 'utf8'));
          resolve(stored.ok ? result : { ok: false, error: stored.errors.join(' ') });
        } catch (e: any) {
          resolve({ ok: false, error: String(e?.message ?? e) });
        } finally {
          fs.rmSync(confOut, { force: true });
        }
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

  async vencordPermission() {
    const discordApp = discordAppPath();
    return { granted: discordApp ? canModifyApp(discordApp) : false };
  },

  async vencordOpenSettings() {
    await shell.openExternal(APP_MANAGEMENT_PANE);
    return { ok: true };
  },

  async vencordRetry() {
    const outcome = await tryInjectVencord();
    if (outcome === 'ok' && tunnelActive) await restartDiscord();
    return { outcome };
  },

  async exitInfo() {
    return exitInfo();
  },

  async protonAccount() {
    return readSavedAccount(sessionDir(home));
  },

  async protonLogout() {
    clearSavedAccount(sessionDir(home));
    return { ok: true };
  },

  async checkUpdate() {
    return checkForUpdate();
  },

  async downloadUpdate({ url }: { url: string }) {
    return downloadAndInstall(url, (msg) => {
      sendToWindow('update:progress', msg);
    });
  },
};

const router = makeRouter(handlers as any);

// ─── Inicialização ────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
});

app.whenReady().then(async () => {
  // Confs gravados por versões anteriores podem estar full-tunnel: normaliza
  const stored = readStoredConf();
  if (stored && /AllowedIPs\s*=.*(0\.0\.0\.0\/0|::\/0)/i.test(stored)) storeConfig(stored);
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

  // powerMonitor só pode ser usado depois de app.whenReady()
  powerMonitor.on('shutdown', async () => {
    await deactivateBeforeQuit();
  });

  powerMonitor.on('suspend', async () => {
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

  // Auto-reconnect: restaura último estado
  const { lastTunnelState } = loadSettings();
  if (lastTunnelState === 'active' && refreshConfigState().hasConfig) {
    setTimeout(async () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log', 'Auto-reconectando bypass…');
      }
      try {
        await handlers.activate();
      } catch {}
    }, 1500);
  }

  // Verifica atualizações em segundo plano
  checkForUpdate().then((info) => {
    if (info.available && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:available', info);
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

app.on('window-all-closed', () => {
  // No macOS, manter vivo no tray
});

app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
});
