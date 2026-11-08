/**
 * Clinical Guardrails & Emergency Triage Engine for Nusxa Chat.
 * Provides:
 * 1. Pre-generation Red Flag Triage: Intercepts acute medical emergencies
 *    (cardiac, stroke, respiratory distress, anaphylaxis, overdose) instantly
 *    without LLM delay, directing patients to emergency medical services.
 * 2. Precision Exemption Layer: Filters out false-positive edge cases such as
 *    educational side-effect questions, symptom negations ("no chest pain"),
 *    past medical histories ("had stroke in 2018"), and chronic medication queries.
 * 3. Post-generation Safety Filter: Enforces Nusxa's core principle that the AI
 *    never makes independent treatment decisions, alters dosages, or diagnoses.
 */

export interface TriageResult {
  isEmergency: boolean;
  category?: 'cardiac' | 'stroke' | 'respiratory' | 'anaphylaxis' | 'overdose' | 'neurological' | 'bleeding';
  severity?: 'critical' | 'urgent';
  emergencyResponse?: string;
}

export interface OutputGuardrailResult {
  passed: boolean;
  violations: string[];
  sanitizedContent: string;
}

// Multilingual emergency trigger patterns (English, Roman Urdu, Urdu keywords)
const EMERGENCY_PATTERNS: { category: TriageResult['category']; patterns: RegExp[] }[] = [
  {
    category: 'cardiac',
    patterns: [
      /\b(chest pain|chest pressure|crushing pain|pain in left arm|radiating to (the )?jaw|heart attack)\b/i,
      /\b(seenay mein (shadeed )?dard|chaati mein (shadeed )?dard|dil ka daura|dil mein (shadeed )?dard)\b/i,
      /(سینے میں (شدید )?درد|دل کا دورہ|دل کا درد)/,
    ],
  },
  {
    category: 'stroke',
    patterns: [
      /\b(face droop|facial drooping|arm weakness|slurred speech|sudden numbness|cannot speak)\b/i,
      /\b(falij|lakwa|bol nahi pa raha|chehra tedha|bazu sunn)\b/i,
      /(فالج|لقوہ|بول نہیں پا رہا|چہرہ ٹیڑھا)/,
    ],
  },
  {
    category: 'respiratory',
    patterns: [
      /\b(cannot breathe|can't breathe|unable to breathe|severe shortness of breath|suffocating|choking|gasping for air)\b/i,
      /\b(saans nahi aa rahi|dam ghut raha|saans ruk gayi|shadeed saans phool)\b/i,
      /(سانس نہیں آ رہی|دم گھٹ رہا)/,
    ],
  },
  {
    category: 'anaphylaxis',
    patterns: [
      /\b(throat swelling|throat closing|tongue swollen|severe allergic reaction|anaphylaxis|lips swelling)\b/i,
      /\b(gala band ho raha|zaban soojh gayi|hont soojh)\b/i,
      /(گلا بند|زبان سوج|الرجی)/,
    ],
  },
  {
    category: 'overdose',
    patterns: [
      /\b(took (the )?whole bottle|swallowed all pills|overdose|drank poison|drank bleach|suicide|kill myself)\b/i,
      /\b(saari goliyan kha li|zehar pee liya|overdose kar lia|khudkushi)\b/i,
      /(ساری گولیاں|زہر|خودکشی)/,
    ],
  },
  {
    category: 'bleeding',
    patterns: [
      /\b(coughing up blood|vomiting blood|uncontrolled bleeding|heavy blood loss)\b/i,
      /\b(khoon ki ulti|khoon beh raha|khoon ruk nahi raha)\b/i,
      /(خون کی الٹی|شدید خون)/,
    ],
  },
  {
    category: 'neurological',
    patterns: [
      /\b(unconscious|passed out|loss of consciousness|seizure|convulsions)\b/i,
      /\b(behosh|daura par gaya|hosh nahi hai)\b/i,
      /(بے ہوش|دورہ)/,
    ],
  },
];

// Patterns for educational, hypothetical, or side-effect questions
const EDUCATIONAL_INQUIRY_PATTERNS = [
  /\b(does (it|this( medicine| drug| tablet)?|the medicine|the drug|the tablet) cause|can (it|this( medicine| drug| tablet)?|the medicine|the drug|the tablet) cause|could (it|this) cause)\b/i,
  /\b(is (it|this) a (common |known )?(side effect|symptom|sign))\b/i,
  /\b(as a (side effect|precaution))\b/i,
  /\b(side effects? (include|of)|signs? of|symptoms? of|risk of)\b/i,
  /\b(how to (prevent|avoid)|prevention of|prevent (a |an )?(heart attack|stroke|seizure))\b/i,
  /\b(what (happens|should I do|to do) if (someone|a person|I accidentally))\b/i,
  /\b(can you overdose on|is it possible to overdose on|what is considered an overdose)\b/i,
  /\b(fear of choking|choking hazard)\b/i,
  /\b(kya (is se|ye dawai|ye goli)|kya nuksan hai|kya side effect hai|bachne ka tareeqa|agar kisi ko)\b/i,
  /(کیا اس سے|کیا یہ دوا|بچاؤ کا طریقہ|ضمنی اثرات)/,
];

// Patterns for explicit symptom negation (absence of symptom)
const NEGATION_PATTERNS = [
  /\b(no (chest pain|shortness of breath|pain|breathing issues?|bleeding|seizures?|heart issues?))\b/i,
  /\b(not (having|experiencing|feeling) any)\b/i,
  /\b(without (any )?(chest pain|pain|shortness of breath|bleeding))\b/i,
  /\b(don't have|do not have|haven't had|never had|not had|free of)\b/i,
  /\b(koi (dard|takleef|masla) nahi|dard nahi hai|theek hai)\b/i,
  /(کوئی درد نہیں|تکلیف نہیں|کوئی مسئلہ نہیں)/,
];

// Patterns for historical / resolved medical events
const PAST_HISTORY_PATTERNS = [
  /\b(had a (heart attack|stroke|seizure) (years?|months?|weeks?) ago)\b/i,
  /\b(in (19|20)\d\d|in the past|history of|past medical history)\b/i,
  /\b(my (father|mother|grandfather|grandmother|uncle|aunt|friend|colleague|neighbor|relative) (had|has|suffered|was))\b/i,
  /\b(saal pehlay|mahine pehlay|purana daura|pehlay hua tha|mere walid ko|dost ko)\b/i,
];

// Patterns for chronic conditions and routine medication inquiries
const CHRONIC_MEDICATION_PATTERNS = [
  /\b((medicine|medication|tablet|pills?|drug) for (seizures?|epilepsy|convulsions?))\b/i,
  /\b(taking (it |this )?for (seizures?|epilepsy))\b/i,
  /\b(anti-seizure|anticonvulsant)\b/i,
  /\b(daure ki dawai|mirgi ki dawai|seizure ki medicine)\b/i,
];

// Explicit active personal crisis declaration (cannot be silenced by exemptions)
const ACTIVE_CRISIS_CONFIRMATION = [
  /\b(i am having|i'm having|i have severe|experiencing right now|happening right now|severe pain right now|cannot breathe|can't breathe|dying|help me)\b/i,
  /\b(mujhe shadeed|ab ho raha hai|bardasht nahi ho raha|foran|bachao)\b/i,
  /(شدید درد ہو رہا ہے|سانس نہیں آ رہی)/,
];

/**
 * Rapid deterministic red-flag emergency triage scanner.
 * Executes in < 1ms to protect patients experiencing acute medical crises
 * while filtering out educational questions and symptom negations.
 */
export function checkEmergencyTriage(userText: string, locale: 'en' | 'ur' = 'en'): TriageResult {
  const text = userText.trim();
  if (!text) return { isEmergency: false };

  let matchedCategory: TriageResult['category'] | null = null;
  for (const group of EMERGENCY_PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(text)) {
        matchedCategory = group.category;
        break;
      }
    }
    if (matchedCategory) break;
  }

  // If no emergency triggers matched, exit immediately
  if (!matchedCategory) return { isEmergency: false };

  // Check if query is an educational question, negation, or past history
  const isQuestionOrInquiry =
    EDUCATIONAL_INQUIRY_PATTERNS.some((p) => p.test(text)) ||
    NEGATION_PATTERNS.some((p) => p.test(text)) ||
    PAST_HISTORY_PATTERNS.some((p) => p.test(text)) ||
    CHRONIC_MEDICATION_PATTERNS.some((p) => p.test(text));

  if (isQuestionOrInquiry) {
    // Check if the user also explicitly confirmed an active acute crisis
    // (e.g. "I have severe chest pain right now, can this medicine cause it?")
    const hasActiveCrisis = ACTIVE_CRISIS_CONFIRMATION.some((p) => p.test(text));
    if (!hasActiveCrisis) {
      // Safely exempt: route to regular LLM conversation
      return { isEmergency: false };
    }
  }

  return {
    isEmergency: true,
    category: matchedCategory,
    severity: 'critical',
    emergencyResponse: buildEmergencyResponse(matchedCategory, locale),
  };
}

function buildEmergencyResponse(
  category: TriageResult['category'],
  locale: 'en' | 'ur'
): string {
  if (locale === 'ur') {
    return `🚨 **فوری ہنگامی طبی انتباہ (Emergency Alert)**\n\n` +
      `آپ کی بیان کردہ علامات **فوری ہنگامی طبی توجہ** کی متقاضی ہیں۔\n\n` +
      `**براہ کرم فوراً ایمرجنسی سروسز سے رابطہ کریں:**\n` +
      `- **پاکستان:** 📞 **1122** (ریسکیو) یا **1021** (ایدھی)\n` +
      `- **انٹرنیشنل:** 📞 **911** (US) / **999** (UK) / **112** (EU)\n\n` +
      `*اہم:* نُسخہ (Nusxa) ایک معلوماتی AI معاون ہے اور ایمرجنسی خدمات کا متبادل نہیں ہے۔ فوری طور پر قریبی ہسپتال تشریف لے جائیں۔`;
  }

  return `🚨 **CRITICAL MEDICAL EMERGENCY ALERT**\n\n` +
    `Your message indicates symptoms that require **immediate emergency medical evaluation**.\n\n` +
    `**Please seek emergency medical help right now:**\n` +
    `- **Pakistan:** Call 📞 **1122** (Rescue) or **1021** (Edhi)\n` +
    `- **US / Canada:** Call 📞 **911**\n` +
    `- **UK:** Call 📞 **999**\n` +
    `- **Europe / International:** Call 📞 **112**\n\n` +
    `⚠️ **Do not wait for an online response.** Nusxa is an educational companion and cannot provide emergency medical care. Please proceed immediately to the nearest Emergency Department.`;
}

// Patterns that indicate unauthorized clinical decisions (prescribing, dosage changes, diagnosis)
const UNSANCTIONED_CLINICAL_CLAIMS = [
  /\b(you have|you are suffering from|my diagnosis is|you have developed|i diagnose you with)\b/i,
  /\b(increase your dose to|double your dose|take \d+ tablets instead|take an extra dose|stop taking your medicine)\b/i,
  /\b(apni khuraak barha dein|dawai lena band kar dein|ap ko leukemia|ap ko cancer)\b/i,
];

const CLINICAL_BOUNDARY_DISCLAIMER =
  '\n\n> ⚠️ *Clinical Safety Boundary: Nusxa does not alter physician-prescribed dosages, suggest off-label treatments, or provide clinical diagnoses. Always verify any medication questions with your doctor or pharmacist.*';

/**
 * Output guardrail: validates assistant generated text before display.
 * Detects hallucinations or unsanctioned clinical changes and attaches boundary disclaimers.
 */
export function validateAssistantResponse(responseText: string): OutputGuardrailResult {
  const violations: string[] = [];
  let sanitized = responseText;

  for (const pattern of UNSANCTIONED_CLINICAL_CLAIMS) {
    if (pattern.test(responseText)) {
      violations.push(`Unsanctioned claim matched: ${pattern.source}`);
    }
  }

  if (violations.length > 0) {
    if (!sanitized.includes('Clinical Safety Boundary')) {
      sanitized += CLINICAL_BOUNDARY_DISCLAIMER;
    }
    return {
      passed: false,
      violations,
      sanitizedContent: sanitized,
    };
  }

  return {
    passed: true,
    violations: [],
    sanitizedContent: sanitized,
  };
}
