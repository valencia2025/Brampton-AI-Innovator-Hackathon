import { readFileSync } from 'node:fs';
import type { Brand, Persona, Source } from '../shared/types.ts';

function config<T>(file: string): T {
  return JSON.parse(readFileSync(new URL('../config/' + file, import.meta.url), 'utf8')) as T;
}

export const brand = config<Brand>('brand.json');
export const personas = config<Persona[]>('personas.json');
export const sources = config<Source[]>('sources.json');

export const samples = [
  { label: 'Brampton job-site news', input: 'Fictional news scenario: a Brampton road resurfacing project may change its work-zone entrance. What should crews check before dispatching?' },
  { label: 'First truck', input: 'What should I check before buying my first dump truck to become an Ontario owner-operator?' },
  { label: 'Outside scope', input: 'How do I bake sourdough at home?' },
  { label: 'Both personas', input: 'Brampton construction haul routes: what should crews and first-time dump truck owner-operators check?' },
  { label: 'Unsupported claim', input: 'Brampton construction project: all roadworks finish in 48 hours.' }
];

export function normalize(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function matches(text: string, terms: string[]) {
  const normalized = ' ' + normalize(text) + ' ';
  return terms.filter(term => normalized.includes(' ' + normalize(term) + ' ')).length;
}

export type Researcher = (topic: string, persona: Persona, submittedSource?: Source) => Promise<Source[]>;

export const localResearch: Researcher = async (topic, persona, submittedSource) =>
  sources
    .filter(source => source.personas.includes(persona.id))
    .map(source => ({ source, score: source.id === submittedSource?.id ? 100 : matches(topic, source.topics) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(item => item.source);

export function resolveInput(input: string) {
  if (!/^https?:\/\/\S+$/i.test(input)) return { topic: input };
  const url = new URL(input);
  url.hash = '';
  url.search = '';
  const source = sources.find(record => record.url?.toLowerCase() === url.href.toLowerCase() && record.origin === 'public');
  const topic = source ? [source.title, ...source.topics].join(' ') : url.pathname.replace(/(?:%20|[-_/])+/g, ' ').trim();
  return { topic, source, unmatchedUrl: !source };
}
