/**
 * Medicine interaction checking against the curated rule set.
 * Matches each medicine's name, generic and brand names against the rules,
 * so "Panadol" (brand) still matches paracetamol-style rules and bracketed
 * labels like "Amoxicillin (Himiox)" still match "amoxicillin".
 *
 * This is general on-device guidance, never a substitute for a doctor's or
 * pharmacist's review.
 */
import {
  MEDICINE_INTERACTIONS,
  type InteractionRule,
  type InteractionSeverity,
} from '../constants/medical';

export interface MedicineLike {
  name?: string | null;
  generic_name?: string | null;
  brand_name?: string | null;
}

export interface InteractionPair {
  first: string;
  second: string;
  severity: InteractionSeverity;
  description: string;
}

const normalize = (s?: string | null): string =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function medicineLabel(m: MedicineLike): string {
  return (
    m.name?.trim() ||
    m.generic_name?.trim() ||
    m.brand_name?.trim() ||
    'Unknown medicine'
  );
}

/** All matchable terms for a medicine, with parentheticals stripped as variants */
function matchTerms(m: MedicineLike): string[] {
  const out = new Set<string>();
  for (const raw of [m.name, m.generic_name, m.brand_name]) {
    const n = normalize(raw);
    if (n.length >= 3) out.add(n);
    const stripped = n.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (stripped.length >= 3) out.add(stripped);
  }
  return [...out];
}

function matchesList(m: MedicineLike, list: string[]): boolean {
  return matchTerms(m).some((term) => list.some((key) => term.includes(key)));
}

const SEVERITY_RANK: Record<InteractionSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** Highest-severity rule that matches both medicines (either direction), if any */
function strongestSharedRule(a: MedicineLike, b: MedicineLike): InteractionRule | null {
  let best: InteractionRule | null = null;
  for (const rule of MEDICINE_INTERACTIONS) {
    const forward = matchesList(a, rule.a) && matchesList(b, rule.b);
    const backward = matchesList(b, rule.a) && matchesList(a, rule.b);
    if (!forward && !backward) continue;
    if (!best || SEVERITY_RANK[rule.severity] > SEVERITY_RANK[best.severity]) {
      best = rule;
    }
  }
  return best;
}

function toPair(a: MedicineLike, b: MedicineLike, rule: InteractionRule): InteractionPair {
  return {
    first: medicineLabel(a),
    second: medicineLabel(b),
    severity: rule.severity,
    description: rule.description,
  };
}

/** All interaction pairs within a single list (e.g. the current regimen) */
export function findInteractionPairs(list: MedicineLike[]): InteractionPair[] {
  const pairs: InteractionPair[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const rule = strongestSharedRule(a, b);
      if (rule) pairs.push(toPair(a, b, rule));
    }
  }
  return pairs;
}

/** Interactions between an incoming batch and an existing regimen */
export function findCrossInteractions(
  incoming: MedicineLike[],
  existing: MedicineLike[]
): InteractionPair[] {
  const pairs: InteractionPair[] = [];
  for (const a of incoming) {
    for (const b of existing) {
      const rule = strongestSharedRule(a, b);
      if (rule) pairs.push(toPair(a, b, rule));
    }
  }
  return pairs;
}
