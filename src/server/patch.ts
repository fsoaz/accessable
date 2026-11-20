import { createHash } from 'node:crypto';
import { createTwoFilesPatch } from 'diff';
import { defaultTreeAdapter as tree, html, parse, serializeOuter, type DefaultTreeAdapterTypes } from 'parse5';
import { z } from 'zod';
import type { Finding } from '../contracts.ts';

const text = z.string().trim().min(1).max(160);
const target = { findingId: text, targetId: text };
export const proposalSchema = z.strictObject({
  operations: z.array(z.discriminatedUnion('type', [
    z.strictObject({ ...target, type: z.literal('associate-label'), labelText: text }),
    z.strictObject({ ...target, type: z.literal('set-accessible-name'), accessibleName: text }),
    z.strictObject({ ...target, type: z.literal('convert-to-button'), buttonType: z.literal('button') }),
  ])).min(1).max(3),
  rationale: z.string().trim().min(1).max(1000),
});
export type RepairProposal = z.infer<typeof proposalSchema>;

export function describeEdit(operation: RepairProposal['operations'][number]) {
  switch (operation.type) {
    case 'associate-label':
      return 'Associate the visible label “' + operation.labelText + '” with the email field.';
    case 'set-accessible-name':
      return 'Announce the information button as “' + operation.accessibleName + '”.';
    case 'convert-to-button':
      return 'Use a native details button so Tab, Enter, and Space work.';
  }
}

export const targets = {
  email: { finding: 'label:email', operation: 'associate-label' },
  'registration-info': { finding: 'button-name:registration-info', operation: 'set-accessible-name' },
  'event-details': { finding: 'keyboard:event-details', operation: 'convert-to-button' },
} as const;

export function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

type Element = DefaultTreeAdapterTypes.Element;
type Node = DefaultTreeAdapterTypes.Node;
function allElements(node: Node): Element[] {
  const children = 'childNodes' in node ? node.childNodes.flatMap(allElements) : [];
  return tree.isElementNode(node) ? [node, ...children] : children;
}

function attr(element: Element, name: string) {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

export function fixtureSnippets(source: string, findings: Finding[]) {
  const elements = allElements(parse(source));
  return findings.map((finding) => ({
    ...finding,
    html: elements.filter((element) => attr(element, 'id') === finding.targetId).map((element) => serializeOuter(element)).join('\n'),
  }));
}

export function buildPatch(source: string, unvalidated: unknown, findings: Finding[]) {
  const proposal = proposalSchema.parse(unvalidated);
  const elements = allElements(parse(source, { sourceCodeLocationInfo: true }));
  const ids = new Map<string, Element>();
  for (const element of elements) {
    const id = attr(element, 'id');
    if (id === undefined) continue;
    if (!id || ids.has(id)) throw new Error('Fixture IDs must be unique and nonempty.');
    ids.set(id, element);
  }

  const used = new Set<string>();
  const edits = proposal.operations.map((operation) => {
    const { targetId, findingId } = operation;
    const allowed = targets[targetId as keyof typeof targets];
    const element = ids.get(targetId);
    if (!element || !allowed || allowed.finding !== findingId || allowed.operation !== operation.type
        || !findings.some((finding) => finding.id === findingId && finding.targetId === targetId)
        || used.has(targetId)) {
      throw new Error('Each repair must match a distinct eligible baseline finding.');
    }
    used.add(targetId);
    const location = element.sourceCodeLocation;
    if (!location?.startTag) throw new Error('The target has no editable source range.');
    const { startOffset, endOffset } = location;

    switch (operation.type) {
      case 'associate-label': {
        if (element.tagName !== 'input' || attr(element, 'type') !== 'email'
          || elements.some((item) => item.tagName === 'label' && (attr(item, 'for') === targetId || item.childNodes.includes(element)))) {
          throw new Error('The target must be an unlabeled email field.');
        }
        const label = tree.createElement('label', html.NS.HTML, [{ name: 'for', value: targetId }]);
        tree.insertText(label, operation.labelText);
        const lineStart = source.lastIndexOf('\n', startOffset - 1) + 1;
        const indentation = source.slice(lineStart, startOffset);
        return { startOffset, endOffset: startOffset, replacement: serializeOuter(label) + '\n' + indentation };
      }
      case 'set-accessible-name': {
        if (element.tagName !== 'button' || attr(element, 'aria-label') !== undefined || attr(element, 'aria-labelledby') !== undefined) {
          throw new Error('The target must be the unnamed information button.');
        }
        element.attrs.push({ name: 'aria-label', value: operation.accessibleName });
        return { startOffset, endOffset, replacement: serializeOuter(element) };
      }
      case 'convert-to-button': {
        if (element.tagName !== 'div' || !ids.has('details-panel')) throw new Error('The target must be the fixture details toggle.');
        const button = tree.createElement('button', html.NS.HTML, [
          ...element.attrs,
          { name: 'type', value: operation.buttonType },
          { name: 'aria-controls', value: 'details-panel' },
          { name: 'aria-expanded', value: 'false' },
        ]);
        button.childNodes = element.childNodes;
        return { startOffset, endOffset, replacement: serializeOuter(button) };
      }
    }
  });

  const candidate = edits.sort((a, b) => b.startOffset - a.startOffset).reduce(
    (current, edit) => current.slice(0, edit.startOffset) + edit.replacement + current.slice(edit.endOffset), source,
  );
  const diff = createTwoFilesPatch('a/fixture/index.html', 'b/fixture/index.html', source, candidate, '', '');
  return { candidate, diff, proposal };
}
