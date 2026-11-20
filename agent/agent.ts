import { defineAgent } from 'eve';

const model = process.env.ACCESSABLE_MODEL;
if (!model) throw new Error('Set ACCESSABLE_MODEL to an AI Gateway model ID.');

export default defineAgent({ model, defaultTools: false, tool: false });
