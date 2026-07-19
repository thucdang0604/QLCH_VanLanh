import assert from 'node:assert/strict';
import test from 'node:test';
import { appAlert, appConfirm, appPrompt, registerAppDialogHandler } from './appDialog';

test('routes alert, confirmation, and input requests through the registered app popup handler', async () => {
    const requests: string[] = [];
    const unregister = registerAppDialogHandler(async (request) => {
        requests.push(request.kind);
        if (request.kind === 'confirm') return true;
        if (request.kind === 'prompt') return 'https://youtu.be/example';
        return undefined;
    });

    assert.equal(await appConfirm('Continue?'), true);
    assert.equal(await appPrompt('Paste URL'), 'https://youtu.be/example');
    await appAlert('Done');
    assert.deepEqual(requests, ['confirm', 'prompt', 'alert']);

    unregister();
});
