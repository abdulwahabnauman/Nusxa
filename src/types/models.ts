export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'needs_review';
export type TreatmentStatus = 'active' | 'completed' | 'archived';
export type DoseStatus = 'taken' | 'skipped' | 'missed' | 'pending';
export type MealInstruction = 'before' | 'after' | 'with' | 'none' | null;
export type MedicineForm = 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops' | 'inhaler' | 'patch' | 'other' | null;

export interface Profile {
  id: number;
  name: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  allergies: string[];
  emergency_contact: { name: string; phone: string } | null;
  primary_physician: string | null;
  elderly_mode: boolean;
  language: string;
  onboarding_complete: boolean;
  notifications_enabled: boolean;
  reduced_motion: boolean;
  eastern_numerals?: boolean;
  theme_preference?: 'system' | 'light' | 'dark';
  created_at: string;
  updated_at: string;
}

export interface Prescription {
  id: string;
  doctor_name: string | null;
  hospital: string | null;
  date: string | null;
  follow_up_date: string | null;
  source_image_uri: string | null;
  verification_status: VerificationStatus;
  overall_confidence: number;
  patient_notes: string | null;
  treatment_status: TreatmentStatus;
  created_at: string;
  updated_at: string;
}

export interface Medicine {
  id: string;
  prescription_id: string;
  name: string | null;
  generic_name: string | null;
  brand_name: string | null;
  strength: string | null;
  form: MedicineForm;
  dosage: string | null;
  frequency: string | null;
  meal_instruction: MealInstruction;
  duration: string | null;
  purpose: string | null;
  side_effects: string[];
  food_interactions: string[];
  storage: string | null;
  confidence: number;
  warnings: string[];
  verification_status: VerificationStatus;
  initial_quantity: number | null;
  remaining_quantity: number | null;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: string;
  medicine_id: string;
  time: string;
  timezone: string;
  frequency: string;
  meal_instruction: MealInstruction;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notification_id: string | null;
  created_at: string;
}

export interface DoseRecord {
  id: string;
  schedule_id: string;
  medicine_id: string;
  scheduled_time: string;
  actual_time: string | null;
  status: DoseStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Medicine with joined schedule and today's dose info */
export interface MedicineWithSchedule extends Medicine {
  schedules: Schedule[];
  todayDoses: {
    scheduleId: string;
    time: string;
    status: DoseStatus;
    doseRecordId: string | null;
  }[];
}

/** Today's schedule item for the home screen */
export interface TodayScheduleItem {
  scheduleId: string;
  medicineId: string;
  medicineName: string;
  dosage: string | null;
  time: string;
  mealInstruction: MealInstruction;
  status: DoseStatus;
  doseRecordId: string | null;
  category: string;
}

/** Prescription with its medicines */
export interface PrescriptionWithMedicines extends Prescription {
  medicines: Medicine[];
}
