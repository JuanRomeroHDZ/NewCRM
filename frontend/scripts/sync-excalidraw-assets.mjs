import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';

const packageAssets = join('node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod');
const publicAssets = join('public', 'excalidraw-assets');

function syncDirectory(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      syncDirectory(sourcePath, targetPath);
      continue;
    }
    if (!entry.isFile()) continue;

    const sourceContents = readFileSync(sourcePath);
    if (existsSync(targetPath) && readFileSync(targetPath).equals(sourceContents)) continue;
    copyFileSync(sourcePath, targetPath);
  }
}

for (const directory of ['fonts', 'locales']) {
  const source = join(packageAssets, directory);
  syncDirectory(source, join(publicAssets, directory));
}
