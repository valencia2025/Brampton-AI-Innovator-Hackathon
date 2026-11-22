export type PersonaId = 'scout' | 'starter';
export type Persona = {
  id: PersonaId; name: string; audience: string; voice: string; allowed: string[];
  excluded: string[]; voiceRules: string[]; signals: string[]; subjects: string[];
};
export type Brand = { workspaceName: string; marketplace: string; voice: string; editorialRules: string[] };
export type Source = {
  id: string; title: string; url: string | null; publisher: string; date: string | null;
  geography: string; sourceType: string; topics: string[]; personas: PersonaId[];
  kind: 'evidence' | 'insight'; origin: 'public' | 'fictional'; extractedText: string; fact?: string;
};
export type Decision = { personaIds: PersonaId[]; reason: string };
export type Content = {
  angle: string; fit: string; hook: string; script: string; caption: string;
  shots: { visual: string; audio: string }[]; assumptions: string[];
};
export type Status = 'pending' | 'approved' | 'rejected';
export type Draft = {
  id: string; persona: Persona; content: Content; sources: Source[];
  claims: { statement: string; source?: Source }[]; warnings: string[];
  status: Status; revision: number;
};
export type Job = {
  id: string; input: string; decision: Decision; drafts: Draft[];
  mode: 'demo' | 'ai'; createdAt: string;
};
export type Sample = { label: string; input: string };
