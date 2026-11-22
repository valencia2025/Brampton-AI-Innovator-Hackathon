import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Job } from '../shared/types.ts';
import { app } from '../server/index.ts';
import { samples, sources } from '../server/library.ts';
import { demoProvider } from '../server/providers.ts';

test('coordinator workflow through the local HTTP API', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'field-desk-'));
  const server = app(folder, demoProvider).listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(folder, { recursive: true, force: true });
  });
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const json = { 'Content-Type': 'application/json' };
  async function submit(input: string): Promise<Job> {
    const result = await fetch(base + '/api/jobs', { method: 'POST', headers: json, body: JSON.stringify({ input }) });
    assert.equal(result.status, 201, await result.clone().text());
    return result.json();
  }
  function update(job: Job, patch: object) {
    const draft = job.drafts[0];
    return fetch(base + '/api/jobs/' + job.id + '/drafts/' + draft.id, {
      method: 'PATCH', headers: json, body: JSON.stringify({ revision: draft.revision, ...patch })
    });
  }

  const scout = await submit(samples[0].input);
  assert.deepEqual(scout.decision.personaIds, ['scout']);
  assert.equal(scout.mode, 'demo');
  assert.equal(scout.drafts[0].claims[0].source?.url, sources[0].url);
  assert.equal(scout.drafts[0].claims[0].source?.extractedText, sources[0].extractedText);
  assert.deepEqual(scout.drafts[0].warnings, []);

  const starter = await submit(samples[1].input);
  assert.deepEqual(starter.decision.personaIds, ['starter']);
  assert(starter.drafts[0].sources.some(item => item.kind === 'insight'));
  assert(starter.drafts[0].claims.every(claim => claim.source?.kind === 'evidence'));
  assert.deepEqual(starter.drafts[0].warnings, []);

  const aside = await submit(samples[2].input);
  assert.equal(aside.drafts.length, 0);
  assert(aside.decision.reason);

  const both = await submit(samples[3].input);
  assert.deepEqual(both.decision.personaIds, ['scout', 'starter']);
  assert.notEqual(both.drafts[0].content.angle, both.drafts[1].content.angle);
  assert.notEqual(both.drafts[0].content.hook, both.drafts[1].content.hook);

  const flagged = await submit(samples[4].input);
  assert(flagged.drafts[0].claims.some(item => !item.source && item.statement.includes('48 hours')));
  assert(flagged.drafts[0].warnings.some(item => item.includes('Unsupported statement')));
  assert.equal((await update(flagged, { status: 'approved' })).status, 422);
  const content = { ...flagged.drafts[0].content, script: flagged.drafts[0].content.script.split('\n').slice(0, -1).join('\n') };
  const edit = await update(flagged, { content });
  assert.equal(edit.status, 200, await edit.clone().text());
  const repaired: Job = await edit.json();
  assert.deepEqual(repaired.drafts[0].warnings, []);
  assert.equal((await update(flagged, { status: 'rejected' })).status, 409);

  const approval = await update(repaired, { status: 'approved' });
  assert.equal(approval.status, 200);
  const saved: Job = JSON.parse(readFileSync(join(folder, repaired.id + '.json'), 'utf8'));
  assert.equal(saved.drafts[0].status, 'approved');
  assert.equal(readdirSync(folder).length, 5);
  assert.equal((await fetch(base + '/api/publish', { method: 'POST' })).status, 404);
  const rejection = await update(starter, { status: 'rejected' });
  assert.equal(rejection.status, 200);
  assert.equal(((await rejection.json()) as Job).drafts[0].status, 'rejected');

  const knownUrl = await submit(sources[0].url!);
  assert.deepEqual(knownUrl.decision.personaIds, ['scout']);
  assert(knownUrl.drafts[0].claims.some(item => item.source?.id === sources[0].id));
  const unknownUrl = await submit('https://example.test/brampton-road-closure');
  assert.match(unknownUrl.decision.reason, /path only/);
  const pasted = await submit('Local bulletin\nContractors in Brampton should check the notice before returning to a road construction project.');
  assert.deepEqual(pasted.decision.personaIds, ['scout']);
});
