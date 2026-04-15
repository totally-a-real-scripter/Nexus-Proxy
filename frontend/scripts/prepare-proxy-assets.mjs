import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const assets = [
  {
    src: 'node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.bundle.js',
    dest: 'public/uv/uv.bundle.js',
  },
  {
    src: 'node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.client.js',
    dest: 'public/uv/uv.client.js',
  },
  {
    src: 'node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.handler.js',
    dest: 'public/uv/uv.handler.js',
  },
  {
    src: 'node_modules/@titaniumnetwork-dev/ultraviolet/dist/uv.sw.js',
    dest: 'public/uv/uv.sw.js',
  },
  {
    src: 'node_modules/@mercuryworkshop/scramjet/dist/scramjet.worker.js',
    dest: 'public/scramjet/scram.sw.js',
  },
];

for (const { src, dest } of assets) {
  const srcPath = resolve(root, src);
  const destPath = resolve(root, dest);

  if (!existsSync(srcPath)) {
    throw new Error(`Missing required asset: ${src}`);
  }

  mkdirSync(dirname(destPath), { recursive: true });
  copyFileSync(srcPath, destPath);
}

console.log(`Prepared ${assets.length} proxy runtime assets.`);
