interface ExplanationMedicineJSON {
  name?: unknown;
  plain_explanation?: unknown;
  how_to_take?: unknown;
  common_side_effects?: unknown;
  food_interactions?: unknown;
  storage?: unknown;
  missed_dose_guidance?: unknown;
  when_to_contact_doctor?: unknown;
  warnings?: unknown;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((entry) => text(entry)).filter((entry) => entry.length > 0)
    : [];

// Some providers double-encode the payload, so a section body can arrive with
// literal "\n" instead of real line breaks.
const unescape = (value: string): string =>
  value.replace(/\\([nt"\\])/g, (_match, c: string) =>
    c === 'n' ? '\n' : c === 't' ? '\t' : c,
  );

const sectionLines = (value: unknown): string[] => {
  const raw = typeof value === 'string' ? [value] : stringList(value);
  return raw.flatMap((entry) => unescape(entry).trim().split('\n')).map((line) => line.trim()).filter(Boolean);
};

const renderSection = (title: string, value: unknown): string[] => {
  const lines = sectionLines(value);
  if (lines.length === 0) return [];
  const isBullets = lines.every((line) => line.startsWith('- '));
  if (lines.length === 1 && !isBullets) return [`**${title}:** ${lines[0]}`];
  return [`**${title}:**`, ...lines];
};

// Fallback for providers that ignore the plain-text instruction and emit a
// flat object keyed by section title (often with an empty key for the
// summary), e.g. {"": "This prescription is for...", "What it is for": "- ..."}
const formatKeyedObject = (obj: Record<string, unknown>): string | null => {
  const out: string[] = [];
  for (const [rawKey, value] of Object.entries(obj)) {
    const title = rawKey.trim().replace(/^["']|["']$/g, '').replace(/:+$/, '').trim();
    if (!title) {
      const intro = sectionLines(value);
      if (intro.length > 0) out.push(intro.join('\n'), '');
      continue;
    }
    const section = renderSection(title, value);
    if (section.length > 0) out.push(section.join('\n'), '');
  }
  const result = out.join('\n').trim();
  return result.length > 0 ? result : null;
};

const formatSchema = (raw: Record<string, unknown>): string | null => {
  const out: string[] = [];
  const summary = text(raw.summary);
  if (summary) out.push(summary, '');

  const medicines: unknown[] = Array.isArray(raw.medicines) ? raw.medicines : [];
  for (const entry of medicines) {
    if (typeof entry !== 'object' || entry === null) continue;
    const med = entry as ExplanationMedicineJSON;
    const blocks: string[] = [];
    const name = text(med.name);
    const plain = text(med.plain_explanation);
    const howToTake = text(med.how_to_take);
    const storage = text(med.storage);
    const missedDose = text(med.missed_dose_guidance);
    const contactDoctor = text(med.when_to_contact_doctor);
    const sideEffects = stringList(med.common_side_effects);
    const food = stringList(med.food_interactions);
    const warnings = stringList(med.warnings);

    if (name) blocks.push(`**${name}**`);
    if (plain) blocks.push(plain);
    if (howToTake) blocks.push(`**How to take:** ${howToTake}`);
    if (sideEffects.length > 0) {
      blocks.push(['**Common side effects:**', ...sideEffects.map((s) => `- ${s}`)].join('\n'));
    }
    if (food.length > 0) {
      blocks.push(['**Food interactions:**', ...food.map((s) => `- ${s}`)].join('\n'));
    }
    if (storage) blocks.push(`**Storage:** ${storage}`);
    if (missedDose) blocks.push(`**If a dose is missed:** ${missedDose}`);
    if (contactDoctor) blocks.push(`**Contact a doctor if:** ${contactDoctor}`);
    if (warnings.length > 0) {
      blocks.push(['**Warnings:**', ...warnings.map((s) => `- ${s}`)].join('\n'));
    }
    if (blocks.length > 0) out.push(blocks.join('\n\n'), '');
  }

  const result = out.join('\n').trim();
  return result.length > 0 ? result : null;
};

// Providers occasionally ignore the plain-text instruction and answer with
// JSON; convert that into readable markdown rather than surfacing raw JSON
// to the patient.
export function formatExplanationText(raw: string): string {
  const trimmed = raw.trim();
  // Double-encoded payload: the model wrapped the JSON text in a JSON string.
  if (trimmed.startsWith('"')) {
    try {
      const inner = JSON.parse(trimmed);
      if (typeof inner === 'string') return formatExplanationText(inner);
    } catch {
      // Not a JSON string; fall through and treat it as prose.
    }
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const proseOrJson = (fence?.[1] ?? trimmed).trim();
  const start = proseOrJson.indexOf('{');
  const end = proseOrJson.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? proseOrJson.slice(start, end + 1) : proseOrJson;
  if (!candidate.startsWith('{')) {
    // Prose that was double-escaped in transport shows literal "\n" instead
    // of line breaks; real multi-line text is left untouched.
    return trimmed.includes('\n') ? raw : unescape(raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return unescape(raw);
  }
  // Double-encoded payload: the model wrapped the JSON text in a JSON string.
  if (typeof parsed === 'string') {
    return parsed.trim().startsWith('{') ? formatExplanationText(parsed) : raw;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return raw;

  const obj = parsed as Record<string, unknown>;
  // Only trust the schema shape when it carries the medicines array; a lone
  // "summary" key should not hide the keyed-section shape handled below.
  if (Array.isArray(obj.medicines)) {
    const schema = formatSchema(obj);
    if (schema) return schema;
  }
  return formatKeyedObject(obj) ?? raw;
}
