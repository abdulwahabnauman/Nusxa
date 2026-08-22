import * as FileSystem from 'expo-file-system';
import { visionCompletion, chatCompletion } from './client';
import { OCR_SYSTEM_PROMPT, INTERPRETATION_SYSTEM_PROMPT } from './prompts';
import { PrescriptionJSON, PipelineStage, ValidationResult } from './types';
import { LOW_CONFIDENCE_THRESHOLD } from '../constants/config';

type StageCallback = (stage: PipelineStage) => void;

/** Read an image file and convert to base64 */
async function imageToBase64(uri: string): Promise<string> {
  // Verify the file exists before trying to read it
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) {
    throw new Error(
      'Image file not found. The temporary image may have been cleaned up. Please try scanning again.'
    );
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64;
}

/** Parse the AI OCR response into structured data */
function parseOCRResponse(raw: string): PrescriptionJSON {
  try {
    const parsed = JSON.parse(raw);

    // Ensure correct structure with defaults
    return {
      prescription: {
        doctor_name: parsed.prescription?.doctor_name ?? null,
        hospital: parsed.prescription?.hospital ?? null,
        date: parsed.prescription?.date ?? null,
        follow_up_date: parsed.prescription?.follow_up_date ?? null,
        source_image_id: null,
        verification_status: 'pending',
      },
      medicines: (parsed.medicines ?? []).map((m: Record<string, unknown>) => ({
        name: m.name ?? null,
        generic_name: m.generic_name ?? null,
        brand_name: m.brand_name ?? null,
        strength: m.strength ?? null,
        form: m.form ?? null,
        dosage: m.dosage ?? null,
        frequency: m.frequency ?? null,
        meal_instruction: m.meal_instruction ?? null,
        duration: m.duration ?? null,
        purpose: null,
        side_effects: [],
        food_interactions: [],
        storage: null,
        confidence: typeof m.confidence === 'number' ? m.confidence : 0,
        field_sources: {},
        warnings: Array.isArray(m.warnings) ? m.warnings : [],
        verification_status: 'pending' as const,
      })),
      patient_notes: parsed.raw_notes ?? null,
      overall_confidence: typeof parsed.overall_confidence === 'number' ? parsed.overall_confidence : 0,
      verification_status: 'pending',
    };
  } catch {
    throw new Error('Failed to parse AI response. The prescription could not be processed.');
  }
}

/** Validate extracted prescription data */
function validatePrescription(data: PrescriptionJSON): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const missingRequiredFields: string[] = [];

  if (data.medicines.length === 0) {
    errors.push('No medicines were detected in the prescription.');
  }

  for (let i = 0; i < data.medicines.length; i++) {
    const med = data.medicines[i]!;
    const prefix = med.name ? `"${med.name}"` : `Medicine ${i + 1}`;

    // Check required fields
    if (!med.name) missingRequiredFields.push(`${prefix}: name is missing`);
    if (!med.dosage) missingRequiredFields.push(`${prefix}: dosage is missing`);
    if (!med.frequency) missingRequiredFields.push(`${prefix}: frequency is missing`);
    if (!med.duration) missingRequiredFields.push(`${prefix}: duration is missing`);

    // Check confidence
    if (med.confidence < LOW_CONFIDENCE_THRESHOLD) {
      warnings.push(`${prefix}: Low confidence extraction. Please verify all fields carefully.`);
    }

    // Check for potential issues
    if (med.confidence === 0) {
      warnings.push(`${prefix}: Could not read this medicine clearly. Please enter the details manually.`);
    }
  }

  // Check for duplicate medicine names
  const names = data.medicines
    .map((m) => m.name?.toLowerCase())
    .filter(Boolean);
  const uniqueNames = new Set(names);
  if (names.length !== uniqueNames.size) {
    warnings.push('Duplicate medicine names detected. Please check if these are the same medicine.');
  }

  return {
    isValid: errors.length === 0,
    warnings: [...warnings, ...data.medicines.flatMap((m) => m.warnings)],
    errors,
    missingRequiredFields,
  };
}

/** Full prescription processing pipeline */
export async function processPrescription(
  imageUri: string,
  apiKey: string,
  onStageChange?: StageCallback
): Promise<{ data: PrescriptionJSON; validation: ValidationResult }> {
  try {
    // Stage 1: Preparing image
    onStageChange?.('preparing');
    const imageBase64 = await imageToBase64(imageUri);

    // Stage 2: Reading prescription (OCR)
    onStageChange?.('reading');
    const ocrResult = await visionCompletion(
      OCR_SYSTEM_PROMPT,
      'Please extract all prescription information from this image. Return structured JSON.',
      imageBase64,
      apiKey
    );

    const prescriptionData = parseOCRResponse(ocrResult);
    prescriptionData.prescription.source_image_id = imageUri;

    // Stage 3: Validating
    onStageChange?.('validating');
    const validation = validatePrescription(prescriptionData);

    // Stage 4: Complete
    onStageChange?.('complete');

    return { data: prescriptionData, validation };
  } catch (error) {
    onStageChange?.('error');
    throw error;
  }
}

/** Get plain-language explanation for a verified medicine */
export async function explainMedicine(
  medicine: {
    name: string | null;
    dosage: string | null;
    frequency: string | null;
    meal_instruction: string | null;
    duration: string | null;
  },
  apiKey: string
): Promise<string> {
  const userPrompt = `Explain this medicine from a verified prescription in simple language:
- Name: ${medicine.name ?? 'Unknown'}
- Dosage: ${medicine.dosage ?? 'Not specified'}
- Frequency: ${medicine.frequency ?? 'Not specified'}
- Meal instruction: ${medicine.meal_instruction ?? 'Not specified'}
- Duration: ${medicine.duration ?? 'Not specified'}

Provide a plain-language explanation, how to take it, common side effects, and when to contact a doctor.`;

  return chatCompletion(INTERPRETATION_SYSTEM_PROMPT, userPrompt, apiKey);
}
