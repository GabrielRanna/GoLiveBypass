declare const golive: any;

const toggle      = document.getElementById('toggle') as HTMLButtonElement;
const stateLabel  = document.getElementById('state-label')!;
const ipLabel     = document.getElementById('ip-label')!;
const logEl       = document.getElementById('log')!;
const protonUser  = document.getElementById('proton-user') as HTMLInputElement;
const protonPass  = document.getElementById('proton-pass') as HTMLInputElement;
const fetchBtn    = document.getElementById('fetch-btn') as HTMLButtonElement;
const importBtn   = document.getElementById('import-btn') as HTMLButtonElement;
const protonStatus = document.getElementById('proton-status')!;
const captchaHint  = document.getElementById('captcha-hint')!;
const captchaLink  = document.getElementById('captcha-link') as HTMLAnchorElement;
const vencordBtn   = document.getElementById('vencord-btn') as HTMLButtonElement;
const vencordStatus = document.getElementById('vencord-status')!;
const updateBanner  = document.getElementById('update-banner')!;
const updateMsg     = document.getElementById('update-msg')!;
const updateBtn     = document.getElementById('update-btn') as HTMLButtonElement;

let active = false;
let updateUrl = '';

function log(m: string, isErr = false) {
  const line = `[${new Date().toLocaleTimeString()}] ${m}\n`;
  logEl.textContent += line;
  if (isErr) console.error(m);
  logEl.scrollTop = logEl.scrollHeight;
}

function setState(s: 'inactive' | 'active' | 'busy' | 'unknown') {
  document.body.dataset.state = s;
  if (s === 'active') {
    stateLabel.textContent = 'Bypass ativo';
    toggle.setAttribute('aria-label', 'Desativar');
  } else if (s === 'inactive' || s === 'unknown') {
    stateLabel.textContent = s === 'unknown' ? 'Verificando…' : 'Inativo';
    toggle.setAttribute('aria-label', 'Ativar');
    ipLabel.textContent = '';
  } else {
    stateLabel.textContent = active ? 'Desativando…' : 'Ativando…';
  }
}

async function refresh() {
  try {
    const s = await golive.status();
    active = s.state === 'active';
    toggle.disabled = !(active || s.hasConfig);
    setState(s.state);
    if (!active) ipLabel.textContent = '';
    log(`[status] state=${s.state} hasConfig=${s.hasConfig}`);
  } catch (e) {
    log(`[status erro] ${e}`, true);
  }
}

// ── Toggle ────────────────────────────────────────────────────────────────────

toggle.addEventListener('click', async () => {
  log(active ? 'Desativando bypass…' : 'Ativando bypass…');
  toggle.disabled = true;
  setState('busy');

  const r = active ? await golive.deactivate() : await golive.activate();

  if (r?.error) {
    const msgs: Record<string, string> = {
      user_cancelled:    'Senha cancelada pelo usuário.',
      handshake_timeout: 'Timeout de handshake — nenhum peer respondeu em 15s.',
      binary_missing:    'Binário wg-quick não encontrado.',
      wg_failed:         'Falha ao controlar o WireGuard.',
    };
    log(`Erro: ${msgs[r.error] ?? r.error}`, true);
    await refresh();
    return;
  }

  active = !active;
  setState(active ? 'active' : 'inactive');
  if (active && r?.publicIp) ipLabel.textContent = `IP: ${r.publicIp}`;
  toggle.disabled = false;
});

// ── ProtonVPN fetch ───────────────────────────────────────────────────────────

golive.onProtonProgress?.((msg: string) => {
  protonStatus.textContent = msg;
  log(msg);
});

fetchBtn.addEventListener('click', async () => {
  const user = protonUser.value.trim();
  const pass = protonPass.value;
  if (!user || !pass) { protonStatus.textContent = 'Preencha usuário e senha.'; return; }

  captchaHint.hidden = true;
  fetchBtn.disabled = true;
  protonStatus.textContent = 'Iniciando…';

  const r = await golive.fetchProton(user, pass);

  fetchBtn.disabled = false;

  if (r.ok) {
    protonStatus.textContent = 'Servidor configurado! Você já pode ativar.';
    toggle.disabled = false;
    log('Config ProtonVPN importada com sucesso.');
    return;
  }

  if (r.error === 'captcha') {
    protonStatus.textContent = 'CAPTCHA requerido — veja abaixo.';
    captchaHint.hidden = false;
    if (r.captchaUrl) {
      captchaLink.href = r.captchaUrl;
      captchaLink.onclick = (e) => { e.preventDefault(); window.open(r.captchaUrl, '_blank'); };
    }
    return;
  }

  const errMsgs: Record<string, string> = {
    auth_failed:    'Usuário ou senha incorretos.',
    no_servers:     'Nenhum servidor free disponível agora.',
    binary_missing: 'proton-confgen não encontrado nos recursos.',
    unknown:        'Erro desconhecido — veja o log.',
  };
  protonStatus.textContent = `Erro: ${errMsgs[r.error] ?? r.error}`;
  log(`ProtonVPN erro: ${r.error}`, true);
});

// ── Importar .conf ────────────────────────────────────────────────────────────

importBtn.addEventListener('click', async () => {
  const raw = await golive.pickConf();
  if (!raw) return;
  const r = await golive.importConfig(raw);
  if (!r.ok) { log('Erro ao importar: ' + r.errors?.join(' '), true); return; }
  r.warnings?.forEach((w: string) => log('Aviso: ' + w));
  toggle.disabled = false;
  protonStatus.textContent = 'Configuração importada.';
  log('Config .conf importada com sucesso.');
});

// ── Vencord ───────────────────────────────────────────────────────────────────

golive.onVencordProgress?.((msg: string) => {
  vencordStatus.textContent = msg;
  log(`[vencord] ${msg}`);
});

async function refreshVencordStatus() {
  try {
    const r = await golive.vencordStatus();
    if (r.status === 'discord_not_found') {
      vencordStatus.textContent = 'Discord não encontrado em /Applications.';
      vencordBtn.disabled = true;
    } else if (r.status === 'installed') {
      vencordStatus.textContent = 'Vencord já instalado ✓';
      vencordBtn.textContent = 'Reinstalar Vencord';
    }
  } catch {}
}

vencordBtn.addEventListener('click', async () => {
  vencordBtn.disabled = true;
  vencordStatus.textContent = 'Instalando…';

  const r = await golive.installVencord();

  if (r.ok) {
    vencordStatus.textContent = 'Vencord instalado! FakeNitro ativado. Reinicie o Discord.';
    log('Vencord instalado com sucesso.');
  } else {
    vencordStatus.textContent = `Erro: ${r.error}`;
    log(`Vencord erro: ${r.error}`, true);
  }
  vencordBtn.disabled = false;
});

// ── Atualizações ──────────────────────────────────────────────────────────────

golive.onUpdateAvailable?.((info: any) => {
  updateMsg.textContent = `Nova versão disponível: v${info.latestVersion} (atual: v${info.currentVersion})`;
  updateBanner.hidden = false;
  updateUrl = info.downloadUrl ?? '';
});

golive.onUpdateProgress?.((msg: string) => {
  updateMsg.textContent = msg;
  log(`[update] ${msg}`);
});

updateBtn.addEventListener('click', async () => {
  if (!updateUrl) { log('URL de download não disponível.', true); return; }
  updateBtn.disabled = true;
  await golive.downloadUpdate(updateUrl);
});

// ── Notificação de segundo plano (ao fechar janela) ────────────────────────────

golive.onLog?.((m: string) => log(m));

// ── Init ──────────────────────────────────────────────────────────────────────

refresh();
refreshVencordStatus();
