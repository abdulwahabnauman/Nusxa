import { PrescriptionJSON } from '../ai/types';

export type RootStackParamList = {
  onboarding: undefined;
  '(tabs)': undefined;
  scan: undefined;
  processing: { imageUri: string };
  review: { imageUri: string; prescriptionData: PrescriptionJSON };
  'medicine/[id]': { id: string };
  schedule: { prescriptionId: string };
  chat: { medicineId?: string };
  'emergency-card': undefined;
  'doctor-visit': undefined;
};
