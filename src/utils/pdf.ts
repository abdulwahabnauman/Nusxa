import * as Print from 'expo-print';
import { formatDateReadable, formatTime12h } from './date';
import type { Medicine, Schedule } from '../types/models';

/** Escape a string for safe inclusion in HTML */
function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const dash = (value: string | null | undefined): string => (value && value.trim() ? esc(value) : '&mdash;');

const MEAL_LABELS: Record<string, string> = {
  before: 'Before meal',
  after: 'After meal',
  with: 'With meal',
  none: 'No meal restriction',
};

interface DoctorVisitPdfParams {
  profileName: string;
  medicines: Medicine[];
  schedules: Schedule[];
  notes?: string;
}

/**
 * Generate a doctor-visit summary PDF on-device and return its file URI.
 * The caller is responsible for sharing/cleanup of the returned file.
 */
export async function generateDoctorVisitPdf(params: DoctorVisitPdfParams): Promise<string> {
  const { profileName, medicines, schedules, notes } = params;
  const generatedAt = formatDateReadable(new Date());

  // Build the daily schedule rows, sorted by time, with medicine names resolved
  const medicineById = new Map(medicines.map((m) => [m.id, m]));
  const scheduleRows = [...schedules]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((s) => {
      const med = medicineById.get(s.medicine_id);
      if (!med) return '';
      return `
        <tr>
          <td class="mono">${esc(formatTime12h(s.time))}</td>
          <td>${dash(med.name)}${med.strength ? ` <span class="muted">(${esc(med.strength)})</span>` : ''}</td>
          <td>${dash(med.dosage)}</td>
          <td>${esc(MEAL_LABELS[s.meal_instruction ?? 'none'] ?? '—')}</td>
        </tr>`;
    })
    .join('');

  const medicineRows = medicines
    .map((m) => `
      <tr>
        <td><strong>${dash(m.name)}</strong>${m.strength ? `<br /><span class="muted">${esc(m.strength)}</span>` : ''}</td>
        <td>${dash(m.dosage)}</td>
        <td>${dash(m.frequency)}</td>
        <td>${esc(MEAL_LABELS[m.meal_instruction ?? 'none'] ?? '—')}</td>
        <td>${dash(m.duration)}</td>
        <td class="muted">${dash(m.purpose)}</td>
      </tr>`)
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Helvetica, Arial, sans-serif;
      color: #1f2937;
      font-size: 12px;
      line-height: 1.5;
      margin: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 3px solid #1B3A7B;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .brand { font-size: 22px; font-weight: 700; color: #1B3A7B; letter-spacing: 0.5px; }
    .brand-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .meta { text-align: right; font-size: 11px; color: #6b7280; }
    .meta strong { color: #1f2937; }
    h2 {
      font-size: 14px;
      color: #1B3A7B;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 22px 0 8px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 4px;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th {
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #6b7280;
      background: #f3f6fc;
      padding: 6px 8px;
      border-bottom: 1px solid #d6deee;
    }
    td { padding: 7px 8px; border-bottom: 1px solid #eef0f4; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: 'Courier New', monospace; white-space: nowrap; }
    .muted { color: #6b7280; font-size: 11px; }
    .notes {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 10px 12px;
      white-space: pre-wrap;
    }
    .disclaimer {
      margin-top: 26px;
      font-size: 10px;
      color: #9ca3af;
      border-top: 1px solid #e5e7eb;
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Nusxa</div>
      <div class="brand-sub">Patient Visit Summary</div>
    </div>
    <div class="meta">
      Patient: <strong>${esc(profileName)}</strong><br />
      Generated: <strong>${esc(generatedAt)}</strong>
    </div>
  </div>

  <h2>Current Medicines</h2>
  ${
    medicines.length > 0
      ? `<table>
          <thead>
            <tr>
              <th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Meal</th><th>Duration</th><th>Purpose</th>
            </tr>
          </thead>
          <tbody>${medicineRows}</tbody>
        </table>`
      : '<p class="muted">No active medicines recorded.</p>'
  }

  <h2>Daily Schedule</h2>
  ${
    scheduleRows
      ? `<table>
          <thead>
            <tr><th>Time</th><th>Medicine</th><th>Dose</th><th>Meal</th></tr>
          </thead>
          <tbody>${scheduleRows}</tbody>
        </table>`
      : '<p class="muted">No active dose times recorded.</p>'
  }

  ${
    notes
      ? `<h2>Questions / Notes for the Doctor</h2><div class="notes">${esc(notes)}</div>`
      : ''
  }

  <div class="disclaimer">
    This is a patient-generated summary produced by the Nusxa app and is not an official medical record.
    Information was entered or scanned by the patient; please verify against the original prescription.
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}
