import fs from "node:fs";
import { execFile, execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn(), execSync: vi.fn(), execFileSync: vi.fn() }));

import { stopWireSockService } from "../electron/wiresock";
import { inspectGuiWireSockOwnership } from "../electron/wiresock-ownership";

const CONFIG = String.raw`C:\Users\teste\AppData\Local\GoLiveBypass\wiresock-discord.conf`;
const ownCommand = `"C:\\WireSock\\wiresock-client.exe" run -config "${CONFIG}"`;
const service = (command: string | null = ownCommand, state = "Running", processId = 4242) => ({ name: "wiresock-client-service", state, command, processId });
const missing = { name: "wiresock-pro-client-service", state: "Missing", command: null, processId: 0 };
const snapshot = (services = [service(), missing], processes = [{ pid: 4242, commandLine: ownCommand }] as Array<{ pid: number; commandLine: string | null }>) => JSON.stringify({ services, processes });

describe("ownership da GUI pelo argumento exato de configuração", () => {
  it("reconhece perfil exato, inclusive com caixa/barra diferentes", () => {
    expect(inspectGuiWireSockOwnership(snapshot([service(ownCommand.toUpperCase()) , missing], [{ pid: 4242, commandLine: ownCommand.replace(/\\/g, "/") }]), CONFIG)).toMatchObject({ reliable: true, active: true, owned: true });
  });

  it.each([
    ownCommand.replace(CONFIG, `${CONFIG}.bak`),
    `C:\\WireSock\\wiresock-client.exe -config C:\\External\\vpn.conf -log "${CONFIG}"`,
    ownCommand.replace("GoLiveBypass\\wiresock", "GoLiveBypass\\plugin-vpn\\wiresock"),
    `${ownCommand} -config C:\\External\\vpn.conf`,
    `wiresock-client.exe -log "before -config ${CONFIG} after"`,
    String.raw`wiresock-client.exe -log "before \" -config ${CONFIG} \" after"`,
    `${ownCommand} --config=C:\\External\\vpn.conf`,
    `wiresock-client.exe service -config "" ${CONFIG}`,
  ])("preserva serviço/processo que não usam um único argumento exato (%s)", command => {
    expect(inspectGuiWireSockOwnership(snapshot([service(command), missing], [{ pid: 4242, commandLine: command }]), CONFIG)).toMatchObject({ reliable: true, active: true, owned: false });
  });

  it("preserva estado misto de processos da GUI e externos", () => {
    expect(inspectGuiWireSockOwnership(snapshot(undefined, [{ pid: 4242, commandLine: ownCommand }, { pid: 9090, commandLine: "wiresock-client.exe -config C:\\External\\vpn.conf" }]), CONFIG)).toMatchObject({ reliable: true, active: true, owned: false });
  });

  it("atribui processo sem CommandLine apenas ao PID do serviço de configuração própria", () => {
    expect(inspectGuiWireSockOwnership(snapshot(undefined, [{ pid: 4242, commandLine: null }]), CONFIG)).toMatchObject({ reliable: true, active: true, owned: true });
    expect(inspectGuiWireSockOwnership(snapshot(undefined, [{ pid: 9090, commandLine: null }]), CONFIG)).toMatchObject({ reliable: false, active: false, owned: false });
  });

  it.each(["", "{}", JSON.stringify({ services: [service()], processes: [] }), snapshot([service(null), missing]), snapshot([service(), missing], [{ pid: 0, commandLine: ownCommand }])])("leitura incompleta/corrompida não confirma ausência ou ownership", raw => {
    expect(inspectGuiWireSockOwnership(raw, CONFIG)).toMatchObject({ reliable: false, active: false, owned: false });
  });
});

describe("limpeza real da GUI preserva WireSock externo", () => {
  const originalPlatform = process.platform;
  const mutations: string[] = [];
  let externalAlive = true;
  let discoverySnapshot = "";
  let elevatedSnapshot = "";
  let cleanupOutcome: Record<string, unknown>;
  const workers: string[] = [];

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    externalAlive = true;
    mutations.length = 0;
    workers.length = 0;
    discoverySnapshot = snapshot([service(String.raw`C:\WireSock\wiresock-client.exe service -config C:\External\vpn.conf`), missing], [{ pid: 4242, commandLine: String.raw`C:\WireSock\wiresock-client.exe service -config C:\External\vpn.conf` }]);
    elevatedSnapshot = discoverySnapshot;
    cleanupOutcome = { stopped: true, attempts: 1, resetNetworkLock: false, dnsCleared: false, dnsFlushed: true, servicesResidual: [], processResidual: false, residual: [] };
    vi.mocked(execSync).mockImplementation((command: string) => {
      if (command.includes("sc.exe query")) return externalAlive ? "STATE : 4 RUNNING" : "STATE : 1 STOPPED";
      return externalAlive ? "wiresock-client.exe 4242" : "";
    });
    vi.mocked(execFile).mockImplementation(((file: string, args: string[], _options: unknown, callback: Function) => {
      if (file === "sc.exe" || file === "taskkill.exe" || file === "ipconfig.exe") {
        mutations.push(`${file} ${args.join(" ")}`);
        externalAlive = false;
      }
      const wrapper = file === "powershell.exe" ? Buffer.from(args.at(-1) ?? "", "base64").toString("utf16le") : "";
      const workerPath = wrapper.match(/\$scriptPath = '([^']+)'/)?.[1];
      if (workerPath) {
        const script = fs.readFileSync(workerPath, "utf8");
        const resultPath = script.match(/\[IO.File\]::WriteAllText\('([^']+)'/)?.[1];
        if (!resultPath) throw new Error("worker sem arquivo de resultado");
        const isCleanup = script.includes("$result = [PSCustomObject]");
        workers.push(isCleanup ? "cleanup" : "inspection");
        fs.writeFileSync(resultPath, isCleanup ? JSON.stringify(cleanupOutcome) : elevatedSnapshot);
      }
      callback(null, discoverySnapshot, "");
      return {};
    }) as never);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    vi.resetAllMocks();
  });

  it("recusa parar serviço/processo alheios antes de resetar lock ou DNS", async () => {
    const result = await stopWireSockService(CONFIG);
    expect(externalAlive).toBe(true);
    expect(mutations).toEqual([]);
    expect(result.stopped).toBe(false);
    expect(result.residual.join(" ")).toMatch(/externo/i);
    expect(workers).toEqual([]);
  });

  it("estado definitivamente inativo não solicita elevação nem altera DNS", async () => {
    discoverySnapshot = snapshot([service(null, "Missing", 0), missing], []);
    expect(await stopWireSockService(CONFIG)).toMatchObject({ stopped: true, attempts: 0, dnsCleared: false, dnsFlushed: false });
    expect(mutations).toEqual([]);
    expect(workers).toEqual([]);
  });

  it("reconsulta processo elevado sem CommandLine antes de iniciar a limpeza própria", async () => {
    discoverySnapshot = snapshot([service(null, "Missing", 0), missing], [{ pid: 4242, commandLine: null }]);
    elevatedSnapshot = snapshot([service(null, "Missing", 0), missing]);
    expect(await stopWireSockService(CONFIG)).toMatchObject({ stopped: true, attempts: 1 });
    expect(workers).toEqual(["inspection", "cleanup"]);
    expect(mutations).toEqual([]);
  });

  it("reconsulta ainda desconhecida preserva todos os recursos", async () => {
    discoverySnapshot = elevatedSnapshot = "{}";
    expect(await stopWireSockService(CONFIG)).toMatchObject({ stopped: false, resetNetworkLock: false, dnsCleared: false, dnsFlushed: false });
    expect(workers).toEqual(["inspection"]);
    expect(mutations).toEqual([]);
  });

  it("recusa a confirmação quando o worker detecta ownership alterado", async () => {
    discoverySnapshot = snapshot();
    cleanupOutcome = { ...cleanupOutcome, stopped: false, residual: ["WIRESOCK_EXTERNAL: processo externo preservado"] };
    const result = await stopWireSockService(CONFIG);
    expect(result.stopped).toBe(false);
    expect(result.residual).toEqual(["WIRESOCK_EXTERNAL: processo externo preservado"]);
    expect(workers).toEqual(["cleanup"]);
  });

  it("resultado incompleto do worker não confirma restauração", async () => {
    discoverySnapshot = snapshot();
    cleanupOutcome = { stopped: true };
    expect(await stopWireSockService(CONFIG)).toMatchObject({ stopped: false });
  });

  it("serviço e processos próprios parados bastam, mesmo sem reset de lock/DNS", async () => {
    discoverySnapshot = snapshot();
    cleanupOutcome = { ...cleanupOutcome, resetNetworkLock: false, dnsCleared: false, dnsFlushed: false };
    expect(await stopWireSockService(CONFIG)).toMatchObject({ stopped: true, resetNetworkLock: false, dnsCleared: false, dnsFlushed: false });
  });
});
