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
