import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourceDirectory = resolve('node_modules/@ffmpeg/core/dist/umd');
const destinationDirectory = resolve('public/ffmpeg');
const assets = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

await mkdir(destinationDirectory, { recursive: true });
await Promise.all(assets.map(asset => copyFile(
  resolve(sourceDirectory, asset),
  resolve(destinationDirectory, asset),
)));

console.log(`Prepared FFmpeg browser assets in ${destinationDirectory}`);
