import type { Job } from '../shared/types.ts';
import { personas } from './library.ts';
import { readEvidence } from './intake.ts';
import { draftStarterLive } from './providers.ts';
import { runChecks } from './review.ts';

export async function createStarterJob(questions: string[], urls: string[], key: string, model: string): Promise<Job> {
  const persona = personas.find(item => item.id === 'starter')!;
  const sources = await readEvidence(questions, urls);
  const content = await draftStarterLive(key, model, questions, sources);
  content.assumptions.push('Review the full pages, publisher, jurisdiction, and date before approval. A citation proves passage linkage, not that the paraphrase is true.');
  if (sources.some(source => source.id.startsWith('snapshot-'))) content.assumptions.push('A live source fetch failed; a preloaded source snapshot was used. Recheck that page before presenting the result as current.');
  const checks = runChecks(content, persona, sources);
  return {
    id: crypto.randomUUID(), input: `Questions:\n${questions.join('\n')}\n\nSource URLs:\n${urls.join('\n')}`,
    decision: { personaIds: ['starter'], reason: 'Starter is fixed for this live first-time buyer demo. Questions were supplied by the team; cited passages came from the supplied public pages.' },
    drafts: [{ id: crypto.randomUUID(), persona, content, sources, ...checks, status: 'pending', revision: 1 }],
    mode: 'ai', createdAt: new Date().toISOString()
  };
}
