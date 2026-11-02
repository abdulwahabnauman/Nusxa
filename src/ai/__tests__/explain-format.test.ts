import { formatExplanationText } from '../explain-format';

const jsonResponse = JSON.stringify({
  summary: 'You have been prescribed Panadol once daily before meals for 30 days.',
  medicines: [
    {
      name: 'Panadol',
      plain_explanation: 'Panadol is a pain reliever and fever reducer.',
      how_to_take: 'Take 1 tablet before a meal, once each day, for 30 days.',
      common_side_effects: ['Nausea', 'Stomach upset'],
      food_interactions: ['Can be taken with or without food'],
      storage: 'Store below 30C',
      missed_dose_guidance: 'Take it as soon as you remember.',
      when_to_contact_doctor: 'If you develop a rash.',
      warnings: ['Do not exceed the recommended dose'],
    },
  ],
});

describe('formatExplanationText', () => {
  it('converts schema-shaped JSON into readable markdown', () => {
    const out = formatExplanationText(jsonResponse);
    expect(out).not.toContain('{"summary"');
    expect(out).toContain('You have been prescribed Panadol once daily before meals for 30 days.');
    expect(out).toContain('**Panadol**');
    expect(out).toContain('**How to take:** Take 1 tablet before a meal');
    expect(out).toContain('**Common side effects:**\n- Nausea\n- Stomach upset');
    expect(out).toContain('**Storage:** Store below 30C');
    expect(out).toContain('**Contact a doctor if:** If you develop a rash.');
  });

  it('unwraps a markdown code fence around the JSON', () => {
    const out = formatExplanationText('```json\n' + jsonResponse + '\n```');
    expect(out).not.toContain('```');
    expect(out).toContain('**Panadol**');
  });

  it('passes plain prose through unchanged', () => {
    const prose = 'Panadol is a pain reliever.\n\nTake one tablet daily.';
    expect(formatExplanationText(prose)).toBe(prose);
  });

  it('returns the original text when JSON cannot be parsed', () => {
    const broken = '{summary: missing quotes}';
    expect(formatExplanationText(broken)).toBe(broken);
  });

  it('returns the original text when the JSON has no usable fields', () => {
    const empty = '{"foo": 1}';
    expect(formatExplanationText(empty)).toBe(empty);
  });

  it('skips non-string entries in list fields', () => {
    const mixed = JSON.stringify({
      medicines: [{ name: 'A', common_side_effects: ['Nausea', 5, null, 'Rash'] }],
    });
    const out = formatExplanationText(mixed);
    expect(out).toContain('- Nausea\n- Rash');
    expect(out).not.toContain('5');
  });

  it('renders section-title-keyed JSON with an empty summary key', () => {
    const keyed = JSON.stringify({
      '': 'This prescription is for Panadol (paracetamol) to be taken as one capsule once daily before meals for 30 days.',
      'What it is for': '- Panadol is a pain reliever and fever reducer.',
      'How to take it':
        '- Take one capsule by mouth once each day.\\n- Take it before a meal.\\n- Swallow the capsule whole.',
      'Common side effects': '- Most people do not have side effects.',
    });
    const out = formatExplanationText(keyed);
    expect(out).not.toContain('{"');
    expect(out).toContain('This prescription is for Panadol');
    expect(out).toContain('**What it is for:**\n- Panadol is a pain reliever');
    expect(out).toContain('**How to take it:**\n- Take one capsule by mouth once each day.');
    expect(out).toContain('- Take it before a meal.');
    expect(out).not.toContain('\\n');
  });

  it('renders a single sentence under a titled key inline', () => {
    const keyed = JSON.stringify({ 'What it is for': 'Panadol lowers fever.' });
    expect(formatExplanationText(keyed)).toBe('**What it is for:** Panadol lowers fever.');
  });

  it('unwraps a JSON payload that was itself encoded as a JSON string', () => {
    const doubleEncoded = JSON.stringify(
      JSON.stringify({ '': 'Summary.', 'What it is for': 'Pain relief.' }),
    );
    expect(formatExplanationText(doubleEncoded)).toBe(
      'Summary.\n\n**What it is for:** Pain relief.',
    );
  });
});
