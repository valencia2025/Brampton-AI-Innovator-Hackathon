import type { Job } from '../shared/types.ts';
import { localResearch, matches, personas, resolveInput } from './library.ts';
import type { Researcher } from './library.ts';
import type { Provider } from './providers.ts';
import { runChecks } from './review.ts';

export async function createJob(input: string, provider: Provider, research: Researcher = localResearch): Promise<Job> {
  const { topic, source, unmatchedUrl } = resolveInput(input);
  const decision = await provider.route(topic, Boolean(source));
  if (unmatchedUrl) {
    decision.reason += ' This URL is outside the approved library. Routing used its path only. Paste the article text for more context.';
  }
  const drafts = await Promise.all(decision.personaIds.map(async id => {
    const persona = personas.find(item => item.id === id)!;
    const relevantSources = await research(topic, persona, source);
    const content = await provider.draft(topic, persona, relevantSources);
    if (unmatchedUrl) content.assumptions.push('Coordinator: open the submitted URL and verify the article’s details.');
    if (matches(topic, ['closure', 'roadworks', 'construction', 'project', 'cvor'])) {
      content.assumptions.push('Recheck any project or regulatory details against the current official page.');
    }
    return {
      id: crypto.randomUUID(), persona, content, sources: relevantSources,
      ...runChecks(content, persona, relevantSources), status: 'pending' as const, revision: 1
    };
  }));
  return { id: crypto.randomUUID(), input, decision, drafts, mode: provider.mode, createdAt: new Date().toISOString() };
}
