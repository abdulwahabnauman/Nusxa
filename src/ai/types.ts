/** Structured JSON output from the AI prescription pipeline */
export interface PrescriptionJSON {
  prescription: {
    doctor_name: string | null;
    hospital: string | null;
    date: string | null;
    follow_up_date: string | null;
    source_image_id: string | null;
    verification_status: 'pending' | 'verified' | 'rejected';
    /** Patient the prescription was written for (null when not visible) */
    patient_name: string | null;
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
  purpose: string | null;
  side_effects: string[];
  food_interactions: string[];
  storage: string | null;
  confidence: number;
  field_sources: Record<string, 'ocr' | 'inferred' | 'patient' | 'unknown'>;
  warnings: string[];
  verification_status: 'pending' | 'verified' | 'rejected' | 'needs_review';
}

export interface OCRRawExtraction {
  raw_text: string;
  medicines: Array<{
    name: string | null;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    notes: string | null;
    confidence: number;
  }>;
  doctor_name: string | null;
  hospital: string | null;
  date: string | null;
  abbreviations_found: Array<{ abbreviation: string; interpretation: string | null }>;
}

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  missingRequiredFields: string[];
}

export type PipelineStage =
  | 'preparing'
  | 'reading'
  | 'interpreting'
  | 'validating'
  | 'complete'
  | 'error';

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  preparing: 'Preparing image',
  reading: 'Reading prescription',
  interpreting: 'Interpreting medical information',
  validating: 'Checking extracted information',
  complete: 'Preparing review screen',
  error: 'Something went wrong',
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}
