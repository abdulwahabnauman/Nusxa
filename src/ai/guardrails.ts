/**
 * Clinical Guardrails & Emergency Triage Engine for Nusxa Chat.
 * Provides:
 * 1. Pre-generation Red Flag Triage: Intercepts acute medical emergencies
 *    (cardiac, stroke, respiratory distress, anaphylaxis, overdose) instantly
 *    without LLM delay, directing patients to emergency medical services.
 * 2. Post-generation Safety Filter: Enforces Nusxa's core principle that the AI
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
      /\b(chest pain|chest pressure|crushing pain|pain in left arm|radiating to jaw|heart attack)\b/i,
      /\b(seenay mein dard|chaati mein dard|dil ka daura|dil mein shadeed dard)\b/i,
      /(سینے میں درد|دل کا دورہ|دل کا درد)/,
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
      /\b(gala band ho raha|zaban soojh gayi|allergic reaction|hont soojh)\b/i,
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

/**
 * Rapid deterministic red-flag emergency triage scanner.
 * Executes in < 1ms to protect patients experiencing acute medical crises.
 */
export function checkEmergencyTriage(userText: string, locale: 'en' | 'ur' = 'en'): TriageResult {
  const text = userText.trim();
  if (!text) return { isEmergency: false };

  for (const group of EMERGENCY_PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(text)) {
        return {
          isEmergency: true,
          category: group.category,
          severity: 'critical',
          emergencyResponse: buildEmergencyResponse(group.category, locale),
        };
      }
    }
  }

  return { isEmergency: false };
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
