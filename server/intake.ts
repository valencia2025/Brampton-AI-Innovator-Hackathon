import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { load } from 'cheerio';
import type { Source } from '../shared/types.ts';
import { sources as approvedSources } from './library.ts';

function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127);
  }
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) return publicAddress(lower.slice(7));
  return !(/^(::|::1|f[cd]|fe[89ab]|2001:db8)/i.test(lower));
}

async function safeUrl(raw: string) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port))
    throw new Error('Use a public HTTP or HTTPS article URL without credentials or a custom port.');
  if (isIP(url.hostname) || !url.hostname.includes('.') || url.hostname.endsWith('.local'))
    throw new Error('Source URLs must use a public hostname.');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => !publicAddress(item.address)))
    throw new Error('Source URL resolves to a non-public address.');
  return url;
}

async function fetchPage(raw: string) {
  let current = raw;
  for (let redirect = 0; redirect < 4; redirect++) {
    const url = await safeUrl(current);
    const response = await fetch(url, {
      redirect: 'manual', signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'FieldDeskDemo/1.0 (+article reading for human review)', Accept: 'text/html' }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Source redirect has no destination.');
      current = new URL(location, url).href;
      continue;
    }
    if (!response.ok) throw new Error('Source returned HTTP ' + response.status + '.');
    if (!response.headers.get('content-type')?.includes('text/html'))
      throw new Error('This demo supports HTML article pages only.');
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > 1_500_000) throw new Error('Source page is too large.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Source response was empty.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_500_000) { await reader.cancel(); throw new Error('Source page is too large.'); }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    return { url: url.href, html };
  }
  throw new Error('Source redirected too many times.');
}

function words(text: string) {
  return new Set((text.toLowerCase().match(/[a-z]{4,}/g) || []).filter(word => !
    ['what', 'which', 'when', 'where', 'would', 'should', 'about', 'before', 'first', 'truck', 'dump', 'with', 'from', 'this', 'that', 'their'].includes(word)));
}

export function extractEvidence(html: string, pageUrl: string, questions: string[], index: number): Source[] {
  const terms = words(questions.join(' '));
    const $ = load(html);
    $('script, style, nav, footer, header, aside, form, noscript, svg').remove();
    const title = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || $('title').text().trim() || pageUrl;
    const date = $('meta[property="article:published_time"]').attr('content') || $('time[datetime]').first().attr('datetime') || null;
    const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
    const passages = root.find('p, li').toArray().map(element => $(element).text().replace(/\s+/g, ' ').trim())
      .flatMap(text => text.split(/(?<=[.!?])\s+(?=[A-Z])/))
      .filter(text => text.length >= 55 && text.length <= 500 && !/^(cookie|privacy|subscribe|sign up)/i.test(text));
    const ranked = [...new Set(passages)].map(text => ({ text, score: [...words(text)].filter(word => terms.has(word)).length }))
      .sort((a, b) => b.score - a.score).slice(0, 5);
    if (!ranked.length) throw new Error('Source ' + (index + 1) + ' contains no readable article passages. Choose an HTML page or another source.');
    return ranked.map(({ text }, passage): Source => ({
      id: `live-${index + 1}-${passage + 1}`, title, url: pageUrl, publisher: new URL(pageUrl).hostname,
      date, geography: 'Check jurisdiction', sourceType: 'User-provided public article',
      topics: [], personas: ['starter'], kind: 'evidence', origin: 'public', extractedText: text, fact: text
    }));
}

export async function readEvidence(questions: string[], urls: string[]): Promise<Source[]> {
  const result: Source[] = [];
  for (const [index, raw] of urls.entries()) {
    let page;
    try { page = await fetchPage(raw); }
    catch (error) {
      const snapshot = approvedSources.find(item => item.url === raw && item.kind === 'evidence' && item.origin === 'public');
      if (snapshot) {
        result.push({ ...snapshot, id: `snapshot-${index + 1}`, sourceType: snapshot.sourceType + ' (stored snapshot, live fetch failed)' });
        continue;
      }
      throw new Error('Could not read source ' + (index + 1) + ': ' + (error as Error).message + ' Try another public HTML article URL.');
    }
    result.push(...extractEvidence(page.html, page.url, questions, index));
  }
  return result;
}
