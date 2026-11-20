import { Client } from 'eve/client';
import type { Finding, ProposalSource } from '../contracts.ts';
import { fixtureSnippets, proposalSchema, type RepairProposal } from './patch.ts';

const saved = {
  operations: [
    { type: 'associate-label', findingId: 'label:email', targetId: 'email', labelText: 'Email address' },
    { type: 'set-accessible-name', findingId: 'button-name:registration-info', targetId: 'registration-info', accessibleName: 'View registration information' },
    { type: 'convert-to-button', findingId: 'keyboard:event-details', targetId: 'event-details', buttonType: 'button' },
  ],
  rationale: 'A visible label identifies the email field, an accessible name describes the information action, and a native button gives the details toggle built-in keyboard support.',
} satisfies RepairProposal;

export function liveConfigured() {
  return Boolean(process.env.ACCESSABLE_EVE_URL);
}

export async function propose(mode: ProposalSource, source: string, findings: Finding[], signal: AbortSignal) {
  if (mode === 'saved') return proposalSchema.parse(saved);
  const baseUrl = process.env.ACCESSABLE_EVE_URL;
  if (!baseUrl) throw new Error('Live AI is unavailable. Start the repair agent or use the saved proposal.');
  const turnSignal = AbortSignal.any([signal, AbortSignal.timeout(40_000)]);
  try {
    const client = new Client({
      baseUrl,
      auth: process.env.ACCESSABLE_EVE_TOKEN ? { bearer: process.env.ACCESSABLE_EVE_TOKEN } : undefined,
    });
    const { delivery } = await client.sessions.create<RepairProposal>({
      message: 'Propose repairs for the following verified findings and fixture markup:\n' + JSON.stringify(fixtureSnippets(source, findings)),
      outputSchema: proposalSchema,
      signal: turnSignal,
    });
    const result = await delivery.result({ signal: turnSignal });
    return proposalSchema.parse(result.data);
  } catch {
    throw new Error('Live AI could not return a valid proposal. Retry or use the saved proposal.');
  }
}
