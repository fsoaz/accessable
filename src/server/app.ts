import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import type { Approval, Evidence, Finding, ProposalView, RunStatus, RunView } from '../contracts.ts';
import { liveConfigured, propose } from './agent.ts';
import { auditPage, collectFindings, verificationStatus } from './audit.ts';
import { buildPatch, describeEdit, hash } from './patch.ts';

const host = '127.0.0.1';
const root = new URL('../../', import.meta.url);
const origin = (port: number) => 'http://' + host + ':' + port;
const modeSchema = z.strictObject({ source: z.enum(['live', 'saved']) });
const approvalSchema = z.strictObject({
  proposalId: z.uuid(),
  revision: z.int().positive(),
  sourceHash: z.hash('sha256'),
  proposalHash: z.hash('sha256'),
});

interface Run {
  id: string;
  controller: AbortController;
  status: RunStatus;
  source: string;
  sourceHash: string;
  lastRevision: number;
  baseline?: Evidence;
  findings: Finding[];
  proposal?: { view: Readonly<ProposalView>; candidate: string };
  consumed: Set<string>;
  applied?: { id: string; html: string };
  verification?: Evidence;
  error?: string;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: string | Buffer, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown) {
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

async function readJson(req: IncomingMessage) {
  let data = '';
  req.setEncoding('utf8');
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    data += chunk.toString();
    if (Buffer.byteLength(data) > 8_192) {
      req.resume();
      throw new HttpError(413, 'The request is too large.');
    }
  }
  try {
    return JSON.parse(data);
  } catch {
    throw new HttpError(400, 'Expected a JSON request body.');
  }
}

function listen(server: ReturnType<typeof createServer>, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

export async function startApp(options: {
  port?: number;
  previewPort?: number;
  audit?: typeof auditPage;
  repair?: typeof propose;
} = {}) {
  const audit = options.audit ?? auditPage;
  const repair = options.repair ?? propose;
  const [template, style, script, dashboard] = await Promise.all([
    readFile(new URL('fixture/index.html', root), 'utf8'),
    readFile(new URL('fixture/fixture.css', root)),
    readFile(new URL('fixture/fixture.js', root)),
    readFile(new URL('dist/index.html', root)),
  ]);
  let active: Run | undefined;
  let dashboardOrigin = '';
  let previewOrigin = '';
  const previewUrl = (run: Run, version: string) => previewOrigin + '/runs/' + run.id + '/' + version;

  function view(run: Run): RunView {
    return {
      id: run.id, status: run.status, originalUrl: previewUrl(run, 'original'),
      candidateUrl: run.applied && previewUrl(run, run.applied.id),
      baseline: run.baseline, verification: run.verification, findings: run.findings,
      proposal: run.proposal?.view, liveReady: liveConfigured(),
      patchUrl: run.status === 'verified' ? '/api/runs/' + run.id + '/patch' : undefined,
      error: run.error,
    };
  }

  function current(id: string) {
    if (active?.id !== id) throw new HttpError(404, 'This run is no longer active.');
    return active;
  }

  function newRun() {
    active?.controller.abort();
    const run: Run = {
      id: randomUUID(), source: template, sourceHash: hash(template), status: 'auditing',
      controller: new AbortController(), lastRevision: 0, findings: [], consumed: new Set(),
    };
    active = run;
    void measure(run, 'baseline', 'original');
    return run;
  }

  async function measure(run: Run, phase: 'baseline' | 'verification', version: string) {
    let result: Evidence;
    try {
      result = await audit(previewUrl(run, version), run.controller.signal);
    } catch {
      result = { scans: [], checks: [], error: 'The browser checks could not be completed.' };
    }
    if (active !== run) return;
    if (phase === 'baseline') {
      run.baseline = result;
      run.findings = collectFindings(result);
      const complete = result.scans.length === 2 && result.checks.length === 8;
      run.status = complete && !result.error ? 'baseline-ready' : 'inconclusive';
      if (run.status === 'inconclusive') run.error = result.error ?? 'The baseline browser checks were incomplete.';
      return;
    }
    run.verification = result;
    run.status = verificationStatus(result);
    if (run.status === 'inconclusive') run.error = result.error ?? 'The verification checks were incomplete.';
  }

  async function generate(run: Run, request: unknown) {
    const { source } = modeSchema.parse(request);
    if (!run.findings.length || !['baseline-ready', 'proposal-ready', 'failed', 'inconclusive'].includes(run.status)
      || (run.status === 'inconclusive' && !run.applied)) {
      throw new HttpError(409, 'A completed baseline with findings is required.');
    }
    const previous = run.status;
    run.status = 'proposing';
    run.error = undefined;
    try {
      const proposed = await repair(source, run.source, run.findings, run.controller.signal);
      current(run.id);
      const patch = buildPatch(run.source, proposed, run.findings);
      const identifiers = { proposalId: randomUUID(), revision: ++run.lastRevision, sourceHash: run.sourceHash };
      const proposalHash = hash(JSON.stringify({ ...identifiers, source, ...patch.proposal, candidate: patch.candidate }));
      run.proposal = Object.freeze({
        view: Object.freeze({
          ...identifiers, proposalHash, source, diff: patch.diff, rationale: patch.proposal.rationale,
          edits: patch.proposal.operations.map((operation) => ({
            targetId: operation.targetId, description: describeEdit(operation),
          })),
        }),
        candidate: patch.candidate,
      });
      run.verification = undefined;
      run.applied = undefined;
      run.status = 'proposal-ready';
    } catch (error) {
      current(run.id);
      run.status = previous;
      run.error = error instanceof z.ZodError ? 'The repair agent returned invalid operations.' : (error as Error).message;
      throw new HttpError(422, run.error);
    }
  }

  function apply(run: Run, request: unknown) {
    const approval: Approval = approvalSchema.parse(request);
    const proposal = run.proposal;
    if (run.status !== 'proposal-ready' || !proposal || run.consumed.has(approval.proposalId)
      || approval.proposalId !== proposal.view.proposalId || approval.revision !== proposal.view.revision
      || approval.sourceHash !== run.sourceHash || approval.proposalHash !== proposal.view.proposalHash) {
      throw new HttpError(409, 'This approval does not match the current unapplied proposal.');
    }
    run.consumed.add(approval.proposalId);
    run.applied = { id: approval.proposalId, html: proposal.candidate };
    run.error = undefined;
    run.status = 'verifying';
    void measure(run, 'verification', run.applied.id);
  }

  const previews = createServer((req, res) => {
    if (req.method !== 'GET' || req.headers.host !== new URL(previewOrigin).host) return send(res, 404, 'Preview unavailable.');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src " + previewOrigin + "; style-src " + previewOrigin
      + "; form-action 'none'; base-uri 'none'; frame-ancestors " + dashboardOrigin);
    if (req.url === '/fixture.css') return send(res, 200, style, 'text/css; charset=utf-8');
    if (req.url === '/fixture.js') return send(res, 200, script, 'text/javascript; charset=utf-8');
    const run = active;
    const content = req.url === '/template' ? template : run && (
      req.url === '/runs/' + run.id + '/original' ? run.source
        : run.applied && req.url === '/runs/' + run.id + '/' + run.applied.id ? run.applied.html : undefined
    );
    return content ? send(res, 200, content, 'text/html; charset=utf-8') : send(res, 404, 'Preview unavailable.');
  });

  const app = createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(dashboardOrigin).host) throw new HttpError(421, 'Unexpected host.');
      res.setHeader('Content-Security-Policy', "default-src 'self'; frame-src " + previewOrigin
        + "; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      const path = new URL(req.url ?? '/', dashboardOrigin).pathname;
      if (req.method === 'GET') {
        if (path === '/') return send(res, 200, dashboard, 'text/html; charset=utf-8');
        if (/^\/assets\/[\w.-]+\.(js|css)$/.test(path)) {
          const content = await readFile(new URL('dist' + path, root)).catch(() => undefined);
          if (content) return send(res, 200, content, path.endsWith('.js') ? 'text/javascript' : 'text/css');
        }
        if (path === '/api/session') return json(res, 200, {
          run: active ? view(active) : null, originalUrl: previewOrigin + '/template',
        });
        const match = /^\/api\/runs\/([\w-]+)(\/patch)?$/.exec(path);
        if (match) {
          const run = current(match[1]);
          if (!match[2]) return json(res, 200, view(run));
          if (run.status !== 'verified' || !run.proposal) throw new HttpError(409, 'Verify the patch before downloading it.');
          res.setHeader('Content-Disposition', 'attachment; filename="accessable-registration.patch"');
          return send(res, 200, run.proposal.view.diff);
        }
      }
      if (req.method === 'POST') {
        if (req.headers.origin !== dashboardOrigin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) {
          throw new HttpError(403, 'Requests must come from the dashboard.');
        }
        const data = await readJson(req);
        if (path === '/api/runs' || path === '/api/reset') {
          z.strictObject({}).parse(data);
          if (path === '/api/runs' && active) throw new HttpError(409, 'Reset the active run first.');
          return json(res, 202, view(newRun()));
        }
        const match = /^\/api\/runs\/([\w-]+)\/(proposals|apply)$/.exec(path);
        if (match) {
          const run = current(match[1]);
          if (match[2] === 'proposals') {
            await generate(run, data);
            return json(res, 201, view(run));
          }
          apply(run, data);
          return json(res, 202, view(run));
        }
      }
      throw new HttpError(404, 'Page not found.');
    } catch (error) {
      if (error instanceof HttpError) return json(res, error.status, { error: error.message });
      if (error instanceof z.ZodError) return json(res, 400, { error: 'The request is invalid.' });
      console.error(error);
      return json(res, 500, { error: 'The request could not be completed.' });
    }
  });

  try {
    previewOrigin = origin(await listen(previews, options.previewPort ?? 3411));
    dashboardOrigin = origin(await listen(app, options.port ?? 3410));
  } catch (error) {
    previews.close();
    throw error;
  }
  return {
    dashboardOrigin, previewOrigin,
    async close() {
      active?.controller.abort();
      await Promise.all([app, previews].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    },
  };
}
