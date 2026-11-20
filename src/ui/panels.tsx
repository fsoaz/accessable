import type { Approval, Evidence, ProposalView } from '../contracts.ts';

export function Preview({ label, url }: { label: string; url?: string }) {
  return <div className="preview">
    <h3>{label}</h3>
    {url ? <iframe title={label + ' event registration preview'} src={url} sandbox="allow-scripts allow-forms" />
      : <div className="preview-placeholder"><p>The repaired page appears after you approve the patch.</p></div>}
  </div>;
}

export function Proposal({ proposal, canApply, onApply }: {
  proposal: ProposalView;
  canApply: boolean;
  onApply: (approval: Approval) => void;
}) {
  const { proposalId, revision, sourceHash, proposalHash } = proposal;
  return <section id="proposal" className="panel detail-panel" aria-labelledby="proposal-heading">
    <div className="panel-heading"><h2 id="proposal-heading">Patch review</h2>
      <span className="tag">{proposal.source === 'saved' ? 'Saved replay' : 'Live AI'} · Revision {revision}</span>
    </div>
    <div className="panel-body">
      <p>{proposal.rationale}</p>
      <ul className="edit-list">
        {proposal.edits.map((edit) => <li key={edit.targetId}><code>#{edit.targetId}</code> {edit.description}</li>)}
      </ul>
      <pre className="diff" tabIndex={0} aria-label="Unified HTML diff"><code>
        {proposal.diff.split('\n').map((line, index) => <span className={line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : ''}
          key={index}>{line}{'\n'}</span>)}
      </code></pre>
      <button className="button primary" type="button" disabled={!canApply}
        onClick={() => onApply({ proposalId, revision, sourceHash, proposalHash })}>Approve and verify <span aria-hidden="true">↗</span></button>
    </div>
  </section>;
}

export function EvidencePanel({ baseline, verification }: { baseline: Evidence; verification?: Evidence }) {
  const states = ['initial', 'expanded'] as const;
  const checks = new Map([...baseline.checks, ...(verification?.checks ?? [])].map((check) => [check.id, check.label]));
  function outcome(evidence: Evidence | undefined, id: string) {
    const check = evidence?.checks.find((item) => item.id === id);
    return check ? <span className={check.passed ? 'passed' : 'failed'}>{check.passed ? 'Pass' : 'Fail'}</span> : 'Pending';
  }
  return <section id="evidence" className="panel detail-panel" aria-labelledby="evidence-heading">
    <div className="panel-heading"><h2 id="evidence-heading">Verification evidence</h2>
      {baseline.browser && <span className="tag">Chromium {baseline.browser}</span>}
    </div>
    <div className="panel-body">
      <h3>Automated axe coverage</h3>
      <div className="metrics">
        {states.map((state) => {
          const before = baseline.scans.find((scan) => scan.state === state);
          const after = verification?.scans.find((scan) => scan.state === state);
          return <div className="metric" key={state}>
            <h4>{state === 'initial' ? 'Initial page' : 'Details expanded'}</h4>
            <dl>
              <div><dt>Failing rules</dt><dd>{before?.rules ?? '—'} → {after?.rules ?? '—'}</dd></div>
              <div><dt>Affected nodes</dt><dd>{before?.affectedNodes ?? '—'} → {after?.affectedNodes ?? '—'}</dd></div>
            </dl>
            {Boolean(after?.violations.length) && <ul className="edit-list">
              {after?.violations.map((violation) => <li key={violation.rule}>
                {violation.description} <code>{violation.targets.join(', ')}</code>
              </li>)}
            </ul>}
          </div>;
        })}
      </div>
      <h3>Browser interaction checks</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Check</th><th scope="col">Original</th><th scope="col">After applying</th></tr></thead>
          <tbody>{Array.from(checks, ([id, label]) => <tr key={id}>
            <th scope="row">{label}</th><td>{outcome(baseline, id)}</td><td>{outcome(verification, id)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </section>;
}
