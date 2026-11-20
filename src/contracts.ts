export type ProposalSource = 'live' | 'saved';
export type RunStatus =
  | 'auditing' | 'baseline-ready' | 'proposing' | 'proposal-ready'
  | 'verifying' | 'verified' | 'failed' | 'inconclusive';

export interface Finding {
  id: string;
  targetId: string;
  category: 'axe' | 'keyboard';
  title: string;
  impact: string;
}

export interface Scan {
  state: 'initial' | 'expanded';
  rules: number;
  affectedNodes: number;
  violations: { rule: string; description: string; targets: string[] }[];
}

export interface Check {
  id: string;
  label: string;
  passed: boolean;
}

export interface Evidence {
  browser?: string;
  scans: Scan[];
  checks: Check[];
  error?: string;
}

export interface Approval {
  proposalId: string;
  revision: number;
  sourceHash: string;
  proposalHash: string;
}

export interface ProposalView extends Approval {
  source: ProposalSource;
  diff: string;
  rationale: string;
  edits: { targetId: string; description: string }[];
}

export interface RunView {
  id: string;
  status: RunStatus;
  originalUrl: string;
  candidateUrl?: string;
  baseline?: Evidence;
  verification?: Evidence;
  findings: Finding[];
  proposal?: ProposalView;
  patchUrl?: string;
  liveReady: boolean;
  error?: string;
}
