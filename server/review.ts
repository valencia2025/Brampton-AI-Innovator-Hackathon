import type { Content, Draft, Persona, Source } from '../shared/types.ts';

function sentences(text: string) {
  return text.split(/(?<=[.!?])\s+|\n+/).map(line => line.trim()).filter(Boolean);
}

const directives = /^(?:ask|check|confirm|compare|list|review|write|show|display|cut|open|plan|look|read|verify|add|end|start|use|illustrate|overlay|film|zoom|pull|consider)\b/i;
const warningPatterns: { pattern: RegExp; warning: string }[] = [
  { pattern: /\b(?:i|we)\s+(?:(?:have|has|personally)\s+)*(?:drove|driven|bought|purchased|owned|maintained|sold|worked|hauled)\b/i, warning: 'Possible fabricated firsthand experience.' },
  { pattern: /\b(?:guarantee\w*|surefire|risk-free|financing approval|will (?:earn|profit|make)|approved for financing)\b|[$€£]|\b\d[\d,.]*\s?(?:cad|usd|dollars)\b/i, warning: 'Possible earnings figure, monetary claim, or outcome promise.' },
  { pattern: /\b(?:united states|u\.s\.|usa|texas|california|florida|fm csa|fmcsa)\b/i, warning: 'Check the jurisdiction before presenting this to an Ontario audience.' },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/i, warning: 'Possible contact data in public-facing copy.' },
  { pattern: /\b(?:customer|client)\s+(?:story|said|told us|testimonial)\b|[“”"]/i, warning: 'Check for attributed quotes or customer stories.' }
];

export function runChecks(content: Content, persona: Persona, sources: Source[]): Pick<Draft, 'claims' | 'warnings'> {
  const claims: Draft['claims'] = [];
  const warnings = new Set<string>();
  const disclosure = 'AI-generated persona: ' + persona.name + '.';
  if (![content.script, content.caption].every(text => text.includes(disclosure))) {
    warnings.add('The script and caption both require the label “' + disclosure + '”');
  }
  if (!content.shots.some(shot => /\bai-generated\b/i.test(shot.visual))) {
    warnings.add('Add the AI-generated persona label to a storyboard visual.');
  }
  const copy = [content.answer ?? '', content.hook, content.script, content.caption, ...content.shots.flatMap(shot => [shot.audio, shot.visual])];
  const all = [...new Set(copy.flatMap(sentences))];
  if (/\bday[ -]in[ -]the[ -]life\b/i.test(copy.join(' ')) && !/\bfictional\b/i.test(content.script)) {
    warnings.add('Label day-in-the-life scenarios as fictional in the script.');
  }
  for (const statement of all) {
    for (const { pattern, warning } of warningPatterns) if (pattern.test(statement)) warnings.add(warning);
    if (statement === disclosure) continue;
    const cited = content.evidence?.find(item => item.statement === statement);
    if (cited) {
      const linked = sources.find(item => item.id === cited.sourceId && item.kind === 'evidence' && item.origin === 'public'
        && item.url && item.extractedText === cited.excerpt);
      if (linked) { claims.push({ statement, source: linked }); continue; }
      warnings.add('Claim has a missing or altered source passage: ' + statement);
    }
    const source = sources.find(item =>
      item.kind === 'evidence' && item.origin === 'public' && item.url && item.extractedText && item.fact === statement
    );
    if (source) {
      claims.push({ statement, source });
      continue;
    }
    const actionable = directives.test(statement) || statement.endsWith('?');
    const embedsClaim = /\d|\b(?:always|never|must|required|every|all|new law|according to|because|means that|can earn|you'll|will|guarantees?)\b/i.test(statement);
    if (actionable && !embedsClaim) continue;
    claims.push({ statement });
    warnings.add('Unsupported statement: ' + statement);
  }
  for (const item of content.evidence ?? []) {
    if (!all.includes(item.statement)) warnings.add('Evidence refers to wording that is no longer in the draft: ' + item.statement);
  }
  return { claims, warnings: [...warnings] };
}
