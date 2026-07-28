import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getRunId } from './config';

export type E2EManifest = {
  runId: string;
  userUids: string[];
  staticDocumentPaths: string[];
  dynamicDocumentPaths: string[];
  createdAt: string;
};

function manifestPath(runId = getRunId()) {
  return path.join(process.cwd(), 'output', 'e2e', runId, 'manifest.json');
}

export async function readManifest(runId = getRunId()): Promise<E2EManifest> {
  const raw = await readFile(manifestPath(runId), 'utf8');
  const parsed = JSON.parse(raw) as E2EManifest;
  if (parsed.runId !== runId) throw new Error('E2E manifest run id mismatch.');
  return parsed;
}

export async function writeManifest(manifest: E2EManifest): Promise<void> {
  const target = manifestPath(manifest.runId);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
}

export async function recordDynamicDocument(documentPath: string): Promise<void> {
  const manifest = await readManifest();
  if (!manifest.dynamicDocumentPaths.includes(documentPath)) {
    manifest.dynamicDocumentPaths.push(documentPath);
    manifest.dynamicDocumentPaths.sort();
    await writeManifest(manifest);
  }
}
