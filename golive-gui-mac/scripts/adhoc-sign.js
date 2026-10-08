'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const KEEP_LOCALES = new Set(['en', 'en_US', 'en_GB', 'pt', 'pt_BR', 'pt_PT']);

function removeUnusedLocales(appPath) {
  const resourcesDir = path.join(appPath, 'Contents', 'Resources');
  if (!fs.existsSync(resourcesDir)) return;
  for (const entry of fs.readdirSync(resourcesDir)) {
    if (!entry.endsWith('.lproj')) continue;
    const locale = entry.replace(/\.lproj$/, '');
    if (!KEEP_LOCALES.has(locale)) {
      fs.rmSync(path.join(resourcesDir, entry), { recursive: true, force: true });
    }
  }
}

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const platform = packager.platform.name;
  if (platform !== 'mac') return;

  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);

  removeUnusedLocales(appPath);

  // Assina ad-hoc (sem identidade de desenvolvedor)
  const sign = (target) => {
    try {
      execSync(`codesign --force --deep --sign - ${JSON.stringify(target)}`, { stdio: 'inherit' });
    } catch (e) {
      console.warn(`Aviso ao assinar ${target}:`, e.message);
    }
  };

  // Assina os binários empacotados primeiro
  const binDir = path.join(appPath, 'Contents', 'Resources', 'bin');
  if (fs.existsSync(binDir)) {
    for (const bin of fs.readdirSync(binDir)) {
      sign(path.join(binDir, bin));
    }
  }

  const extraDir = path.join(appPath, 'Contents', 'Resources', 'extra');
  if (fs.existsSync(extraDir)) {
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else sign(p);
      }
    };
    walk(extraDir);
  }

  // Assina o app inteiro
  sign(appPath);
};
