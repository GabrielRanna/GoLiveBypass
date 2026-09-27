import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@main/settings", () => ({ RendererSettings: { store: { plugins: {} } } }), { virtual: true });
vi.mock("electron", () => ({
  app: { exit: vi.fn(), quit: vi.fn(), relaunch: vi.fn(), on: vi.fn(), whenReady: () => new Promise(() => {}) },
  BrowserWindow: class {
    static fromWebContents() { return null; }
  },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { findLinuxNetnsLauncher } from "../../goLiveBypass/native";
import { embeddedLinuxAssetSha256, isValidEmbeddedLinuxAsset, materializeEmbeddedLinuxAsset } from "../../goLiveBypass/vpn-proton";
const tempRoots: string[] = [];
afterEach(() => { for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("asset Linux do launcher", () => {
  it("rejeita launcher stale no caminho preferido e usa o asset materializado", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "golive-linux-asset-"));
    const stale = path.join(root, "netns-launcher");
    try {
      fs.writeFileSync(stale, "launcher stale sem o protocolo de confirmação\n");
      fs.chmodSync(stale, 0o700);
      const expectedDigest = embeddedLinuxAssetSha256("netns-launcher");
      expect(isValidEmbeddedLinuxAsset("netns-launcher", stale)).toBe(false);

      const resolved = findLinuxNetnsLauncher([stale], root);
      const digest = createHash("sha256").update(fs.readFileSync(resolved)).digest("hex");

      expect(resolved).not.toBe(stale);
      expect(digest).toBe(expectedDigest);
      expect(fs.statSync(resolved).isFile()).toBe(true);
      expect(fs.statSync(resolved).mode & 0o111).not.toBe(0);
      expect(fs.statSync(resolved).mode & 0o022).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("mantém a rotina de confirmação no launcher fonte", () => {
    const launcher = fs.readFileSync(path.resolve(process.cwd(), "../goLiveBypass/tools/netns-launcher.c"), "utf8");

    expect(launcher).toContain("write_confirmation(confirm_path, argv[1])");
  });

  it("materializa o asset com o protocolo e o digest declarado", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "golive-linux-materialized-"));
    try {
      const materialized = materializeEmbeddedLinuxAsset("netns-launcher", root);
      const bytes = fs.readFileSync(materialized);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const stats = fs.statSync(materialized);
      const executable = bytes.toString("latin1");

      expect(digest).toBe(embeddedLinuxAssetSha256("netns-launcher"));
      expect(executable).toContain("--confirm=");
      expect(executable).toContain("ok %s");
      expect(stats.isFile()).toBe(true);
      expect(stats.mode & 0o111).not.toBe(0);
      expect(stats.mode & 0o022).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== "linux" || process.arch !== "x64")("executa o launcher embutido e aplica --env antes do exec", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "golive-linux-embedded-exec-"));
    tempRoots.push(root);
    const source = path.resolve(process.cwd(), "../goLiveBypass/tools/netns-launcher.c");
    const sourceLauncher = path.join(root, "netns-launcher-source");
    const embeddedLauncher = materializeEmbeddedLinuxAsset("netns-launcher", root);
    const shimSource = path.join(root, "launcher-test-shim.c");
    // Interposicao so evita setns/setuid reais no host de teste; o ELF embutido continua
    // sendo executado ate o exec e precisa carregar WAYLAND_DISPLAY para o processo filho.
    const shim = path.join(root, "launcher-test-shim.so");
    fs.writeFileSync(shimSource, [
      "#define _GNU_SOURCE",
      "#include <dlfcn.h>",
      "#include <fcntl.h>",
      "#include <grp.h>",
      "#include <stdarg.h>",
      "#include <string.h>",
      "#include <sys/syscall.h>",
      "#include <sys/types.h>",
      "#include <unistd.h>",
      "static uid_t selected_uid = (uid_t)-1;",
      "static gid_t selected_gid = (gid_t)-1;",
      "int setns(int fd, int type) { (void)fd; (void)type; return 0; }",
      "int setgroups(size_t size, const gid_t *groups) { (void)size; (void)groups; return 0; }",
      "int initgroups(const char *user, gid_t group) { (void)user; (void)group; return 0; }",
      "int setgid(gid_t gid) { selected_gid = gid; return 0; }",
      "int setuid(uid_t uid) { selected_uid = uid; return 0; }",
      "uid_t geteuid(void) { return selected_uid == (uid_t)-1 ? (uid_t)syscall(SYS_geteuid) : selected_uid; }",
      "gid_t getegid(void) { return selected_gid == (gid_t)-1 ? (gid_t)syscall(SYS_getegid) : selected_gid; }",
      "int open(const char *path, int flags, ...) {",
      "  static int (*next_open)(const char *, int, ...) = NULL;",
      "  if (!next_open) next_open = dlsym(RTLD_NEXT, \"open\");",
      "  if (strncmp(path, \"/run/netns/\", 11) == 0) path = \"/proc/self/ns/net\";",
      "  if (flags & O_CREAT) {",
      "    va_list args; va_start(args, flags); mode_t mode = va_arg(args, int); va_end(args);",
      "    return next_open(path, flags, mode);",
      "  }",
      "  return next_open(path, flags);",
      "}",
    ].join("\n"));

    execFileSync("cc", ["-O2", "-pipe", "-Wall", "-Wextra", "-Werror", "-o", sourceLauncher, source]);
    execFileSync("cc", ["-shared", "-fPIC", "-o", shim, shimSource, "-ldl"]);

    for (const [label, launcher] of [["source", sourceLauncher], ["embedded", embeddedLauncher]] as const) {
      const namespace = `glbasset${process.pid}${label}`;
      const marker = path.join(root, `${label}.confirm`);
      const result = spawnSync(launcher, [
        namespace,
        "424242",
        "424242",
        `--confirm=${marker}`,
        "--env=WAYLAND_DISPLAY=wayland-0",
        "--",
        "/bin/sh",
        "-c",
        'printf "%s" "$WAYLAND_DISPLAY"',
      ], {
        encoding: "utf8",
        env: { ...process.env, LD_PRELOAD: shim },
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe("wayland-0");
      expect(fs.readFileSync(marker, "utf8")).toBe(`ok ${namespace}\n`);
    }
  });
});
