/**
 * Education Content Database Schema
 * For storing medication guides, condition information, and educational resources
 */

export const EDUCATION_SCHEMA = `
  -- Education categories (groups related content)
  CREATE TABLE IF NOT EXISTS education_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,           -- e.g., 'blood-pressure', 'antibiotics'
    title_en TEXT NOT NULL,              -- English title
    title_ur TEXT NOT NULL,              -- Urdu title  
    description_en TEXT,                 -- English description
    description_ur TEXT,                 -- Urdu description
    icon_name TEXT NOT NULL,             -- Material Community Icons name
    color TEXT DEFAULT '#2563EB',        -- Category accent color
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Educational content items
  CREATE TABLE IF NOT EXISTS education_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    slug TEXT UNIQUE NOT NULL,           -- e.g., 'ace-inhibitors-overview'
    title_en TEXT NOT NULL,              -- English title
    title_ur TEXT NOT NULL,              -- Urdu title
    summary_en TEXT,                     -- Short summary (1-2 sentences)
    summary_ur TEXT,                     -- Urdu summary
    content_en TEXT,                     -- Full HTML/Rich text content
    content_ur TEXT,                     -- Urdu content
    author TEXT,                         -- Author/medical professional
    last_reviewed DATETIME,              -- Medical review date
    read_time_minutes INTEGER DEFAULT 5, -- Estimated reading time
    view_count INTEGER DEFAULT 0,        -- Analytics tracking
    is_published INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES education_categories(id) ON DELETE CASCADE
  );

  -- User bookmarks/favorites
  CREATE TABLE IF NOT EXISTS education_bookmarks (
    user_id TEXT NOT NULL,
    content_id INTEGER NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, content_id),
    FOREIGN KEY (content_id) REFERENCES education_content(id) ON DELETE CASCADE
  );

  -- Reading history for progress tracking
  CREATE TABLE IF NOT EXISTS education_reading_history (
    user_id TEXT NOT NULL,
    content_id INTEGER NOT NULL,
    last_read_position INTEGER DEFAULT 0,  -- Percentage or scroll position
    completed_at DATETIME,                  -- When user finished article
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_time_spent_seconds INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, content_id),
    FOREIGN KEY (content_id) REFERENCES education_content(id) ON DELETE CASCADE
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_education_categories_slug ON education_categories(slug);
  CREATE INDEX IF NOT EXISTS idx_education_content_category ON education_content(category_id);
  CREATE INDEX IF NOT EXISTS idx_education_content_slug ON education_content(slug);
  CREATE INDEX IF NOT EXISTS idx_education_content_published ON education_content(is_published);
`;

/**
 * Sample data insertion (run once during app setup)
 */
export const SAMPLE_CATEGORIES = [
  {
    slug: 'blood-pressure',
    title_en: 'Blood Pressure Medications',
    title_ur: 'بلڈ پریشر کی ادویات',
    description_en: 'Learn about medications used to manage high and low blood pressure',
    description_ur: 'اعلیٰ اور کم بلڈ پریشر کو کنٹرول کرنے والی ادویات کے بارے میں جانیں',
    icon_name: 'heart-pulse',
    color: '#DC2626',
    sort_order: 1
  },
  {
    slug: 'antibiotics',
    title_en: 'Antibiotics & Infections',
    title_ur: 'اینٹی بائیوٹکس اور انفیکشنز',
    description_en: 'Understanding antibiotic treatments and infection management',
    description_ur: 'اینٹی بائیوٹک علاج اور انفیکشن مینجمنٹ کو سمجھنا',
    icon_name: 'shield-check',
    color: '#15803D',
    sort_order: 2
  },
  {
    slug: 'painkillers',
    title_en: 'Pain Management',
    title_ur: 'تکلیف میں کمی',
    description_en: 'Types of pain relievers and how to use them safely',
    description_ur: 'درد کی اقسام اور انہیں محفوظ طریقے سے استعمال کرنا',
    icon_name: 'emoticon-sad-outline',
    color: '#B45309',
    sort_order: 3
  },
  {
    slug: 'vitamins-minerals',
    title_en: 'Vitamins & Supplements',
    title_ur: 'ویتامنز اور سپلیمنٹس',
    description_en: 'Essential vitamins, minerals, and dietary supplements explained',
    description_ur: 'ضروری وٹامنز، معدنیات اور غذائی سپلیمنٹس کی وضاحت',
    icon_name: 'omega-3',
    color: '#0D9488',
    sort_order: 4
  }
];

export const SAMPLE_CONTENT = [
  {
    category_id: 1,
    slug: 'ace-inhibitors-overview',
    title_en: 'ACE Inhibitors: A Complete Guide',
    title_ur: 'ای سی ای انہیبیٹرز: مکمل گائیڈ',
    summary_en: 'Learn how ACE inhibitors work to lower blood pressure and protect your heart.',
    summary_ur: 'ای سی ای انہیبیٹرز جانیں کہ بلڈ پریشر کم کرنے اور دل کی حفاظت کے لیے کیسے کام کرتے ہیں۔',
    content_en: `<h1>ACE Inhibitors</h1>
<p>Angiotensin-Converting Enzyme (ACE) inhibitors are a class of medications used primarily for treating high blood pressure and heart failure.</p>
<h2>How They Work</h2>
<p>ACE inhibitors block the formation of angiotensin II, a substance that narrows blood vessels, allowing vessels to relax and widen.</p>
<h2>Common Side Effects</h2>
<ul>
<li>Dry cough</li>
<li>Dizziness</li>
<li>Headache</li>
<li>Fatigue</li>
</ul>
<h2>Taking Your Medication</h2>
<p>Take ACE inhibitors exactly as prescribed. Take at the same time each day for best results.</p>`,
    content_ur: `<h1>ای سی ای انہیبیٹرز</h1>
<p>اینژیو ٹینسِن کنورٹنگ اینزائم (ACE) انہیبیٹرز ادویات کی ایک کلاس ہے جو بنیادی طور پر اعلیٰ بلڈ پریشر اور ہارٹ فیلیئر کا علاج کرنے کے لیے استعمال ہوتے ہیں۔</p>
<h2>یہ کیسے کام کرتے ہیں</h2>
<p>ACE انہیبیٹرز ایجنٹیوسن II کی تشکیل میں رکاوٹ ڈالتے ہیں، ایک مادہ جو خون کی نالیوں کو تنگ کرتا ہے، نالیوں کو آرام دینے اور چوڑا کرنے کی اجازت دیتا ہے۔</p>`,
    read_time_minutes: 5,
    is_published: 1,
    sort_order: 1
  },
  {
    category_id: 2,
    slug: 'antibiotic-resistance',
    title_en: 'Antibiotic Resistance: What You Need to Know',
    title_ur: 'اینٹی بائیوٹک مزاحمت: آپ کو کیا معلوم ہونا ضروری ہے',
    summary_en: 'Understanding why antibiotics don\'t work for viral infections and how to prevent resistance.',
    summary_ur: 'یہ سمجھنا کہ اینٹی بائیوٹکس وائرل انفیکشنز کے لیے کیوں کام نہیں کرتے اور مزاحمت کو کیسے روکا جائے۔',
    content_en: '<h1>Antibiotic Resistance</h1><p>Antibiotics only treat bacterial infections, not viral ones like colds or flu...</p>',
    content_ur: '<h1>اینٹی بائیوٹک مزاحمت</h1><p>اینٹی بائیوٹکس صرف بیکٹیریا کے انفیکشن کا علاج کرتے ہیں، وائرسز جیسے سردی یا فلو نہیں...</p>',
    read_time_minutes: 7,
    is_published: 1,
    sort_order: 2
  }
];

export type EducationCategory = typeof SAMPLE_CATEGORIES[number];
export type EducationContent = typeof SAMPLE_CONTENT[number];
