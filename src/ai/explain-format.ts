interface ExplanationMedicineJSON {
  name?: string;
  plain_explanation?: string;
  how_to_take?: string;
  common_side_effects?: unknown;
  food_interactions?: unknown;
  storage?: unknown;
  missed_dose_guidance?: string;
  when_to_contact_doctor?: string;
  warnings?: unknown;
}

interface ExplanationJSON {
  summary?: string;
  medicines?: ExplanationMedicineJSON[];
}

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];

// Providers occasionally ignore the plain-text instruction and answer with a
// JSON schema anyway; convert that into readable markdown rather than
// surfacing raw JSON to the patient.
export function formatExplanationText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const candidate = (fence?.[1] ?? trimmed).trim();
  if (!candidate.startsWith('{')) return raw;

  let parsed: ExplanationJSON;
  try {
    parsed = JSON.parse(candidate) as ExplanationJSON;
  } catch {
    return raw;
  }

  const out: string[] = [];
  if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
    out.push(parsed.summary.trim(), '');
  }
  for (const med of parsed.medicines ?? []) {
    const blocks: string[] = [];
    if (med.name?.trim()) blocks.push(`**${med.name.trim()}**`);
    if (med.plain_explanation?.trim()) blocks.push(med.plain_explanation.trim());
    if (med.how_to_take?.trim()) blocks.push(`**How to take:** ${med.how_to_take.trim()}`);
    const sideEffects = stringList(med.common_side_effects);
    if (sideEffects.length > 0) {
      blocks.push(['**Common side effects:**', ...sideEffects.map((s) => `- ${s}`)].join('\n'));
    }
    const food = stringList(med.food_interactions);
    if (food.length > 0) {
      blocks.push(['**Food interactions:**', ...food.map((s) => `- ${s}`)].join('\n'));
    }
    if (typeof med.storage === 'string' && med.storage.trim()) {
      blocks.push(`**Storage:** ${med.storage.trim()}`);
    }
    if (med.missed_dose_guidance?.trim()) {
      blocks.push(`**If a dose is missed:** ${med.missed_dose_guidance.trim()}`);
    }
    if (med.when_to_contact_doctor?.trim()) {
      blocks.push(`**Contact a doctor if:** ${med.when_to_contact_doctor.trim()}`);
    }
    const warnings = stringList(med.warnings);
    if (warnings.length > 0) {
      blocks.push(['**Warnings:**', ...warnings.map((s) => `- ${s}`)].join('\n'));
    }
    if (blocks.length > 0) out.push(blocks.join('\n\n'), '');
  }

  const text = out.join('\n').trim();
  return text.length > 0 ? text : raw;
}
