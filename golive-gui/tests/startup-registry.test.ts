import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Comportamento real do helper de autostart do Windows contra um registro
// falso. O bug "toggle desligado e o app continua subindo" era de logica: o
// toggle gerenciava so o valor canonico (entradas legadas sob outros nomes
// sobreviviam) e reportava sucesso sem conferir a exclusao. Estes testes
// conduzem setStartup/getStartup e conferem os comandos reg.exe emitidos e o
// resultado honesto quando o Windows nao obedece.

const reg = vi.hoisted(() => ({
  entries: new Map<string, string>(),
  deleteWorks: true,
  commands: [] as string[][],
}));

vi.mock("child_process", () => ({
  // execFileSync(exe, args, options): a ação (query/add/delete) é args[0].
  execFileSync: vi.fn((_exe: string, args: string[]) => {
    reg.commands.push(args);
    const action = args[0];
    const rest = args.slice(1);
    if (action === "query") {
      const header = "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
      const lines = [header];
      for (const [name, data] of reg.entries) lines.push(`    ${name}    REG_SZ    ${data}`);
      return lines.join("\r\n") + "\r\n";
    }
    if (action === "add") {
      reg.entries.set(rest[rest.indexOf("/v") + 1], rest[rest.indexOf("/d") + 1]);
      return "";
    }
    if (action === "delete") {
      const name = rest[rest.indexOf("/v") + 1];
      if (!reg.deleteWorks) throw new Error("acesso negado");
      if (!reg.entries.has(name)) throw new Error("ERROR: valor nao encontrado");
      reg.entries.delete(name);
      return "";
    }
    return "";
  }),
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
    getLoginItemSettings: () => ({ openAtLogin: false, wasOpenedAtLogin: false }),
    setLoginItemSettings: vi.fn(),
  },
}));

const originalPlatform = process.platform;

async function loadStartup() {
  vi.resetModules();
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  // Import dinâmico porque o módulo captura process.platform no load
  // (IS_WINDOWS): import estático congelaria a plataforma do runner Linux.
  return await import("../electron/startup");
}

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  reg.entries.clear();
  reg.deleteWorks = true;
  reg.commands.length = 0;
});

describe("autostart Windows (registro)", () => {
  it("getStartup e verdadeiro quando so existe entrada legada sob outro nome", async () => {
    reg.entries.set("golive-gui", '"C:\\Users\\x\\GoLiveBypass-2.0.5.exe" --hidden');
    const startup = await loadStartup();
    expect(startup.getStartup()).toBe(true);
  });

  it("getStartup ignora valores de terceiros e o Tor do standalone", async () => {
    reg.entries.set("Spotify", '"C:\\Users\\x\\Spotify.exe" --autostart');
    reg.entries.set("GoLiveBypassTor", 'wscript.exe "C:\\Users\\x\\Tor\\GoLiveBypassTor.vbs"');
    const startup = await loadStartup();
    expect(startup.getStartup()).toBe(false);
  });

  it("desligar apaga todas as entradas do app e preserva as de terceiros", async () => {
    reg.entries.set("GoLiveBypass", '"C:\\Users\\x\\GoLiveBypass-2.0.10.exe" --hidden');
    reg.entries.set("golive-gui", '"C:\\Users\\x\\GoLiveBypass-2.0.5.exe" --hidden');
    reg.entries.set("Spotify", '"C:\\Users\\x\\Spotify.exe" --autostart');
    reg.entries.set("GoLiveBypassTor", 'wscript.exe "C:\\Users\\x\\Tor\\GoLiveBypassTor.vbs"');
    const startup = await loadStartup();
    const result = startup.setStartup(false);
    expect(result.success).toBe(true);
    expect([...reg.entries.keys()].sort()).toEqual(["GoLiveBypassTor", "Spotify"]);
  });

  it("desligar reporta falha quando o Windows mantem a entrada (sem sucesso mudo)", async () => {
    reg.entries.set("golive-gui", '"C:\\Users\\x\\GoLiveBypass-2.0.5.exe" --hidden');
    reg.deleteWorks = false;
    const startup = await loadStartup();
    const result = startup.setStartup(false);
    expect(result.success).toBe(false);
    expect(result.error).toContain("golive-gui");
  });

  it("ligar escreve a entrada canonica e remove duplicatas legadas", async () => {
    reg.entries.set("golive-gui", '"C:\\Users\\x\\GoLiveBypass-2.0.5.exe" --hidden');
    const dir = mkdtempSync(join(tmpdir(), "glb-startup-"));
    const exe = join(dir, "GoLiveBypass-2.0.10-beta-4.exe");
    writeFileSync(exe, "");
    process.env.PORTABLE_EXECUTABLE_FILE = exe;
    try {
      const startup = await loadStartup();
      const result = startup.setStartup(true);
      expect(result.success).toBe(true);
      expect([...reg.entries.keys()]).toEqual(["GoLiveBypass"]);
      expect(reg.entries.get("GoLiveBypass")).toBe(`"${exe}" --hidden`);
    } finally {
      delete process.env.PORTABLE_EXECUTABLE_FILE;
    }
  });
});
