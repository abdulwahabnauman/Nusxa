/** Structured JSON output from the AI prescription pipeline */
export interface PrescriptionJSON {
  prescription: {
    doctor_name: string | null;
    hospital: string | null;
    date: string | null;
    follow_up_date: string | null;
    source_image_id: string | null;
    verification_status: 'pending' | 'verified' | 'rejected';
  };
  medicines: MedicineJSON[];
  patient_notes: string | null;
  overall_confidence: number;
  verification_status: 'pending' | 'verified' | 'rejected';
}

export interface MedicineJSON {
  name: string | null;
  generic_name: string | null;
  brand_name: string | null;
  strength: string | null;
  form: string | null;
  dosage: string | null;
  frequency: string | null;
  meal_instruction: 'before' | 'after' | 'with' | 'none' | null;
  duration: string | null;
  /** Verbatim line text as written on the prescription, for review display */
  original_text: string | null;
  purpose: string | null;
  side_effects: string[];
  food_interactions: string[];
  storage: string | null;
  confidence: number;
  /** Per-field confidence (0-1) reported by the model; missing = not reported */
  field_confidence: Record<string, number>;
  field_sources: Record<string, 'ocr' | 'inferred' | 'patient' | 'corrected' | 'unknown'>;
  warnings: string[];
  verification_status: 'pending' | 'verified' | 'rejected' | 'needs_review';
}

export interface OCRRawExtraction {
  raw_text: string;
  medicines: {
    name: string | null;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    notes: string | null;
    confidence: number;
  }[];
  doctor_name: string | null;
  hospital: string | null;
  date: string | null;
  abbreviations_found: { abbreviation: string; interpretation: string | null }[];
}

/**
 * Structured validation findings. The review screen renders these with
 * localized copy instead of the pipeline baking English strings into the
 * result (which also travel through route params).
 */
export type ValidationFlag =
  | { code: 'no_medicines' }
  | {
      code: 'missing_field';
      medicine: string | null;
      index: number;
      field: 'name' | 'dosage' | 'frequency' | 'duration';
    }
  | { code: 'low_confidence'; medicine: string | null; index: number }
  | { code: 'unreadable'; medicine: string | null; index: number }
  | { code: 'duplicate_names' };

export interface ValidationResult {
  isValid: boolean;
  /** Raw warnings reported by the model (kept verbatim) */
  warnings: string[];
  flags: ValidationFlag[];
  errors: string[];
}

export type PipelineStage =
  | 'preparing'
  | 'reading'
  | 'interpreting'
  | 'validating'
  | 'complete'
  | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}
