import { isE2ETestMode } from '@/lib/e2eTestMode';

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,72}$/;

/** Production requests never receive this field. E2E writes require the exact
 * run identifier, so teardown can prove document ownership before deletion. */
export function getE2ERunMetadata(request: Request): { e2eRunId?: string } {
  if (!isE2ETestMode()) return {};
  const expected = process.env.E2E_RUN_ID || '';
  const provided = request.headers.get('x-e2e-run-id') || '';
  if (!RUN_ID_PATTERN.test(expected) || provided !== expected) {
    throw new Error('E2E write rejected: missing or mismatched x-e2e-run-id.');
  }
  return { e2eRunId: expected };
}
