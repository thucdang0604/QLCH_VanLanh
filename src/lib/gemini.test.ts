import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyGeminiError } from './gemini';

test('Gemini provider errors are classified without exposing raw messages to the client', () => {
    assert.equal(classifyGeminiError(new Error('403 Forbidden: project denied access')), 'forbidden');
    assert.equal(classifyGeminiError(new Error('429 RESOURCE_EXHAUSTED')), 'rate_limited');
    assert.equal(classifyGeminiError(new Error('socket closed')), 'provider_error');
});
