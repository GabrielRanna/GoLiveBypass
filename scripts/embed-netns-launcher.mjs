#!/usr/bin/env node
// Rebuild the compressed Linux plugin helper from its C source, or verify that the
// committed gzip/base64 payload is internally consistent before packaging the plugin.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "goLiveBypass/tools/netns-launcher.c");
const assetPath = path.join(root, "goLiveBypass/vpn-proton.ts");
const mode = process.argv[2];
if (process.platform !== "linux") throw new Error("O asset netns-launcher só pode ser gerado/verificado em Linux.");
if (mode !== "--write" && mode !== "--check" && mode !== "--check-archive") {
  throw new Error("Uso: node scripts/embed-netns-launcher.mjs --write|--check|--check-archive ARQUIVO.zip");
}

const assetPattern = /(    "netns-launcher": \{\n        sha256: ")([0-9a-f]{64})(",\n        gzipBase64: \[\n)([\s\S]*?)(\n        \]\.join\(""\),\n    \})/;
function readAsset(source) {
  const match = source.match(assetPattern);
  if (!match) throw new Error('Bloco EMBEDDED_LINUX_ASSETS["netns-launcher"] não encontrado.');
  const chunks = Array.from(match[4].matchAll(/"([A-Za-z0-9+/=]+)"/g), (chunk) => chunk[1]);
  const binary = gunzipSync(Buffer.from(chunks.join(""), "base64"));
  const digest = createHash("sha256").update(binary).digest("hex");
  if (digest !== match[2]) throw new Error(`Payload embedded inválido: SHA declarado ${match[2]}, obtido ${digest}.`);
  return { match, binary, digest };
}
if (mode === "--check-archive") {
  const archivePath = process.argv[3];
  if (!archivePath) throw new Error("--check-archive requer o caminho do ZIP.");
  const archivedSource = execFileSync("python3", [
    "-c",
    "import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read('goLiveBypass/vpn-proton.ts'))",
    path.resolve(archivePath),
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const { binary, digest } = readAsset(archivedSource);
  console.log(`netns-launcher no ZIP íntegro: ${binary.length} bytes, sha256 ${digest}`);
  process.exit(0);
}


let source = readFileSync(assetPath, "utf8");
if (mode === "--check") {
  const { binary, digest } = readAsset(source);
  console.log(`netns-launcher embedded íntegro: ${binary.length} bytes, sha256 ${digest}`);
  process.exit(0);
}

const temporary = mkdtempSync(path.join(tmpdir(), "golive-netns-embed-"));
try {
  const output = path.join(temporary, "netns-launcher");
  execFileSync(process.env.CC || "cc", [
    "-O2", "-pipe", "-Wall", "-Wextra", "-Werror", "-o", output, sourcePath,
  ], { stdio: "inherit" });
  const binary = readFileSync(output);
  const digest = createHash("sha256").update(binary).digest("hex");
  const encoded = gzipSync(binary, { level: 9, mtime: 0 }).toString("base64");
  const chunks = encoded.match(/.{1,116}/g) ?? [];
  const embedded = readAsset(source);
  const replacement = [
    embedded.match[1] + digest + embedded.match[3],
    chunks.map((chunk) => `            "${chunk}"`).join(",\n"),
    embedded.match[5],
  ].join("");
  source = source.replace(assetPattern, replacement);
  writeFileSync(assetPath, source, "utf8");
  const updated = readAsset(source);
  if (!updated.binary.equals(binary)) throw new Error("Payload regenerado não corresponde ao binário C compilado.");
  console.log(`Atualizado ${assetPath}: ${binary.length} bytes, sha256 ${digest}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
