import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Approval, ProposalSource, RunView } from '../contracts.ts';
import { EvidencePanel, Preview, Proposal } from './panels.tsx';
import './styles.css';

type Session = { run: RunView | null; originalUrl: string };
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    signal,
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed.');
  return data;
}

const statusLabels: Record<RunView['status'], string> = {
  auditing: 'Auditing the original page…',
  'baseline-ready': 'Baseline ready',
  proposing: 'Preparing a repair proposal…',
  'proposal-ready': 'Patch ready for review',
  verifying: 'Running a fresh browser verification…',
  verified: 'Patch verified',
  failed: 'Verification failed',
  inconclusive: 'Browser checks incomplete',
};

function App() {
  const [session, setSession] = useState<Session>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const run = session?.run;
  const runId = run?.id;
  const polling = run?.status === 'auditing' || run?.status === 'verifying' || run?.status === 'proposing';

  useEffect(() => {
    const controller = new AbortController();
    request<Session>('/api/session', undefined, controller.signal).then(setSession).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!polling || !runId || busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    function poll() {
      request<RunView>('/api/runs/' + runId, undefined, controller.signal).then((next) => {
        if (controller.signal.aborted) return;
        setSession((previous) => previous?.run?.id === next.id ? { ...previous, run: next } : previous);
        timer = setTimeout(poll, 350);
      }).catch((failure: Error) => {
        if (!controller.signal.aborted) {
          setError(failure.message);
          timer = setTimeout(poll, 1500);
        }
      });
    }
    timer = setTimeout(poll, 350);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [runId, polling, busy]);

  async function action(label: string, path: string, body: unknown) {
    setBusy(label);
    setError(undefined);
    try {
      const next = await request<RunView>(path, body);
      setSession((previous) => previous && { ...previous, run: next });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  const runPath = '/api/runs/' + runId;
  const canPropose = run && run.findings.length > 0
    && (['baseline-ready', 'proposal-ready', 'failed'].includes(run.status)
      || (run.status === 'inconclusive' && Boolean(run.candidateUrl)));
  const makeProposal = (source: ProposalSource) =>
    action(source === 'live' ? 'Preparing live proposal…' : 'Loading saved proposal…', runPath + '/proposals', { source });
  const apply = (approval: Approval) => action('Applying reviewed patch…', runPath + '/apply', approval);
  const message = busy || (run ? statusLabels[run.status] : '');

  return (
    <>
      <a className="skip" href="#main">Skip to main content</a>
      <header className="topbar">
        <div className="shell topbar-inner">
          <a className="wordmark" href="/" aria-label="AccessAble home"><span className="mark" aria-hidden="true">A</span>AccessAble</a>
          <span className="workspace"><span aria-hidden="true" /> Local workspace</span>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="shell">
        <section className="hero" aria-labelledby="headline">
          <div>
            <p className="eyebrow">Accessibility repair workbench</p>
            <h1 id="headline">Make the web <em>work for everyone.</em></h1>
            <p className="intro">Find barriers in an event registration page, review the repair, and verify the difference in a real browser.</p>
          </div>
          <div className="hero-actions">
            {run ? <button className="button secondary" type="button" disabled={Boolean(busy)}
              onClick={() => void action('Resetting demo…', '/api/reset', {})}>Reset demo</button>
              : <button className="button primary" type="button" disabled={!session || Boolean(busy)}
                onClick={() => void action('Starting audit…', '/api/runs', {})}>Run baseline audit <span aria-hidden="true">↗</span></button>}
            {run?.patchUrl && <a className="button primary" href={run.patchUrl}>Download patch <span aria-hidden="true">↓</span></a>}
          </div>
        </section>

        <nav aria-label="Workbench sections" className="section-nav">
          <a href="#findings">Findings</a>
          <a href="#previews">Page comparison</a>
          {run?.proposal && <a href="#proposal">Patch review</a>}
          {run?.baseline && <a href="#evidence">Verification evidence</a>}
        </nav>
        <p className={'status ' + (run?.status === 'verified' ? 'success' : '')} role="status">{message}</p>
        {(error || run?.error) && <p className="notice" role="alert">{error || run?.error}</p>}

        <div className="workbench">
          <section id="findings" className="panel findings" aria-labelledby="findings-heading">
            <div className="panel-heading">
              <h2 id="findings-heading">Audit findings</h2>
              {Boolean(run?.findings.length) && <span className="count">{run?.findings.length}</span>}
            </div>
            {run?.findings.length ? <ul className="finding-list">
              {run.findings.map((finding) => <li key={finding.id}>
                <div className="finding-type">{finding.category === 'axe' ? 'Axe scan' : 'Keyboard test'}</div>
                <h3>{finding.title}</h3>
                <p>{finding.impact}</p>
                <code>#{finding.targetId}</code>
              </li>)}
            </ul> : <p className="muted empty">Run the audit to see the barriers in this page.</p>}
            {canPropose && <div className="proposal-actions">
              <button className={run.liveReady ? 'button primary' : 'button secondary'} type="button"
                disabled={!run.liveReady || Boolean(busy)} onClick={() => void makeProposal('live')}>Generate live proposal</button>
              <button className={run.liveReady ? 'button secondary' : 'button primary'} type="button"
                disabled={Boolean(busy)} onClick={() => void makeProposal('saved')}>Use saved proposal</button>
              {!run.liveReady && <p className="muted">Live AI is offline. Saved replay runs the same verification.</p>}
            </div>}
          </section>

          <section id="previews" className="panel comparison" aria-labelledby="previews-heading">
            <div className="panel-heading"><h2 id="previews-heading">Page comparison</h2></div>
            <div className="previews">
              <Preview label="Original" url={run?.originalUrl ?? session?.originalUrl} />
              <Preview label="After applying" url={run?.candidateUrl} />
            </div>
            <p className="preview-hint">Try Tab inside each preview to follow the registration controls.</p>
          </section>
        </div>

        {run?.proposal && <Proposal proposal={run.proposal} canApply={run.status === 'proposal-ready' && !busy} onApply={apply} />}
        {run?.baseline && <EvidencePanel baseline={run.baseline} verification={run.verification} />}
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
