/** Common medical abbreviation interpretations */
export const MEDICAL_ABBREVIATIONS: Record<string, string> = {
  'OD': 'Once daily',
  'BD': 'Twice daily',
  'BID': 'Twice daily',
  'TDS': 'Three times daily',
  'TID': 'Three times daily',
  'QDS': 'Four times daily',
  'QID': 'Four times daily',
  'HS': 'At bedtime',
  'PRN': 'As needed',
  'AC': 'Before meals',
  'PC': 'After meals',
  'STAT': 'Immediately',
  'PO': 'By mouth',
  'NOCTE': 'At night',
  'MANE': 'In the morning',
  'OM': 'Every morning',
  'ON': 'Every night',
  'ALT DIEB': 'On alternate days',
  'Q8H': 'Every 8 hours',
  'Q12H': 'Every 12 hours',
  'Q6H': 'Every 6 hours',
  'Q4H': 'Every 4 hours',
  'SOS': 'If needed',
  'TAB': 'Tablet',
  'CAP': 'Capsule',
  'INJ': 'Injection',
  'SYR': 'Syrup',
  'MG': 'Milligram',
  'ML': 'Milliliter',
  'MCG': 'Microgram',
};

/** Default meal timing mappings */
export const MEAL_TIMINGS = {
  before: '30 minutes before a meal',
  after: '30 minutes after a meal',
  with: 'During a meal',
  none: 'No meal requirement',
} as const;

/** Medicine category detection keywords */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'blood-pressure': [
    'amlodipine', 'lisinopril', 'losartan', 'metoprolol', 'atenolol',
    'ramipril', 'enalapril', 'hydrochlorothiazide', 'valsartan', 'propranolol',
    'telmisartan', 'olmesartan', 'irbesartan', 'carvedilol', 'nebivolol',
  ],
  antibiotic: [
    'amoxicillin', 'azithromycin', 'ciprofloxacin', 'metronidazole',
    'doxycycline', 'cephalexin', 'levofloxacin', 'clindamycin',
    'ceftriaxone', 'penicillin', 'ofloxacin', 'norfloxacin',
  ],
  painkiller: [
    'ibuprofen', 'paracetamol', 'acetaminophen', 'naproxen', 'diclofenac',
    'tramadol', 'celecoxib', 'meloxicam', 'aspirin', 'ketorolac',
  ],
  vitamins: [
    'vitamin', 'folic acid', 'iron', 'calcium', 'zinc', 'magnesium',
    'multivitamin', 'omega', 'fish oil', 'biotin', 'vitamin d',
    'vitamin b', 'vitamin c', 'vitamin e',
  ],
};

/** Frequency to daily dose count mapping */
export const FREQUENCY_TO_DAILY_COUNT: Record<string, number> = {
  'once daily': 1,
  'twice daily': 2,
  'three times daily': 3,
  'four times daily': 4,
  'every 4 hours': 6,
  'every 6 hours': 4,
  'every 8 hours': 3,
  'every 12 hours': 2,
  'as needed': 0,
  'at bedtime': 1,
  'in the morning': 1,
  'at night': 1,
};

/** Default schedule times by frequency */
export const DEFAULT_SCHEDULE_TIMES: Record<string, string[]> = {
  '1': ['08:00'],
  '2': ['08:00', '20:00'],
  '3': ['08:00', '13:00', '20:00'],
  '4': ['08:00', '12:00', '17:00', '21:00'],
};

/** Interaction severity levels */
export type InteractionSeverity = 'low' | 'medium' | 'high';

export interface InteractionRule {
  /**
   * Two-sided rule: one medicine matching list `a` combined with one
   * medicine matching list `b` may interact. Symmetric rules repeat the
   * same list on both sides.
   */
  a: string[];
  b: string[];
  severity: InteractionSeverity;
  description: string;
}

/**
 * Medicine interaction rules — a curated, conservative subset of
 * well-established interactions for on-device guidance only. This is NOT a
 * clinical decision-support database; it flags common risks so users know
 * what to ask their doctor or pharmacist about.
 */
export const MEDICINE_INTERACTIONS: InteractionRule[] = [
  {
    // Any two of these together raise bleeding risk (symmetric)
    a: [
      'warfarin', 'aspirin', 'clopidogrel', 'heparin', 'enoxaparin',
      'rivaroxaban', 'apixaban', 'ibuprofen', 'naproxen', 'diclofenac',
    ],
    b: [
      'warfarin', 'aspirin', 'clopidogrel', 'heparin', 'enoxaparin',
      'rivaroxaban', 'apixaban', 'ibuprofen', 'naproxen', 'diclofenac',
    ],
    severity: 'high',
    description: 'Combining blood thinners, antiplatelets or multiple NSAID painkillers raises the risk of bleeding.',
  },
  {
    a: ['warfarin'],
    b: ['amiodarone'],
    severity: 'high',
    description: 'Amiodarone can strengthen warfarin\'s effect and raise bleeding risk. Dosing may need medical review.',
  },
  {
    // ACE inhibitors / ARBs / potassium-sparing drugs / potassium (symmetric)
    a: [
      'lisinopril', 'enalapril', 'ramipril', 'perindopril', 'losartan',
      'valsartan', 'telmisartan', 'irbesartan', 'candesartan',
      'spironolactone', 'eplerenone', 'potassium',
    ],
    b: [
      'lisinopril', 'enalapril', 'ramipril', 'perindopril', 'losartan',
      'valsartan', 'telmisartan', 'irbesartan', 'candesartan',
      'spironolactone', 'eplerenone', 'potassium',
    ],
    severity: 'medium',
    description: 'Risk of hyperkalemia (high potassium levels) when these blood-pressure medicines are combined with potassium-sparing drugs or supplements.',
  },
  {
    a: ['simvastatin', 'atorvastatin', 'lovastatin', 'rosuvastatin'],
    b: ['clarithromycin', 'erythromycin', 'itraconazole', 'ketoconazole', 'gemfibrozil', 'niacin'],
    severity: 'high',
    description: 'Increased risk of muscle damage (rhabdomyolysis) when statins are combined with these antibiotics, antifungals or other cholesterol drugs.',
  },
  {
    a: ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'norfloxacin', 'doxycycline', 'tetracycline', 'minocycline'],
    b: ['calcium', 'iron', 'zinc', 'magnesium', 'antacid'],
    severity: 'medium',
    description: 'Antacids, calcium, iron, zinc or magnesium can block absorption of these antibiotics. Doses are usually spaced at least 2 hours apart.',
  },
  {
    a: ['levothyroxine', 'thyroxine'],
    b: ['calcium', 'iron'],
    severity: 'medium',
    description: 'Calcium and iron reduce levothyroxine absorption. Doses are usually spaced about 4 hours apart.',
  },
  {
    a: ['sildenafil', 'tadalafil', 'vardenafil'],
    b: ['nitroglycerin', 'isosorbide', 'nitrate'],
    severity: 'high',
    description: 'Combining nitrates with these medicines can cause a dangerous drop in blood pressure.',
  },
  {
    // Serotonergic combinations (symmetric)
    a: [
      'sertraline', 'fluoxetine', 'escitalopram', 'citalopram',
      'paroxetine', 'fluvoxamine', 'tramadol', 'linezolid',
    ],
    b: [
      'sertraline', 'fluoxetine', 'escitalopram', 'citalopram',
      'paroxetine', 'fluvoxamine', 'tramadol', 'linezolid',
    ],
    severity: 'high',
    description: 'Risk of serotonin syndrome, a serious reaction, when these medicines are combined.',
  },
  {
    a: ['methotrexate'],
    b: ['ibuprofen', 'naproxen', 'diclofenac', 'aspirin'],
    severity: 'high',
    description: 'NSAID painkillers can let methotrexate build up in the body, raising toxicity risk.',
  },
  {
    a: ['methotrexate'],
    b: ['amoxicillin', 'penicillin', 'ampicillin'],
    severity: 'medium',
    description: 'Penicillin antibiotics can slow the body\'s clearance of methotrexate.',
  },
  {
    a: ['amoxicillin'],
    b: ['tetracycline'],
    severity: 'medium',
    description: 'These antibiotics can reduce each other\'s effectiveness when taken together.',
  },
  {
    a: ['digoxin'],
    b: ['amiodarone'],
    severity: 'high',
    description: 'Amiodarone raises digoxin levels in the blood, risking toxicity.',
  },
  {
    a: ['digoxin'],
    b: ['furosemide', 'hydrochlorothiazide', 'bumetanide'],
    severity: 'medium',
    description: 'Water tablets can lower potassium, which increases the risk of digoxin side effects.',
  },
  {
    a: ['clopidogrel'],
    b: ['omeprazole', 'esomeprazole'],
    severity: 'medium',
    description: 'These stomach-acid medicines can reduce clopidogrel\'s effectiveness.',
  },
  {
    a: ['lithium'],
    b: ['ibuprofen', 'naproxen', 'diclofenac', 'lisinopril', 'enalapril'],
    severity: 'high',
    description: 'NSAIDs and ACE-inhibitor blood-pressure drugs can push lithium levels into the toxic range.',
  },
  {
    a: ['prednisone', 'prednisolone', 'dexamethasone', 'hydrocortisone'],
    b: ['ibuprofen', 'naproxen', 'diclofenac'],
    severity: 'medium',
    description: 'Combining steroids with NSAID painkillers raises the risk of stomach ulcers and bleeding.',
  },
];

/** Check if any two medicines interact */
export function checkMedicineInteraction(medicine1: string, medicine2: string): {
  hasInteraction: boolean;
  interaction?: {
    severity: 'low' | 'medium' | 'high';
    description: string;
  };
} {
  const m1Lower = medicine1.toLowerCase();
  const m2Lower = medicine2.toLowerCase();

  for (const rule of MEDICINE_INTERACTIONS) {
    const m1InA = rule.a.some((m) => m1Lower.includes(m));
    const m2InB = rule.b.some((m) => m2Lower.includes(m));
    const m2InA = rule.a.some((m) => m2Lower.includes(m));
    const m1InB = rule.b.some((m) => m1Lower.includes(m));

    if ((m1InA && m2InB) || (m2InA && m1InB)) {
      return {
        hasInteraction: true,
        interaction: {
          severity: rule.severity as 'low' | 'medium' | 'high',
          description: rule.description,
        },
      };
    }
  }

  return { hasInteraction: false };
}

/** Find all potential interactions in a list of medicines */
export function findAllInteractions(medicines: string[]): Array<{
  medicine1: string;
  medicine2: string;
  interaction: {
    severity: 'low' | 'medium' | 'high';
    description: string;
  };
}> {
  const interactions: Array<{
    medicine1: string;
    medicine2: string;
    interaction: {
      severity: 'low' | 'medium' | 'high';
      description: string;
    };
  }> = [];
  
  for (let i = 0; i < medicines.length; i++) {
    const m1 = medicines[i];
    if (!m1) continue;
    
    for (let j = i + 1; j < medicines.length; j++) {
      const m2 = medicines[j];
      if (!m2) continue;
      
      const result = checkMedicineInteraction(m1, m2);
      
      if (result.hasInteraction && result.interaction) {
        interactions.push({
          medicine1: m1,
          medicine2: m2,
          interaction: result.interaction,
        });
      }
    }
  }
  
  return interactions;
}
