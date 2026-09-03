import { OCR_RESPONSE_SCHEMA, OCR_SYSTEM_PROMPT } from '../prompts';

type SchemaNode = {
  type?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  required?: string[];
};

const schema = OCR_RESPONSE_SCHEMA as SchemaNode;

/** Every OBJECT node, addressed by path, so a failure names the level that
 * regressed rather than just "the schema". */
function objectNodes(node: SchemaNode, path: string): [string, SchemaNode][] {
  const found: [string, SchemaNode][] = node.type === 'OBJECT' ? [[path, node]] : [];
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    found.push(...objectNodes(child, `${path}.${key}`));
  }
  if (node.items) found.push(...objectNodes(node.items, `${path}[]`));
  return found;
}

describe('OCR_RESPONSE_SCHEMA', () => {
  // Controlled generation treats a property absent from `required` as optional
  // and may omit it outright. Without `required` at every level, an answer of
  // `{"medicines": []}` satisfies the contract — the model never has to read
  // the page. This is the regression that produced zero-medicine scans.
  it.each(objectNodes(schema, 'root'))('requires every property at %s', (_path, node) => {
    const properties = Object.keys(node.properties ?? {});
    expect(properties.length).toBeGreaterThan(0);
    expect([...(node.required ?? [])].sort()).toEqual(properties.sort());
  });

  it('requires the medicines list itself at the top level', () => {
    expect(schema.required).toContain('medicines');
  });

  it('describes the medicine fields the parser reads', () => {
    const medicine = schema.properties?.medicines?.items;
    expect(Object.keys(medicine?.properties ?? {})).toEqual(
      expect.arrayContaining(['name', 'dosage', 'frequency', 'duration', 'original_text'])
    );
  });
});

describe('OCR_SYSTEM_PROMPT', () => {
  // The prompt once told the model that an empty "medicines" array was an
  // acceptable answer. At temperature 0 that made the empty reply a stable
  // attractor, so the instruction is asserted gone rather than merely absent
  // by luck.
  it('does not offer an empty medicines array as an answer', () => {
    expect(OCR_SYSTEM_PROMPT).not.toMatch(/return an empty "medicines" array/i);
  });

  it('keeps the rule against inventing medicines', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/Never invent or assume information/);
  });

  it('keeps partially legible lines instead of dropping them', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/Never drop a line you can only partly read/);
  });
});
