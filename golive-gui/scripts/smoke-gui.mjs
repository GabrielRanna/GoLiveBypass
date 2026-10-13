#!/usr/bin/env node
// Teste de fumaça do app empacotado (saída do `electron-builder --dir`).
//
// Abre o executável com uma pasta de dados vazia e temporária, conecta pela porta de depuração
// do Chromium e confere a janela de verdade: CSS carregado sem aninhamento acidental (o defeito
// que o #351 deixou), os ícones do topo na mesma linha, o painel "Como funciona" abrindo, nenhum
// erro de JavaScript na carga e o "iniciado" no gui.log. Não ativa o bypass: túnel, rede e o
// "Sair" com o bypass ativo continuam precisando de teste manual na máquina.
//
// Uso: node scripts/smoke-gui.mjs <executável> [--json <arquivo>]
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const exe = process.argv[2];
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
if (!exe || !fs.existsSync(exe)) {
  console.error(`executável não encontrado: ${exe ?? "(nenhum)"}`);
  process.exit(2);
}

const PORT = 9333;
const dados = fs.mkdtempSync(path.join(os.tmpdir(), "golive-smoke-"));
// settingsDirDe usa LOCALAPPDATA no Windows e XDG_DATA_HOME nos demais; o perfil do Electron (userData)
// usa APPDATA e XDG_CONFIG_HOME. Todos apontam para a pasta vazia: o teste não encosta numa instalação
// de verdade da máquina, nem na trava de instância única dela.
const env = { ...process.env, LOCALAPPDATA: dados, APPDATA: dados, XDG_DATA_HOME: dados, XDG_CONFIG_HOME: dados, ELECTRON_ENABLE_LOGGING: "1" };
const args = [`--remote-debugging-port=${PORT}`, ...(process.platform === "linux" ? ["--no-sandbox"] : [])];
const child = spawn(exe, args, { env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
let saida = "";
child.stdout.on("data", (d) => { saida += d; });
child.stderr.on("data", (d) => { saida += d; });
let saiu = null;
child.on("exit", (code, signal) => { saiu = { code, signal }; });

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const conferir = (nome, ok, detalhe) => checks.push({ nome, ok: Boolean(ok), detalhe });

function encerrar() {
  if (saiu) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else { try { process.kill(-child.pid, "SIGKILL"); } catch { /* já saiu */ } }
}

async function paginaPrincipal() {
  for (let i = 0; i < 90; i++) {
    if (saiu) throw new Error(`o app saiu antes de abrir a janela (${JSON.stringify(saiu)})`);
    try {
      const lista = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const alvo = lista.find((t) => t.type === "page" && /index\.html/.test(t.url));
      if (alvo) return alvo;
    } catch { /* porta ainda fechada */ }
    await dormir(1000);
  }
  throw new Error("a janela principal não apareceu em 90 s");
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pendentes = new Map();
  const eventos = [];
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(String(m.data));
    if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg); pendentes.delete(msg.id); }
    else if (msg.method) eventos.push(msg);
  });
  const aberto = new Promise((ok, erro) => { ws.addEventListener("open", ok); ws.addEventListener("error", erro); });
  const enviar = async (method, params = {}) => {
    await aberto;
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    return new Promise((ok) => pendentes.set(n, ok));
  };
  return { enviar, eventos, fechar: () => ws.close() };
}

// Roda dentro da janela: tudo que dá para ver sem ativar o bypass.
const INSPECAO = `(async () => {
  const r = {};
  r.readyState = document.readyState;
  const topo = [];
  let total = 0;
  for (const s of document.styleSheets) {
    let regras;
    try { regras = s.cssRules; } catch { continue; }
    total += regras.length;
    for (const x of regras) if (x.selectorText) topo.push(x.selectorText);
  }
  r.cssRules = total;
  // Começa pelo seletor, sem pai na frente: com a chave faltando, o bundler pode achatar o
  // aninhamento em ".pai .traffic-card", que "contém" o nome mas não vale para a página.
  const noTopo = (sel) => topo.some((s) => s.split(",").some((p) => p.trim().startsWith(sel)));
  r.trafficCardTopo = noTopo(".traffic-card");
  r.guidePanelTopo = noTopo(".guide-panel");
  const caixa = (id) => {
    const e = document.getElementById(id);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) };
  };
  r.icones = Object.fromEntries(["settingsBtn", "guideBtn", "checkUpdatesBtn", "bugBtn"].map((i) => [i, caixa(i)]));
  r.versao = document.getElementById("appVersion")?.textContent ?? null;
  r.botao = document.getElementById("btnText")?.textContent ?? null;
  r.largura = window.innerWidth;
  document.getElementById("guideBtn")?.click();
  await new Promise((ok) => setTimeout(ok, 1000));
  const painel = document.querySelector(".guide-panel");
  const cp = painel ? painel.getBoundingClientRect() : null;
  r.guiaVisivel = !!painel && cp.height > 0 && cp.width > 0 && getComputedStyle(painel).visibility !== "hidden";
  return JSON.stringify(r);
})()`;

let relatorio = { checks, plataforma: process.platform };
try {
  const alvo = await paginaPrincipal();
  const s = cdp(alvo.webSocketDebuggerUrl);
  await s.enviar("Runtime.enable");
  await s.enviar("Log.enable");
  await s.enviar("Page.enable");
  // Recarrega com o Runtime ligado para pegar qualquer exceção da carga da página.
  await s.enviar("Page.reload", { ignoreCache: true });
  await dormir(6000);
  const resp = await s.enviar("Runtime.evaluate", { expression: INSPECAO, awaitPromise: true, returnByValue: true });
  const r = JSON.parse(resp.result?.result?.value ?? "{}");
  relatorio.janela = r;
  const excecoes = s.eventos.filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.exceptionDetails?.text);
  const errosConsole = s.eventos
    .filter((e) => (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") || (e.method === "Log.entryAdded" && e.params.entry.level === "error"))
    .map((e) => e.params.entry?.text ?? e.params.args?.map((a) => a.value ?? a.description).join(" "));
  relatorio.excecoes = excecoes;
  relatorio.errosConsole = errosConsole;
  s.fechar();

  conferir("página carregada", r.readyState === "complete", r.readyState);
  conferir("CSS carregado", r.cssRules > 50, `${r.cssRules} regras`);
  conferir("regras do #351 no nível de cima do CSS (sem chave faltando)", r.trafficCardTopo && r.guidePanelTopo, { trafficCard: r.trafficCardTopo, guidePanel: r.guidePanelTopo });
  // "Checar updates" só existe no Windows (src/main.ts esconde nos demais): fora dele, conferir que sumiu.
  const comUpdates = process.platform === "win32";
  const canto = ["settingsBtn", "guideBtn", ...(comUpdates ? ["checkUpdatesBtn"] : [])].map((i) => r.icones?.[i]);
  conferir("ícones do topo existem e têm tamanho", canto.every((c) => c && c.w > 0 && c.h > 0), r.icones);
  conferir("ícones do topo na mesma linha", canto.every((c) => c && Math.abs(c.top - canto[0].top) <= 3), canto.map((c) => c?.top));
  if (!comUpdates) conferir("Checar updates escondido fora do Windows", (r.icones?.checkUpdatesBtn?.w ?? 0) === 0, r.icones?.checkUpdatesBtn);
  conferir("painel Como funciona abre", r.guiaVisivel, r.guiaVisivel);
  conferir("versão aparece na janela", !!r.versao, r.versao);
  conferir("sem exceção de JavaScript na carga", excecoes.length === 0, excecoes);
} catch (e) {
  conferir("app abre e mostra a janela", false, String(e?.message ?? e));
}

await dormir(1000);
const log = path.join(dados, "GoLiveBypass", "logs", "gui.log");
const textoLog = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
conferir("gui.log registra o início", /iniciado/.test(textoLog), fs.existsSync(log) ? `${textoLog.length} bytes` : "sem gui.log");
conferir("app continua aberto até o fim do teste", !saiu, saiu);
relatorio.gui_log_fim = textoLog.split(/\r?\n/).slice(-25);
relatorio.saida_fim = saida.split(/\r?\n/).slice(-25);
encerrar();

const falhas = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? "ok  " : "FALHA"} ${c.nome}${c.ok ? "" : `: ${JSON.stringify(c.detalhe)}`}`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(relatorio, null, 2));
try { fs.rmSync(dados, { recursive: true, force: true }); } catch { /* arquivo preso no Windows */ }
process.exit(falhas.length ? 1 : 0);
