import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Job } from '../shared/types.ts';

export function createStore(directory: string) {
  mkdirSync(directory, { recursive: true });
  function get(id: string): Job | undefined {
    if (!/^[a-f0-9-]{36}$/.test(id)) return;
    try {
      return JSON.parse(readFileSync(join(directory, id + '.json'), 'utf8')) as Job;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return {
    get,
    list() {
      return readdirSync(directory).filter(file => file.endsWith('.json'))
        .map(file => get(file.slice(0, -5))).filter(job => job !== undefined)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    save(job: Job) {
      const temporary = join(directory, randomUUID() + '.tmp');
      writeFileSync(temporary, JSON.stringify(job, null, 2), 'utf8');
      renameSync(temporary, join(directory, job.id + '.json'));
    }
  };
}
