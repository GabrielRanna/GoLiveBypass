# GoLiveBypass — macOS

Reativa o **Go Live** do Discord no macOS via WireGuard + ProtonVPN (tier gratuito).

## Requisitos

- macOS 13 Ventura ou superior
- Intel x86_64 **ou** Apple Silicon (arm64) — instalador universal
- Discord instalado em `/Applications/Discord.app`

## Instalação

1. Baixe o DMG mais recente em [Releases](https://github.com/bezumiya/GoLiveBypass/releases)
2. Abra o DMG e arraste **GoLiveBypass.app** para `/Applications`
3. Se o macOS bloquear com "desenvolvedor desconhecido", execute:
   ```bash
   xattr -dr com.apple.quarantine /Applications/GoLiveBypass.app
   ```
4. Abra o app — na primeira ativação ele pedirá senha de administrador para
   instalar o helper privilegiado (uma única vez)

## Build

```bash
npm install
npm run build:ts
npm run dist:mac    # produz universal DMG em dist-build/
```

O build gera um binário **universal** (x86_64 + arm64) assinado ad-hoc. Para
remover o atributo de quarentena após o build local, use o comando `xattr`
acima.

## Arquitetura

- **Split tunnel**: apenas os ranges IP do Discord (Cloudflare 162.159.0.0/16 e
  104.16.0.0/12) passam pela VPN. Outros apps como Sonobus continuam usando a
  conexão direta.
- **Helper privilegiado**: bash script em `/Library/PrivilegedHelperTools/GoLiveBypass/helper`
  executado via `sudo -n` (NOPASSWD após install). Pede senha apenas na
  primeira instalação via `osascript`.
- **ProtonVPN free**: busca automaticamente o servidor de menor ping (exceto BR)
  usando o binário `proton-confgen` bundled.
