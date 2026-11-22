import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Draft, Status } from '../shared/types.ts';
import { brand, personas, samples } from './library.ts';
import { demoProvider, openAIProvider, validateContent } from './providers.ts';
import type { Provider } from './providers.ts';
import { createJob } from './workflow.ts';
import { runChecks } from './review.ts';
import { createStore } from './store.ts';

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function body(request: IncomingMessage) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new RequestError(415, 'Expected JSON.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 192 * 1024) throw new RequestError(413, 'Submission is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new RequestError(400, 'Invalid JSON object.');
  }
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

export function app(directory: string, provider: Provider) {
  const store = createStore(directory);
  const dist = resolve('dist');
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/api/desk') {
        return json(response, 200, { brand, personas, samples, jobs: store.list(), mode: provider.mode });
      }
      if (request.method === 'POST' && path === '/api/jobs') {
        const { input } = await body(request);
        if (typeof input !== 'string' || !input.trim() || input.length > 24000) {
          throw new RequestError(400, 'Enter a topic, URL or article between 1 and 24,000 characters.');
        }
        let job;
        try {
          job = await createJob(input.trim(), provider);
        } catch (error) {
          throw new RequestError(422, error instanceof Error ? error.message : 'Could not create a draft.');
        }
        store.save(job);
        return json(response, 201, job);
      }
      const match = /^\/api\/jobs\/([a-f0-9-]+)\/drafts\/([a-f0-9-]+)$/.exec(path);
      if (request.method === 'PATCH' && match) {
        const patch = await body(request);
        const job = store.get(match[1]);
        const original = job?.drafts.find(item => item.id === match[2]);
        if (!job || !original) throw new RequestError(404, 'Draft not found.');
        if (patch.revision !== original.revision) throw new RequestError(409, 'This draft changed. Reload before reviewing it.');
        const status = patch.status ?? (patch.content ? 'pending' : original.status);
        if (status !== 'pending' && status !== 'approved' && status !== 'rejected') {
          throw new RequestError(400, 'Invalid review status.');
        }
        let content = original.content;
        try {
          if (patch.content !== undefined) content = validateContent(patch.content);
        } catch (error) {
          throw new RequestError(400, (error as Error).message);
        }
        const checks = runChecks(content, original.persona, original.sources);
        if (status === 'approved' && checks.warnings.length) throw new RequestError(422, 'Resolve flagged items before approval.');
        const draft: Draft = { ...original, content, ...checks, status: status as Status, revision: original.revision + 1 };
        job.drafts = job.drafts.map(item => item.id === draft.id ? draft : item);
        store.save(job);
        return json(response, 200, job);
      }
      if (request.method === 'GET' && (path === '/' || path.startsWith('/assets/'))) {
        const file = resolve(dist, path === '/' ? 'index.html' : '.' + path);
        if (!file.startsWith(dist + sep)) throw new RequestError(404, 'File not found.');
        let bytes;
        try { bytes = await readFile(file); } catch { throw new RequestError(404, 'Build the interface with npm run build.'); }
        const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
        response.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
        response.end(bytes);
        return;
      }
      throw new RequestError(404, 'Not found.');
    } catch (error) {
      if (error instanceof RequestError) return json(response, error.status, { error: error.message });
      console.error(error);
      json(response, 500, { error: 'Local server error.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const key = process.env.OPENAI_API_KEY?.trim();
  const provider = key ? openAIProvider(key, process.env.OPENAI_MODEL || 'gpt-4.1-mini') : demoProvider;
  const port = Number(process.env.PORT || 4173);
  app(resolve('local-data'), provider).listen(port, '127.0.0.1', () => {
    console.log('Field Desk is running at http://127.0.0.1:' + port + ' (' + provider.mode + ' mode)');
  });
}
