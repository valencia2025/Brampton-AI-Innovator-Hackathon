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
  const [urls, setUrls] = useState('');
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
    const urlLines = urls.split('\n').map(line => line.trim()).filter(Boolean);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = urlLines.length
        ? await api<Job>('/api/starter', 'POST', {
            questions: input.split('\n').map(line => line.trim()).filter(Boolean), urls: urlLines
          })
        : await api<Job>('/api/jobs', 'POST', { input });
      updateJob(updated);
      setPage('review');
      setInput('');
      setUrls('');
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
    <header className="topbar">
      <button type="button" className="brand" onClick={() => navigate('submit')} aria-label="ContextIQ home">Context<span>IQ</span></button>
      <p>Turn trusted sources into video scripts for review.</p>
      <nav aria-label="Workspace">
        <button aria-current={page === 'submit' ? 'page' : undefined} onClick={() => navigate('submit')}>New submission</button>
        <button aria-current={page === 'review' ? 'page' : undefined} onClick={() => navigate('review')}>Review queue <b>{pendingCount}</b></button>
      </nav>
    </header>
    <main>
      <div className="workspace">
        {error && <p role="alert" className="alert">{error}</p>}
        {notice && <p role="status" className="notice">{notice}</p>}
        {page === 'submit' ? <>
          <section className="submission" aria-label="New submission">
            <section className="agent-flow" aria-label="Agent workflow">
              <div className="agent-flow-cards">
                <div className="agent-card">
                  <span className="agent-icon" aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none"><circle cx="13" cy="13" r="8" stroke="currentColor" strokeWidth="2.5" /><path d="m19 19 9 9" stroke="currentColor" strokeWidth="2.5" /></svg>
                  </span>
                  <h3>Research Agent</h3>
                  <p>Finds source material for the question.</p>
                </div>
                <div className="agent-connector" aria-hidden="true" />
                <div className="agent-card">
                  <span className="agent-icon" aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none"><path d="m8 8 17 9L8 25" stroke="currentColor" strokeWidth="2" /><circle cx="8" cy="8" r="4" fill="currentColor" /><circle cx="25" cy="17" r="4" fill="currentColor" /><circle cx="8" cy="25" r="4" fill="currentColor" /></svg>
                  </span>
                  <h3>Content Orchestration Agent</h3>
                  <p>Turns the research into content drafts.</p>
                </div>
              </div>
            </section>
            <div className="workflow-to-form" aria-hidden="true"><span /></div>
            <form onSubmit={submit} className="submission-form">
              <label htmlFor="submission-input">Question or topic <small>One question per line for linked sources</small></label>
              <textarea id="submission-input" value={input} onChange={event => setInput(event.target.value)} maxLength={24000}
                placeholder="Ask your question here." rows={2} required />
              <div className="sample-buttons" role="group" aria-label="Try a sample">{desk?.samples.filter(sample => sample.label !== 'Both personas').map(sample =>
                <button type="button" key={sample.label} onClick={() => {
                  setInput(sample.input);
                  setUrls('');
                  document.getElementById('submission-input')?.focus();
                }}>+ {sample.label}</button>
              )}</div>
              <div className="flow-arrow vertical source-arrow" aria-hidden="true" />
              <label htmlFor="evidence-urls">Source URLs <small>Optional; one public web page per line, up to 5</small></label>
              <textarea id="evidence-urls" rows={2} value={urls} onChange={event => setUrls(event.target.value)}
                placeholder="Add your credible sources here." />
              <div className="form-footer">
                <small>{urls.trim() ? 'Linked sources use the configured API key.' : 'Sample topics work without an API key.'}</small>
                <button className="primary" disabled={busy || !desk || !input.trim()}>{busy ? 'Preparing review...' : 'Create review'}</button>
              </div>
            </form>
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
    <footer className="site-footer">© 2026 Idea Alchemists · Brampton AI Innovator Hackathon. All rights reserved.</footer>
  </div>;
}

function buildHiggsfieldPrompt(draft: Draft, content: Content) {
  const scenes = content.shots.map((shot, index) =>
    `${index + 1}. Visual: ${shot.visual}\n   Audio: ${shot.audio}`
  ).join('\n');
  return `Create a polished 9:16 vertical video for ${draft.persona.audience}.\n\n` +
    `Tone and voice: ${draft.persona.voice}\n` +
    `Content angle: ${content.angle}\n` +
    `Opening hook: ${content.hook}\n\n` +
    `Storyboard:\n${scenes}\n\n` +
    `Voiceover script:\n${content.script}\n\n` +
    `Keep the visuals realistic and the pacing clear. Use only the supplied script and scene details for factual claims. ` +
    `Do not add statistics, logos, or unsupported claims. Keep any on-screen text brief and readable.\n\n` +
    `Publishing caption (not voiceover):\n${content.caption}`;
}

function DraftCard({ draft, busy, save }: {
  draft: Draft; busy: boolean;
  save: (patch: { content?: Content; status?: Status }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(draft.content);
  const [copyMessage, setCopyMessage] = useState('');
  const higgsfieldPrompt = buildHiggsfieldPrompt(draft, content);
  const fields = [['angle', 'Content angle'], ['fit', 'Why it fits'], ['answer', 'Answer grounded in sources'], ['hook', 'Hook'], ['script', 'Script'], ['caption', 'Caption']] as const;
  const activeFields = fields.filter(([key]) => key !== 'answer' || content.answer !== undefined);
  return <article className="card draft">
    <header>
      <div><span className="eyebrow">AI-GENERATED PERSONA</span><h2>{draft.persona.name}</h2><p>{draft.persona.audience}</p></div>
      <span className={'status ' + draft.status}>{draft.status === 'pending' ? 'Needs review' : draft.status}</span>
    </header>
    {!editing && <section className="higgsfield-prompt" aria-label="Higgsfield video prompt">
      <div className="prompt-heading">
        <div><h3>Higgsfield video prompt</h3><p>Review the draft, then copy this prompt into Higgsfield.</p></div>
        <button type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(higgsfieldPrompt);
            setCopyMessage('Copied to clipboard');
          } catch {
            setCopyMessage('Copy failed. Select the prompt text instead.');
          }
        }}>Copy prompt</button>
      </div>
      <textarea readOnly aria-label="Higgsfield prompt text" value={higgsfieldPrompt} rows={8} />
      {copyMessage && <small role="status">{copyMessage}</small>}
    </section>}
    {editing ? <form className="edit-form" onSubmit={async event => {
      event.preventDefault();
      if (await save({ content: { ...content, assumptions: content.assumptions.filter(item => item.trim()) } })) setEditing(false);
    }}>
      {activeFields.map(([key, label]) => <label key={key}>{label}
        <textarea value={content[key] ?? ''} rows={key === 'script' || key === 'answer' ? 6 : 2} required
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
      {content.evidence?.map((item, index) => <fieldset key={index}><legend>Claim citation {index + 1}</legend>
        <label>Exact claim wording
          <textarea value={item.statement} rows={2} onChange={event => setContent({ ...content, evidence: content.evidence?.map((entry, i) => i === index ? { ...entry, statement: event.target.value } : entry) })} />
        </label>
        <label>Supporting source
          <select value={item.sourceId} onChange={event => {
            const source = draft.sources.find(source => source.id === event.target.value);
            setContent({ ...content, evidence: content.evidence?.map((entry, i) => i === index ? { ...entry, sourceId: event.target.value, excerpt: source?.extractedText ?? '' } : entry) });
          }}>{draft.sources.map(source => <option key={source.id} value={source.id}>{source.publisher}: {source.extractedText.slice(0, 90)}</option>)}</select>
        </label>
        <button type="button" onClick={() => setContent({ ...content, evidence: content.evidence?.filter((_, i) => i !== index) })}>Remove citation</button>
      </fieldset>)}
      <label>Assumptions and verification items, one per line
        <textarea rows={3} value={content.assumptions.join('\n')} onChange={event => setContent({ ...content, assumptions: event.target.value.split('\n') })} />
      </label>
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => { setContent(draft.content); setEditing(false); }}>Cancel</button>
        <button className="primary" disabled={busy}>Save edits</button>
      </div>
    </form> : <>
      <div className="copy">{activeFields.map(([key, label]) => <section key={key}><h3>{label}</h3><p>{content[key]}</p></section>)}</div>
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
