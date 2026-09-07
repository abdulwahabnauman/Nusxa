import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { formatDateReadable, getTimeRangeParts, calculateAge } from './date';
import { PAGE_CSS, getPrintFileOptions } from './pdfPage';
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

const dash = (value: string | null | undefined, fallback = 'Not set'): string => (value && value.trim() ? esc(value) : fallback);

/** Minimal markdown renderer for free-text notes: escapes first, then applies
 * bold/italic/code, bullet lists, headings and paragraphs. */
function markdownToHtml(source: string): string {
  const inline = (text: string) =>
    text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const out: string[] = [];
  let inList = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const raw of esc(source).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      closeList();
      continue;
    }
    const bullet = line.match(/^[-•]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(bullet[1] ?? '')}</li>`);
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      flushPara();
      closeList();
      out.push(`<p><strong>${inline(heading[1] ?? '')}</strong></p>`);
      continue;
    }
    closeList();
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join('');
}

const MEAL_LABELS: Record<string, string> = {
  before: 'Before meal',
  after: 'After meal',
  with: 'With meal',
  none: 'No meal restriction',
};

/**
 * Urdu (RTL) PDF support — audit UX4. When the user's chosen language is
 * Urdu, reports are rendered right-to-left with localized headings and the
 * bundled Noto Nastaliq Urdu font embedded as a base64 data URI (WebView
 * print renderers don't reliably resolve file:// font URLs).
 */
export type PdfLanguage = 'en' | 'ur';

interface PdfStrings {
  visitSub: string;
  patient: string;
  dob: string;
  age: string;
  bloodGroup: string;
  generated: string;
  allergies: string;
  currentMedicines: string;
  noMedicines: string;
  medicine: string;
  dosage: string;
  frequency: string;
  meal: string;
  duration: string;
  purpose: string;
  dailySchedule: string;
  time: string;
  dose: string;
  noSchedule: string;
  notesHeading: string;
  notSet: string;
  disclaimerVisit: string;
  analyticsSub: string;
  summary: string;
  adherence: string;
  taken: string;
  missed: string;
  skipped: string;
  totalDoses: string;
  adherenceOver: string;
  dailyBreakdown: string;
  date: string;
  noData: string;
  noRecords: string;
  disclaimerAnalytics: string;
}

const EN: PdfStrings = {
  visitSub: 'Patient Visit Summary',
  patient: 'Patient',
  dob: 'DOB',
  age: 'Age',
  bloodGroup: 'Blood group',
  generated: 'Generated',
  allergies: 'Allergies',
  currentMedicines: 'Current Medicines',
  noMedicines: 'No active medicines recorded.',
  medicine: 'Medicine',
  dosage: 'Dosage',
  frequency: 'Frequency',
  meal: 'Meal',
  duration: 'Duration',
  purpose: 'Purpose',
  dailySchedule: 'Daily Schedule',
  time: 'Time',
  dose: 'Dose',
  noSchedule: 'No active dose times recorded.',
  notesHeading: 'Questions / Notes for the Doctor',
  notSet: 'Not set',
  disclaimerVisit:
    'This is a patient-generated summary produced by the Nusxa app and is not an official medical record. Information was entered or scanned by the patient; please verify against the original prescription.',
  analyticsSub: 'Adherence Analytics Report',
  summary: 'Summary',
  adherence: 'Adherence',
  taken: 'Taken',
  missed: 'Missed',
  skipped: 'Skipped',
  totalDoses: 'Total doses',
  adherenceOver: 'Adherence over',
  dailyBreakdown: 'Daily Breakdown',
  date: 'Date',
  noData: 'No data',
  noRecords: 'No dose records in this period.',
  disclaimerAnalytics:
    'This is an app-generated adherence summary produced by Nusxa and is not an official medical record. Adherence reflects doses marked in the app, not directly observed intake.',
};

const UR: PdfStrings = {
  visitSub: 'ڈاکٹر دورے کا خلاصہ',
  patient: 'مریض',
  dob: 'تاریخ پیدائش',
  age: 'عمر',
  bloodGroup: 'بلڈ گروپ',
  generated: 'تیار کردہ',
  allergies: 'الرجی',
  currentMedicines: 'موجودہ ادویات',
  noMedicines: 'کوئی فعال دوا درج نہیں۔',
  medicine: 'دوا',
  dosage: 'خوراک',
  frequency: 'تعدد',
  meal: 'کھانا',
  duration: 'دورانیہ',
  purpose: 'مقصد',
  dailySchedule: 'روزانہ شیڈول',
  time: 'وقت',
  dose: 'خوراک',
  noSchedule: 'کوئی فعال خوراک کا وقت درج نہیں۔',
  notesHeading: 'ڈاکٹر کے لیے سوالات / نوٹس',
  notSet: 'درج نہیں',
  disclaimerVisit:
    'یہ نسخہ ایپ کے ذریعے مریض کی تیار کردہ معلومات ہیں اور کوئی سرکاری طبی ریکارڈ نہیں۔ معلومات مریض نے خود درج یا اسکین کی ہیں؛ براہ کرم اصل نسخے سے تصدیق کریں۔',
  analyticsSub: 'ادویات کی پابندی کی رپورٹ',
  summary: 'خلاصہ',
  adherence: 'پابندی',
  taken: 'لی گئی',
  missed: 'چھوٹ گئی',
  skipped: 'ترک کی گئی',
  totalDoses: 'کل خوراکیں',
  adherenceOver: 'پابندی برائے',
  dailyBreakdown: 'روزانہ تفصیل',
  date: 'تاریخ',
  noData: 'ڈیٹا نہیں',
  noRecords: 'اس دور میں خوراک کا کوئی ریکارڈ نہیں۔',
  disclaimerAnalytics:
    'یہ نسخہ ایپ کی تیار کردہ پابندی رپورٹ ہے اور کوئی سرکاری طبی ریکارڈ نہیں۔ پابندی کا انحصار ایپ میں نشان زد خوراکوں پر ہے، نہ کہ براہ راست مشاہدے پر۔',
};

const UR_MEAL_LABELS: Record<string, string> = {
  before: 'کھانے سے پہلے',
  after: 'کھانے کے بعد',
  with: 'کھانے کے ساتھ',
  none: 'کھانے کی کوئی پابندی نہیں',
};

let urduFontBase64: string | null = null;

/** @font-face rule embedding the bundled Nastaliq font (cached after first read) */
async function getUrduFontCss(): Promise<string> {
  try {
    if (!urduFontBase64) {
      const asset = Asset.fromModule(require('../../assets/fonts/NotoNastaliqUrdu.ttf'));
      await asset.downloadAsync();
      if (!asset.localUri) return '';
      urduFontBase64 = await FileSystem.readAsStringAsync(asset.localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    return `@font-face { font-family: 'Noto Nastaliq Urdu'; src: url(data:font/ttf;base64,${urduFontBase64}) format('truetype'); }`;
  } catch {
    // Fall back to system fonts rather than failing the whole PDF
    return '';
  }
}

/** Localized "generated at" stamp */
function generatedAtStamp(ur: boolean): string {
  if (!ur) return formatDateReadable(new Date());
  try {
    return new Intl.DateTimeFormat('ur-PK', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch {
    return formatDateReadable(new Date());
  }
}

interface DoctorVisitPdfParams {
  profileName: string;
  medicines: Medicine[];
  schedules: Schedule[];
  notes?: string;
  /** Optional patient identifiers pulled from the profile (H6) */
  dateOfBirth?: string | null;
  bloodGroup?: string | null;
  allergies?: string[];
  /** Renders an RTL Urdu report when 'ur' (audit UX4) */
  language?: PdfLanguage;
}

/**
 * Generate a doctor-visit summary PDF on-device and return its file URI.
 * The caller is responsible for sharing/cleanup of the returned file.
 */
export async function generateDoctorVisitPdf(params: DoctorVisitPdfParams): Promise<string> {
  const { profileName, medicines, schedules, notes, dateOfBirth, bloodGroup, allergies, language } = params;
  const ur = language === 'ur';
  const S = ur ? UR : EN;
  const generatedAt = generatedAtStamp(ur);
  const age = dateOfBirth ? calculateAge(dateOfBirth) : null;
  const fontCss = ur ? await getUrduFontCss() : '';
  const mealLabel = (key?: string | null) => {
    const labels = ur ? UR_MEAL_LABELS : MEAL_LABELS;
    return esc(labels[key ?? 'none'] ?? S.notSet);
  };
  // Localized "not set" placeholder for empty medicine fields
  const dashL = (v: string | null | undefined) => dash(v, esc(S.notSet));

  // Build the daily schedule rows, sorted by time, with medicine names resolved
  const medicineById = new Map(medicines.map((m) => [m.id, m]));
  const scheduleRows = [...schedules]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((s) => {
      const med = medicineById.get(s.medicine_id);
      if (!med) return '';
      return `
        <tr>
          <td class="mono">${esc(getTimeRangeParts(s.time, s.window_minutes ?? 120, ur ? 'ur' : 'en').join(ur ? ' تا ' : ' to '))}</td>
          <td>${dashL(med.name)}${med.strength ? ` <span class="muted">(${esc(med.strength)})</span>` : ''}</td>
          <td>${dashL(med.dosage)}</td>
          <td>${mealLabel(s.meal_instruction)}</td>
        </tr>`;
    })
    .join('');

  const medicineRows = medicines
    .map((m) => `
      <tr>
        <td><strong>${dashL(m.name)}</strong>${m.strength ? `<br /><span class="muted">${esc(m.strength)}</span>` : ''}</td>
        <td>${dashL(m.dosage)}</td>
        <td>${dashL(m.frequency)}</td>
        <td>${mealLabel(m.meal_instruction)}</td>
        <td>${dashL(m.duration)}</td>
        <td class="muted">${dashL(m.purpose)}</td>
      </tr>`)
    .join('');

  const html = `
<!DOCTYPE html>
<html${ur ? ' dir="rtl"' : ''}>
<head>
  <meta charset="utf-8" />
  <style>
    ${fontCss}
    ${PAGE_CSS}
    * { box-sizing: border-box; }
    body {
      font-family: Helvetica, Arial, sans-serif;
      color: #1f2937;
      font-size: 12px;
      line-height: 1.5;
      margin: 0;
      /* Keep backgrounds and light borders in the iOS print output */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* iOS prints through UIPrintPageRenderer, which does not support flexbox,
       so the header uses floats. */
    .header {
      overflow: hidden;
      border-bottom: 3px solid #1B3A7B;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .header-left { float: left; }
    .brand { font-size: 22px; font-weight: 700; color: #1B3A7B; letter-spacing: 0.5px; }
    .brand-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .meta { float: right; text-align: right; font-size: 11px; color: #6b7280; }
    .meta strong { color: #1f2937; }
    h2 {
      font-size: 14px;
      color: #1B3A7B;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 26px 0 10px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 5px;
    }
    /* border-collapse: separate keeps cell borders reliable on iOS prints,
       where collapsed table borders get dropped */
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 4px; }
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
    tbody tr:nth-child(even) td { background: #fafbfe; }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: 'Courier New', monospace; white-space: nowrap; }
    .muted { color: #6b7280; font-size: 11px; }
    .notes {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .notes p { margin: 0 0 6px; }
    .notes p:last-child { margin-bottom: 0; }
    .notes ul { margin: 0 0 6px; padding-left: 18px; list-style: disc; }
    .notes code { background: #eef0f4; padding: 1px 4px; border-radius: 3px; font-family: 'Courier New', monospace; }
    .disclaimer {
      margin-top: 28px;
      font-size: 10px;
      line-height: 1.6;
      color: #374151;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 10px 12px;
    }
    ${ur ? `
    /* RTL Urdu overrides: mirrored floats, right-aligned text, Nastaliq font
       with the tall line-height Nastaliq glyphs need */
    body { font-family: 'Noto Nastaliq Urdu', Helvetica, Arial, sans-serif; line-height: 2.1; }
    .header-left { float: right; }
    .meta { float: left; text-align: left; }
    h2 { letter-spacing: 0; }
    th, td { text-align: right; }
    .notes ul { padding-left: 0; padding-right: 18px; }
    .disclaimer { line-height: 2; }
    ` : ''}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="brand">Nusxa</div>
      <div class="brand-sub">${esc(S.visitSub)}</div>
    </div>
    <div class="meta">
      ${esc(S.patient)}: <strong>${esc(profileName)}</strong><br />
      ${dateOfBirth ? `${esc(S.dob)}: <strong>${esc(dateOfBirth)}</strong>${age !== null ? ` (${esc(S.age)} ${age})` : ''}<br />` : ''}
      ${bloodGroup ? `${esc(S.bloodGroup)}: <strong>${esc(bloodGroup)}</strong><br />` : ''}
      ${esc(S.generated)}: <strong>${esc(generatedAt)}</strong>
    </div>
  </div>

  ${allergies && allergies.length > 0 ? `
  <h2>${esc(S.allergies)}</h2>
  <p><strong>${allergies.map(esc).join(', ')}</strong></p>` : ''}

  <h2>${esc(S.currentMedicines)}</h2>
  ${
    medicines.length > 0
      ? `<table>
          <thead>
            <tr>
              <th>${esc(S.medicine)}</th><th>${esc(S.dosage)}</th><th>${esc(S.frequency)}</th><th>${esc(S.meal)}</th><th>${esc(S.duration)}</th><th>${esc(S.purpose)}</th>
            </tr>
          </thead>
          <tbody>${medicineRows}</tbody>
        </table>`
      : `<p class="muted">${esc(S.noMedicines)}</p>`
  }

  <h2>${esc(S.dailySchedule)}</h2>
  ${
    scheduleRows
      ? `<table>
          <thead>
            <tr><th>${esc(S.time)}</th><th>${esc(S.medicine)}</th><th>${esc(S.dose)}</th><th>${esc(S.meal)}</th></tr>
          </thead>
          <tbody>${scheduleRows}</tbody>
        </table>`
      : `<p class="muted">${esc(S.noSchedule)}</p>`
  }

  ${
    notes
      ? `<h2>${esc(S.notesHeading)}</h2><div class="notes">${markdownToHtml(notes)}</div>`
      : ''
  }

  <div class="disclaimer">
    ${esc(S.disclaimerVisit)}
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, ...getPrintFileOptions() });

  // expo-print names its temp file arbitrarily; copy it to a human-friendly
  // name so the share sheet / saved file reads "Nusxa_DoctorVisit_<patient>_<date>.pdf".
  const safeName = profileName.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') || 'Patient';
  const dated = new Date().toISOString().slice(0, 10);
  const namedUri = `${FileSystem.cacheDirectory}Nusxa_DoctorVisit_${safeName}_${dated}.pdf`;
  try {
    await FileSystem.copyAsync({ from: uri, to: namedUri });
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return namedUri;
  } catch {
    // If the rename fails for any reason, share the original temp file
    return uri;
  }
}

export interface AnalyticsDayRow {
  date: string;
  taken: number;
  missed: number;
  skipped: number;
}

interface AnalyticsReportPdfParams {
  profileName: string;
  periodLabel: string;
  adherenceRate: number;
  taken: number;
  missed: number;
  skipped: number;
  total: number;
  days: AnalyticsDayRow[];
  /** Optional patient identifiers pulled from the profile (same as the visit PDF) */
  dateOfBirth?: string | null;
  bloodGroup?: string | null;
  /** Renders an RTL Urdu report when 'ur' (audit UX4) */
  language?: PdfLanguage;
}

/** Localized day-by-day date cell */
function dayCellDate(dateIso: string, ur: boolean): string {
  if (!ur) return formatDateReadable(new Date(dateIso));
  try {
    return new Intl.DateTimeFormat('ur-PK', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(dateIso));
  } catch {
    return formatDateReadable(new Date(dateIso));
  }
}

/**
 * Generate an analytics adherence-report PDF on-device and return its file
 * URI. The caller is responsible for sharing/cleanup of the returned file.
 */
export async function generateAnalyticsReportPdf(params: AnalyticsReportPdfParams): Promise<string> {
  const { profileName, periodLabel, adherenceRate, taken, missed, skipped, total, days, dateOfBirth, bloodGroup, language } = params;
  const ur = language === 'ur';
  const S = ur ? UR : EN;
  const generatedAt = generatedAtStamp(ur);
  const age = dateOfBirth ? calculateAge(dateOfBirth) : null;
  const fontCss = ur ? await getUrduFontCss() : '';

  const dayRows = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const dayTotal = d.taken + d.missed + d.skipped;
      const dayRate = dayTotal > 0 ? Math.round((d.taken / dayTotal) * 100) : null;
      return `
        <tr>
          <td class="mono">${esc(dayCellDate(d.date, ur))}</td>
          <td>${d.taken}</td>
          <td>${d.missed}</td>
          <td>${d.skipped}</td>
          <td>${dayRate === null ? esc(S.noData) : `${dayRate}%`}</td>
        </tr>`;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html${ur ? ' dir="rtl"' : ''}>
<head>
  <meta charset="utf-8" />
  <style>
    ${fontCss}
    ${PAGE_CSS}
    * { box-sizing: border-box; }
    body {
      font-family: Helvetica, Arial, sans-serif;
      color: #1f2937;
      font-size: 12px;
      line-height: 1.5;
      margin: 0;
      /* Keep backgrounds and light borders in the iOS print output */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* iOS prints through UIPrintPageRenderer, which does not support flexbox,
       so the header uses floats. */
    .header {
      overflow: hidden;
      border-bottom: 3px solid #1B3A7B;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .header-left { float: left; }
    .brand { font-size: 22px; font-weight: 700; color: #1B3A7B; letter-spacing: 0.5px; }
    .brand-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .meta { float: right; text-align: right; font-size: 11px; color: #6b7280; }
    .meta strong { color: #1f2937; }
    h2 {
      font-size: 14px;
      color: #1B3A7B;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 26px 0 10px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 5px;
    }
    /* Flexbox is unsupported by the iOS print renderer, so the stat cards float */
    .stats { overflow: hidden; margin-top: 12px; }
    .stat {
      float: ${ur ? 'right' : 'left'};
      width: 18.7%;
      margin-${ur ? 'left' : 'right'}: 1.625%;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 10px;
      text-align: center;
      background: #f9fafb;
    }
    .stat .value { font-size: 24px; font-weight: 700; color: #1B3A7B; }
    .stat .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; margin-top: 2px; }
    .stat.good { background: #ecfdf5; border-color: #a7f3d0; }
    .stat.good .value { color: #059669; }
    .stat.bad { background: #fef2f2; border-color: #fecaca; }
    .stat.bad .value { color: #dc2626; }
    .stat:last-child { margin-${ur ? 'left' : 'right'}: 0; }
    .barWrap { margin-top: 16px; }
    .barTrack { background: #e5e7eb; border-radius: 6px; height: 10px; overflow: hidden; }
    .barFill { background: #059669; height: 10px; border-radius: 6px; }
    .barLabel { font-size: 10px; color: #6b7280; margin-top: 5px; }
    /* border-collapse: separate keeps cell borders reliable on iOS prints,
       where collapsed table borders get dropped */
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 4px; }
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
    tbody tr:nth-child(even) td { background: #fafbfe; }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: 'Courier New', monospace; white-space: nowrap; }
    .muted { color: #6b7280; font-size: 11px; }
    .disclaimer {
      margin-top: 28px;
      font-size: 10px;
      line-height: 1.6;
      color: #374151;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 10px 12px;
    }
    ${ur ? `
    /* RTL Urdu overrides: mirrored floats, right-aligned text, Nastaliq font
       with the tall line-height Nastaliq glyphs need */
    body { font-family: 'Noto Nastaliq Urdu', Helvetica, Arial, sans-serif; line-height: 2.1; }
    .header-left { float: right; }
    .meta { float: left; text-align: left; }
    h2 { letter-spacing: 0; }
    th, td { text-align: right; }
    .stat .label { letter-spacing: 0; }
    .disclaimer { line-height: 2; }
    ` : ''}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="brand">Nusxa</div>
      <div class="brand-sub">${esc(S.analyticsSub)}</div>
    </div>
    <div class="meta">
      ${esc(S.patient)}: <strong>${esc(profileName)}</strong><br />
      ${dateOfBirth ? `${esc(S.dob)}: <strong>${esc(dateOfBirth)}</strong>${age !== null ? ` (${esc(S.age)} ${age})` : ''}<br />` : ''}
      ${bloodGroup ? `${esc(S.bloodGroup)}: <strong>${esc(bloodGroup)}</strong><br />` : ''}
      ${esc(S.adherenceOver)}: <strong>${esc(periodLabel)}</strong><br />
      ${esc(S.generated)}: <strong>${esc(generatedAt)}</strong>
    </div>
  </div>

  <h2>${esc(S.summary)}</h2>
  <div class="stats">
    <div class="stat good"><div class="value">${adherenceRate}%</div><div class="label">${esc(S.adherence)}</div></div>
    <div class="stat good"><div class="value">${taken}</div><div class="label">${esc(S.taken)}</div></div>
    <div class="stat bad"><div class="value">${missed}</div><div class="label">${esc(S.missed)}</div></div>
    <div class="stat"><div class="value">${skipped}</div><div class="label">${esc(S.skipped)}</div></div>
    <div class="stat"><div class="value">${total}</div><div class="label">${esc(S.totalDoses)}</div></div>
  </div>

  <div class="barWrap">
    <div class="barTrack"><div class="barFill" style="width: ${Math.min(100, Math.max(0, adherenceRate))}%;"></div></div>
    <div class="barLabel">${esc(S.adherenceOver)} ${esc(periodLabel)}</div>
  </div>

  <h2>${esc(S.dailyBreakdown)}</h2>
  ${
    dayRows
      ? `<table>
          <thead>
            <tr><th>${esc(S.date)}</th><th>${esc(S.taken)}</th><th>${esc(S.missed)}</th><th>${esc(S.skipped)}</th><th>${esc(S.adherence)}</th></tr>
          </thead>
          <tbody>${dayRows}</tbody>
        </table>`
      : `<p class="muted">${esc(S.noRecords)}</p>`
  }

  <div class="disclaimer">
    ${esc(S.disclaimerAnalytics)}
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, ...getPrintFileOptions() });

  const safeName = profileName.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') || 'Patient';
  const dated = new Date().toISOString().slice(0, 10);
  const namedUri = `${FileSystem.cacheDirectory}Nusxa_AnalyticsReport_${safeName}_${dated}.pdf`;
  try {
    await FileSystem.copyAsync({ from: uri, to: namedUri });
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return namedUri;
  } catch {
    return uri;
  }
}
