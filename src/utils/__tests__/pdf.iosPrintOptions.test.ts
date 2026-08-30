import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Force the iOS branch of the platform logic regardless of the host running
// the tests — this file verifies what an iPhone receives from expo-print.
// (Platform.OS is read at call time in getPrintFileOptions' default param.)
import { Platform } from 'react-native';
(Platform as { OS: string }).OS = 'ios';

jest.mock('expo-print', () => ({
  printToFileAsync: jest
    .fn()
    .mockResolvedValue({ uri: 'file:///mock/print/output.pdf', numberOfPages: 1 }),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock/cache/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  readAsStringAsync: jest.fn(),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn() } }));

import * as Print from 'expo-print';
import { generateDoctorVisitPdf, generateAnalyticsReportPdf } from '../pdf';
import { PAGE_CSS, mmToPoints, PAGE_SIZE_MM, PAGE_MARGIN_MM } from '../pdfPage';
import type { Medicine, Schedule } from '../../types/models';

const printMock = Print.printToFileAsync as jest.Mock;

const medicine: Medicine = {
  id: 'med-1',
  prescription_id: 'rx-1',
  name: 'Amoxicillin',
  generic_name: 'amoxicillin',
  brand_name: 'Amoxil',
  strength: '500 mg',
  form: 'capsule',
  dosage: '1 capsule',
  frequency: 'Three times a day',
  meal_instruction: 'after',
  duration: '7 days',
  purpose: 'Bacterial infection',
  side_effects: [],
  food_interactions: [],
  storage: null,
  confidence: 1,
  warnings: [],
  verification_status: 'verified',
  initial_quantity: 21,
  remaining_quantity: 14,
  created_at: '2026-08-29T08:00:00Z',
  updated_at: '2026-08-29T08:00:00Z',
};

const schedule: Schedule = {
  id: 'sch-1',
  medicine_id: 'med-1',
  time: '08:00',
  window_minutes: 120,
  timezone: 'Asia/Karachi',
  frequency: 'daily',
  meal_instruction: 'after',
  start_date: '2026-08-29',
  end_date: null,
  is_active: true,
  notification_id: null,
  created_at: '2026-08-29T08:00:00Z',
};

/** Writes the captured HTML to disk for visual inspection (opt-in via env) */
function dumpPreview(name: string, html: string): string | null {
  if (process.env.PDF_PREVIEW !== '1') return null;
  const dir = path.join(os.tmpdir(), 'nusxa-pdf-previews');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

describe('PDF generators on iOS', () => {
  beforeEach(() => printMock.mockClear());

  it('passes the native A4 page size and margins to expo-print (doctor visit)', async () => {
    await generateDoctorVisitPdf({
      profileName: 'Zaid',
      medicines: [medicine],
      schedules: [schedule],
      notes: '- Any side effects?\n- Can I take it with food?',
      dateOfBirth: '2010-04-12',
      bloodGroup: 'B+',
      allergies: ['Penicillin'],
      language: 'en',
    });

    expect(printMock).toHaveBeenCalledTimes(1);
    const arg = printMock.mock.calls[0][0];
    expect(arg.width).toBe(mmToPoints(PAGE_SIZE_MM.width));
    expect(arg.height).toBe(mmToPoints(PAGE_SIZE_MM.height));
    expect(arg.margins).toEqual({
      top: mmToPoints(PAGE_MARGIN_MM.top),
      right: mmToPoints(PAGE_MARGIN_MM.right),
      bottom: mmToPoints(PAGE_MARGIN_MM.bottom),
      left: mmToPoints(PAGE_MARGIN_MM.left),
    });
    expect(arg.html).toContain(PAGE_CSS);
    expect(arg.html).toContain('Zaid');
    expect(arg.html).toContain('Amoxicillin');
    expect(arg.html).toContain('Penicillin');

    const preview = dumpPreview('doctor-visit-ios.html', arg.html);
    if (preview) console.log('doctor-visit preview:', preview);
  });

  it('passes the native A4 page size and margins to expo-print (analytics)', async () => {
    await generateAnalyticsReportPdf({
      profileName: 'Zaid',
      periodLabel: 'last 7 days',
      adherenceRate: 86,
      taken: 18,
      missed: 2,
      skipped: 1,
      total: 21,
      days: [
        { date: '2026-08-28', taken: 3, missed: 0, skipped: 0 },
        { date: '2026-08-29', taken: 2, missed: 1, skipped: 0 },
      ],
      dateOfBirth: '2010-04-12',
      bloodGroup: 'B+',
      language: 'en',
    });

    expect(printMock).toHaveBeenCalledTimes(1);
    const arg = printMock.mock.calls[0][0];
    expect(arg.width).toBe(mmToPoints(PAGE_SIZE_MM.width));
    expect(arg.height).toBe(mmToPoints(PAGE_SIZE_MM.height));
    expect(arg.margins).toEqual({
      top: mmToPoints(PAGE_MARGIN_MM.top),
      right: mmToPoints(PAGE_MARGIN_MM.right),
      bottom: mmToPoints(PAGE_MARGIN_MM.bottom),
      left: mmToPoints(PAGE_MARGIN_MM.left),
    });
    expect(arg.html).toContain(PAGE_CSS);
    expect(arg.html).toContain('Zaid');
    expect(arg.html).toContain('86%');

    const preview = dumpPreview('analytics-ios.html', arg.html);
    if (preview) console.log('analytics preview:', preview);
  });
});
