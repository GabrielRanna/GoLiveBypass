# GoLiveBypass para macOS

App de Mac que devolve o **Go Live** e a câmera do Discord para quem está no Brasil.
Ele liga um túnel WireGuard (ProtonVPN gratuito) só para o tráfego do Discord: o resto
do Mac continua na sua conexão normal.

Funciona em Apple Silicon (M1, M2, M3…) e Intel, com um único DMG universal.

**[Baixar a versão mais recente](https://github.com/GabrielRanna/GoLiveBypass/releases/latest)**

## Instalação

1. Baixe o `GoLiveBypass-macos-<versão>-universal.dmg` na página de releases.
2. Abra o DMG e arraste o **GoLiveBypass** para a pasta **Aplicativos**.
3. O app não é notarizado pela Apple. Se o macOS disser que ele não pode ser aberto,
   rode no Terminal:
   ```bash
   xattr -dr com.apple.quarantine /Applications/GoLiveBypass.app
   ```
4. Abra o app.

Requisitos: macOS 13 Ventura ou mais novo e o Discord em `/Applications/Discord.app`.

## Como usar

1. **Conta Proton:** entre com uma conta ProtonVPN gratuita e clique em
   **Buscar melhor servidor**. O app mede o ping dos servidores do México e dos EUA e
   escolhe o mais rápido. A conta fica salva; a senha não é guardada. Se preferir,
   use **Importar .conf** com um arquivo WireGuard seu.
2. **Ativar:** clique no botão central. Na primeira vez o macOS pede a senha de
   administrador para instalar o componente de rede. Depois disso, ativar e desativar
   não pedem senha.
3. O Discord reinicia já pelo túnel, e o app mostra o país e o IP de saída.

Ao ativar, o app também instala o Vencord no Discord com o plugin FakeNitro ligado. Para
isso o macOS precisa liberar o GoLiveBypass em **Ajustes do Sistema › Privacidade e
Segurança › Gerenciamento de Apps**; o app mostra um botão que abre essa tela.

O app fica na barra de menu. Fechar a janela não desliga o bypass; para sair, use
**Sair** no ícone da barra de menu ou Cmd+Q.

## O que ele faz no seu Mac

- **Só o Discord passa pela VPN.** Apenas os blocos da Cloudflare usados pelo Discord
  (`162.159.0.0/16` e `104.16.0.0/12`) vão pelo túnel. Navegador, jogos e apps como o
  Sonobus seguem na sua rede.
- **Volta sozinho.** Se o bypass estava ligado, ele reconecta ao abrir o app e depois
  que o Mac acorda da suspensão.
- **Atualiza pelo próprio app.** Quando sai uma versão nova, aparece um aviso no topo
  da janela com o botão **Atualizar**.

## Desinstalar

1. Saia do app e apague `/Applications/GoLiveBypass.app`.
2. No Terminal, remova o componente de rede e os dados:
   ```bash
   sudo rm -rf /Library/PrivilegedHelperTools/GoLiveBypass /etc/sudoers.d/golivebypass
   rm -rf ~/Library/Application\ Support/GoLiveBypass
   ```

## Compilar

O código do app está em [`golive-gui-mac/`](https://github.com/GabrielRanna/GoLiveBypass/tree/feat/macos-gui/golive-gui-mac),
na branch `feat/macos-gui`.

```bash
cd golive-gui-mac
npm install
npm run dist:mac   # gera o DMG universal em dist-build/
```

## Créditos e licença

Este repositório é um fork do [GoLiveBypass](https://github.com/bezumiya/GoLiveBypass),
que tem as versões para Windows, Linux e o plugin para Equicord/Vencord. O app para
macOS foi feito aqui e está proposto ao projeto original no
[PR #338](https://github.com/bezumiya/GoLiveBypass/pull/338).

Licença [GPL-3.0](LICENSE), a mesma do projeto original.
