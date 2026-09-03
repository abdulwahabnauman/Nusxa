import * as FileSystem from 'expo-file-system/legacy';
import { visionCompletion, chatCompletion, TextProviderKeys, AIError } from './client';
import { OCR_SYSTEM_PROMPT, OCR_RESPONSE_SCHEMA, INTERPRETATION_SYSTEM_PROMPT } from './prompts';
import { PrescriptionJSON, PipelineStage, ValidationResult, MedicineJSON } from './types';
import { LOW_CONFIDENCE_THRESHOLD } from '../constants/config';
import { postProcessPrescription } from './postprocess';

type StageCallback = (stage: PipelineStage) => void;

/** Clamp a raw value to the meal_instruction enum, anything else -> null */
function parseMealInstruction(value: unknown): MedicineJSON['meal_instruction'] {
  if (value === 'before' || value === 'after' || value === 'with' || value === 'none') {
    return value;
  }
  return null;
}

/** Keep only numeric entries — the model may omit or malformed parts */
function parseFieldConfidence(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, num] of Object.entries(value as Record<string, unknown>)) {
    if (typeof num === 'number' && Number.isFinite(num)) out[key] = num;
  }
  return out;
}

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
      medicines: (parsed.medicines ?? []).map((m: Record<string, unknown>) => {
        const medicine: MedicineJSON = {
          name: typeof m.name === 'string' ? m.name : null,
          generic_name: typeof m.generic_name === 'string' ? m.generic_name : null,
          brand_name: typeof m.brand_name === 'string' ? m.brand_name : null,
          strength: typeof m.strength === 'string' ? m.strength : null,
          form: typeof m.form === 'string' ? m.form : null,
          dosage: typeof m.dosage === 'string' ? m.dosage : null,
          frequency: typeof m.frequency === 'string' ? m.frequency : null,
          meal_instruction: parseMealInstruction(m.meal_instruction),
          duration: typeof m.duration === 'string' ? m.duration : null,
          original_text: typeof m.original_text === 'string' ? m.original_text : null,
          purpose: null,
          side_effects: [],
          food_interactions: [],
          storage: null,
          confidence: typeof m.confidence === 'number' ? m.confidence : 0,
          field_confidence: parseFieldConfidence(m.field_confidence),
          field_sources: {},
          warnings: Array.isArray(m.warnings) ? m.warnings : [],
          verification_status: 'pending' as const,
        };
        // Every field the model actually read is marked 'ocr'; the
        // post-processor upgrades changed fields to 'corrected' so the
        // review screen can tell read values from adjusted ones.
        for (const field of ['name', 'generic_name', 'brand_name', 'strength', 'form', 'dosage', 'frequency', 'duration']) {
          if (medicine[field as keyof MedicineJSON]) medicine.field_sources[field] = 'ocr';
        }
        if (medicine.meal_instruction) medicine.field_sources['meal_instruction'] = 'ocr';
        return medicine;
      }),
      patient_notes: typeof parsed.raw_notes === 'string' ? parsed.raw_notes : null,
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

/** Full prescription processing pipeline. Accepts one or more images: a
 * multi-page prescription is read as a single document by the vision model. */
export async function processPrescription(
  imageUris: string[],
  apiKey: string,
  onStageChange?: StageCallback
): Promise<{ data: PrescriptionJSON; validation: ValidationResult }> {
  try {
    if (imageUris.length === 0) {
      throw new Error('No images provided for processing.');
    }

    // Stage 1: Preparing images
    onStageChange?.('preparing');
    const imagesBase64 = await Promise.all(imageUris.map((uri) => imageToBase64(uri)));

    // Stage 2: Reading prescription (OCR)
    onStageChange?.('reading');
    const userText =
      imageUris.length > 1
        ? `This prescription spans ${imageUris.length} images, provided in order (page 1 to page ${imageUris.length}). Read them as one continuous document and extract all prescription information. Return structured JSON.`
        : 'Please extract all prescription information from this image. Return structured JSON.';
    const ocrResult = await visionCompletion(
      OCR_SYSTEM_PROMPT,
      userText,
      imagesBase64,
      apiKey,
      // Temperature 0 + controlled generation keep OCR deterministic and
      // the JSON shape hard-enforced (see OCR_RESPONSE_SCHEMA).
      { temperature: 0, responseSchema: OCR_RESPONSE_SCHEMA }
    );

    // The only record of what the model actually returned: an empty
    // extraction is otherwise indistinguishable from a transport failure.
    if (__DEV__) {
      console.log(`[ocr] raw reply (${ocrResult.length} chars): ${ocrResult.slice(0, 400)}`);
    }

    // Deterministic post-processing (fuzzy name correction, abbreviation
    // expansion, strength normalization) before validation sees the data.
    const prescriptionData = postProcessPrescription(parseOCRResponse(ocrResult));
    prescriptionData.prescription.source_image_id = imageUris[0] ?? null;

    // Stage 3: Validating
    onStageChange?.('validating');
    const validation = validatePrescription(prescriptionData);

    // Zero medicines is a failed scan, not a success: the review screen
    // would have nothing to review and OK would save an empty prescription.
    // Throwing here routes it through the error stage, whose copy tells the
    // user to retake the photo instead of retrying the same image.
    if (prescriptionData.medicines.length === 0) {
      throw new AIError('OCR extracted no medicines from the image', { code: 'no_medicines' });
    }

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
  keys: TextProviderKeys
): Promise<string> {
  const userPrompt = `Explain this medicine from a verified prescription in simple language:
- Name: ${medicine.name ?? 'Unknown'}
- Dosage: ${medicine.dosage ?? 'Not specified'}
- Frequency: ${medicine.frequency ?? 'Not specified'}
- Meal instruction: ${medicine.meal_instruction ?? 'Not specified'}
- Duration: ${medicine.duration ?? 'Not specified'}

Provide a plain-language explanation, how to take it, common side effects, and when to contact a doctor.`;

  return chatCompletion(INTERPRETATION_SYSTEM_PROMPT, userPrompt, keys);
}