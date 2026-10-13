import { buildGeminiRequest } from './gemini.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

describe('buildGeminiRequest', () => {
  const toolNames = ['search_products', 'get_product', 'list_categories'];

  it('builds a first turn with the system instruction, tools, store and stream', () => {
    const request = buildGeminiRequest({ model: 'gemini-3.8-flash', input: 'hello' });

    expect(request).toMatchObject({
      model: 'gemini-3.8-flash',
      input: 'hello',
      system_instruction: SYSTEM_PROMPT,
      store: true,
      stream: true,
    });
    expect(request.tools?.map((tool) => ('name' in tool ? tool.name : undefined))).toEqual(toolNames);
    expect(request.tools?.every((tool) => tool.type === 'function')).toBe(true);
    expect(request).not.toHaveProperty('previous_interaction_id');
  });

  it('still includes the system instruction and tools when returning function results', () => {
    const request = buildGeminiRequest({
      model: 'gemini-3.8-flash',
      previousInteractionId: 'v1_abc',
      input: [
        { type: 'function_result', name: 'list_categories', call_id: 'c1', result: [{ type: 'text', text: '{}' }] },
      ],
    });

    expect(request.previous_interaction_id).toBe('v1_abc');
    expect(request.system_instruction).toBe(SYSTEM_PROMPT);
    expect(request.tools).toHaveLength(3);
  });

  it('keeps the system prompt free of catalogue data', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/Heritage|Kestrel|KT-07|H2835/i);
  });
});
