import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { extractEvidence } from '../server/intake.ts';
import { runChecks } from '../server/review.ts';
import { personas } from '../server/library.ts';

test('extracts attributable passages and checks unsupported copy', () => {
  const html = `<html><head><meta property="og:title" content="First truck guide"></head><body>
    <nav><p>Unrelated navigation should not be extracted as a passage.</p></nav>
    <article><p>Before you buy a used dump truck, ask for its maintenance records and schedule an independent inspection.</p>
    <p>Make sure the truck fits the work you plan to perform and verify the applicable registration requirements.</p></article>
  </body></html>`;
  const sources = extractEvidence(html, 'https://example.com/guide', ['What should I inspect before buying a dump truck?'], 0);
  assert.equal(sources[0].title, 'First truck guide');
  assert.equal(sources[0].url, 'https://example.com/guide');
  assert.match(sources[0].extractedText, /maintenance records/);
  assert.equal(sources.some(item => item.extractedText.includes('navigation')), false);
  const persona = personas.find(item => item.id === 'starter')!;
  const copy = {
    angle: 'Buying checklist', fit: 'For first-time buyers', answer: sources[0].fact!, hook: 'What should you inspect?',
    script: `AI-generated persona: Starter.\nWhat should you inspect?\n${sources[0].fact}`,
    caption: 'AI-generated persona: Starter. Ask for the records.',
    shots: [{ visual: 'Show AI-generated persona label.', audio: sources[0].fact! }], assumptions: []
  };
  assert.equal(runChecks(copy, persona, sources).warnings.length, 0);
  const paraphrase = 'Ask for a used truck’s maintenance records and an independent inspection.';
  assert.equal(runChecks({ ...copy, answer: paraphrase, evidence: [{ statement: paraphrase, sourceId: sources[0].id, excerpt: sources[0].extractedText }] }, persona, sources).warnings.length, 0);
  assert.ok(runChecks({ ...copy, answer: paraphrase, evidence: [{ statement: paraphrase, sourceId: sources[0].id, excerpt: 'Invented passage.' }] }, persona, sources).warnings.length > 0);
  assert.ok(runChecks({ ...copy, answer: 'Every first-time buyer saves $500.' }, persona, sources).warnings.some(w => w.includes('Unsupported statement')));
});
