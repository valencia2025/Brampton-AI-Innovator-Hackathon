import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Brand, Content, Draft, Job, Persona, Sample, Status } from '../shared/types.ts';
import './style.css';

type Desk = { brand: Brand; personas: Persona[]; samples: Sample[]; jobs: Job[]; mode: Job['mode'] };
type Page = 'submit' | 'review';

async function api<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(path, {
    method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function App() {
  const [desk, setDesk] = useState<Desk>();
  const [input, setInput] = useState('');
  const [page, setPage] = useState<Page>('submit');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const job = desk?.jobs.find(item => item.id === selected) ?? desk?.jobs[0];
  const pendingCount = desk?.jobs.flatMap(item => item.drafts).filter(item => item.status === 'pending').length ?? 0;

  useEffect(() => {
    api<Desk>('/api/desk').then(setDesk).catch(error => setError(error.message));
  }, []);

  function updateJob(updated: Job) {
    setDesk(current => current && ({
      ...current, jobs: [updated, ...current.jobs.filter(item => item.id !== updated.id)]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }));
    setSelected(updated.id);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      updateJob(await api<Job>('/api/jobs', 'POST', { input }));
      setPage('review');
      setInput('');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateDraft(draft: Draft, patch: { content?: Content; status?: Status }) {
    if (!job) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      updateJob(await api<Job>('/api/jobs/' + job.id + '/drafts/' + draft.id, 'PATCH', { ...patch, revision: draft.revision }));
      setNotice(patch.status === 'approved' ? 'Draft approved and saved locally.' :
        patch.status === 'rejected' ? 'Draft rejected.' : 'Changes saved. Checks reran on the edited copy.');
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function navigate(next: Page) {
    setPage(next);
    setError('');
    setNotice('');
  }

  return <div className="layout">
    <aside className="sidebar">
      <div className="brand"><span className="mark" aria-hidden="true">▰</span><div>{desk?.brand.workspaceName ?? 'Field Desk'}<small>BRAMPTON CONTENT STUDIO</small></div></div>
      <nav aria-label="Workspace">
        <button aria-current={page === 'submit' ? 'page' : undefined} onClick={() => navigate('submit')}><span aria-hidden="true">＋</span> New submission</button>
        <button aria-current={page === 'review' ? 'page' : undefined} onClick={() => navigate('review')}><span aria-hidden="true">▤</span> Review queue <b>{pendingCount}</b></button>
      </nav>
      <div className="sidebar-footer"><span className="status-dot" /> Local workspace</div>
    </aside>
    <main>
      <header className="topbar"><span>Editorial workspace</span><span className="mode">{desk?.mode === 'ai' ? 'AI generation' : 'Demo mode'}</span></header>
      <div className="workspace">
        {error && <p role="alert" className="alert">{error}</p>}
        {notice && <p role="status" className="notice">{notice}</p>}
        {page === 'submit' ? <>
          <section className="hero">
            <span className="eyebrow">CHALLENGE 3B</span>
            <h1>New submission</h1>
            <p>Turn industry news and questions into short-video drafts for coordinator review.</p>
          </section>
          <div className="submission-grid">
            <section className="card compose">
              <h2>What should we cover?</h2>
              <form onSubmit={submit}>
                <label htmlFor="submission-input">Topic, article URL, or pasted text</label>
                <textarea id="submission-input" value={input} onChange={event => setInput(event.target.value)} maxLength={24000}
                  placeholder="e.g. What should I check before buying my first dump truck?" rows={7} required />
                <div className="form-footer">
                  <small>{input.length.toLocaleString()} / 24,000</small>
                  <button className="primary" disabled={busy || !desk || !input.trim()}>{busy ? 'Preparing review…' : 'Create review'}</button>
                </div>
              </form>
            </section>
            <section className="card examples">
              <h2>Try a demo topic</h2>
              <p>Load an example into the submission field.</p>
              {desk?.samples.map(sample => <button key={sample.label} onClick={() => {
                setInput(sample.input);
                document.getElementById('submission-input')?.focus();
              }}>{sample.label}<span aria-hidden="true">＋</span></button>)}
            </section>
          </div>
          <section className="personas">
            <h2>Editorial personas</h2>
            <div className="persona-grid">{desk?.personas.map(persona => <div key={persona.id} className="card persona">
              <span className={'persona-icon ' + persona.id} aria-hidden="true">{persona.id === 'scout' ? '◈' : '◒'}</span>
              <div><h3>{persona.name}</h3><span className="eyebrow">AI-GENERATED PERSONA</span><p>{persona.audience}</p></div>
            </div>)}</div>
          </section>
        </> : <>
          <section className="hero">
            <span className="eyebrow">COORDINATOR WORKSPACE</span>
            <h1>Review queue</h1>
            <p>Inspect the routing, compare angles, and review the copy against its sources.</p>
          </section>
          {!job ? <div className="card empty"><h2>No submissions yet</h2><button className="primary" onClick={() => navigate('submit')}>New submission</button></div> : <>
            <section className="card result">
              <label htmlFor="job-picker">Submission</label>
              <select id="job-picker" value={job.id} disabled={busy} onChange={event => {
                setSelected(event.target.value); setError(''); setNotice('');
              }}>{desk?.jobs.map(item => <option key={item.id} value={item.id}>{item.input.replace(/\s+/g, ' ').slice(0, 105)}</option>)}</select>
              <details className="input-details"><summary>Read original submission</summary><p>{job.input}</p></details>
              <div className="result-line"><h2>{job.drafts.length ? 'Routing decision' : 'Set aside'}</h2>
                <span className="mode">{job.mode === 'demo' ? 'Sample output' : 'AI-generated draft'}</span>
              </div>
              {job.drafts.length > 0 && <div className="tags">{job.drafts.map(item => <span key={item.id}>{item.persona.name}</span>)}</div>}
              <p>{job.decision.reason}</p>
            </section>
            {job.drafts.length === 2 && <section className="comparison"><h2>Compare angles</h2><div className="persona-grid">
              {job.drafts.map(item => <div className="card angle" key={item.id}>
                <span className="eyebrow">{item.persona.name}</span><h3>{item.content.angle}</h3><p>{item.content.fit}</p>
              </div>)}
            </div></section>}
            <div className="draft-list">{job.drafts.map(draft =>
              <DraftCard key={draft.id + '-' + draft.revision} draft={draft} busy={busy}
                save={(patch) => updateDraft(draft, patch)} />)}</div>
          </>}
        </>}
      </div>
    </main>
  </div>;
}

function DraftCard({ draft, busy, save }: {
  draft: Draft; busy: boolean;
  save: (patch: { content?: Content; status?: Status }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(draft.content);
  const fields = [['angle', 'Content angle'], ['fit', 'Why it fits'], ['hook', 'Hook'], ['script', 'Script'], ['caption', 'Caption']] as const;
  return <article className="card draft">
    <header>
      <div><span className="eyebrow">AI-GENERATED PERSONA</span><h2>{draft.persona.name}</h2><p>{draft.persona.audience}</p></div>
      <span className={'status ' + draft.status}>{draft.status === 'pending' ? 'Needs review' : draft.status}</span>
    </header>
    {editing ? <form className="edit-form" onSubmit={async event => {
      event.preventDefault();
      if (await save({ content: { ...content, assumptions: content.assumptions.filter(item => item.trim()) } })) setEditing(false);
    }}>
      {fields.map(([key, label]) => <label key={key}>{label}
        <textarea value={content[key]} rows={key === 'script' ? 6 : 2} required
          onChange={event => setContent({ ...content, [key]: event.target.value })} />
      </label>)}
      {content.shots.map((shot, index) => <fieldset key={index}><legend>Shot {index + 1}</legend>
        {(['visual', 'audio'] as const).map(key => <label key={key}>{key === 'visual' ? 'Visual' : 'Audio'}
          <textarea value={shot[key]} required rows={2} onChange={event => {
            const shots = content.shots.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item);
            setContent({ ...content, shots });
          }} />
        </label>)}
      </fieldset>)}
      <label>Assumptions and verification items, one per line
        <textarea rows={3} value={content.assumptions.join('\n')} onChange={event => setContent({ ...content, assumptions: event.target.value.split('\n') })} />
      </label>
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => { setContent(draft.content); setEditing(false); }}>Cancel</button>
        <button className="primary" disabled={busy}>Save edits</button>
      </div>
    </form> : <>
      <div className="copy">{fields.map(([key, label]) => <section key={key}><h3>{label}</h3><p>{content[key]}</p></section>)}</div>
      <section className="detail"><h3>Storyboard</h3><ol className="shots">
        {content.shots.map((shot, i) => <li key={i}><b>Visual</b><p>{shot.visual}</p><b>Audio</b><p>{shot.audio}</p></li>)}
      </ol></section>
    </>}
    <section className="detail">
      <h3>Claims and evidence</h3>
      {draft.claims.length ? draft.claims.map(claim => <div key={claim.statement} className="claim">
        <strong>{claim.statement}</strong>
        {claim.source ? <>
          <blockquote>{claim.source.extractedText}</blockquote>
          <a href={claim.source.url!} target="_blank" rel="noreferrer">{claim.source.publisher} · {claim.source.title}</a>
          <small>{claim.source.geography}</small>
        </> : <p className="unsupported">Unsupported by the approved library</p>}
      </div>) : <p>No factual claims detected.</p>}
      {draft.sources.length > 0 && <details><summary>Retrieved material</summary><ul>
        {draft.sources.map(source => <li key={source.id}>
          <strong>{source.title}</strong> · {source.kind === 'insight' ? 'Audience insight' : 'Factual evidence'} · {source.origin}
          <p>{source.extractedText}</p>
          {source.url && <a href={source.url} target="_blank" rel="noreferrer">{source.publisher}</a>}
        </li>)}
      </ul></details>}
    </section>
    <section className="detail">
      <h3>Warnings and assumptions</h3>
      {draft.warnings.length > 0 && <ul className="alert">{draft.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      {draft.content.assumptions.length > 0 && <ul>{draft.content.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {!draft.warnings.length && !draft.content.assumptions.length && <p>No items flagged.</p>}
    </section>
    {!editing && <footer className="actions">
      <button disabled={busy} onClick={() => setEditing(true)}>Edit draft</button>
      <button disabled={busy || draft.status === 'rejected'} onClick={() => void save({ status: 'rejected' })}>Reject</button>
      <button className="primary" disabled={busy || draft.status === 'approved' || draft.warnings.length > 0}
        onClick={() => void save({ status: 'approved' })}>Approve locally</button>
    </footer>}
  </article>;
}

createRoot(document.getElementById('root')!).render(<App />);
