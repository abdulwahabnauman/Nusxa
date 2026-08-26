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

/** Seed row shapes (shared by initial and incremental library migrations) */
export interface EducationCategorySeed {
  slug: string;
  title_en: string;
  title_ur: string;
  description_en?: string;
  description_ur?: string;
  icon_name: string;
  color: string;
  sort_order: number;
}

export interface EducationContentSeed {
  category_id: number; // references sort_order, resolved to real id at seed time
  slug: string;
  title_en: string;
  title_ur: string;
  summary_en?: string;
  summary_ur?: string;
  content_en?: string;
  content_ur?: string;
  read_time_minutes: number;
  is_published: number;
  sort_order: number;
}

/** Extra categories added by the library expansion migration (v8) */
export const ADDITIONAL_CATEGORIES: EducationCategorySeed[] = [
  {
    slug: 'medication-safety',
    title_en: 'Medication Safety',
    title_ur: 'ادویات کی حفاظت',
    description_en: 'Habits and practices that make taking medicines safer',
    description_ur: 'ادویات کو محفوظ طریقے سے استعمال کرنے کی عادات اور طریقے',
    icon_name: 'shield-star',
    color: '#4F46E5',
    sort_order: 5,
  },
];

/** Extra articles added by the library expansion migration (v8) */
export const ADDITIONAL_CONTENT: EducationContentSeed[] = [
  {
    category_id: 1,
    slug: 'beta-blockers-basics',
    title_en: 'Beta Blockers: The Basics',
    title_ur: 'بیٹا بلاکرز: بنیادی باتیں',
    summary_en: 'How beta blockers slow the heart and protect it, and why they must never be stopped suddenly.',
    summary_ur: 'بیٹا بلاکرز دل کی دھڑکن کو کیسے کنٹرول کرتے ہیں اور انہیں اچانک کیوں نہیں چھوڑنا چاہیے۔',
    content_en: `<h1>Beta Blockers</h1>
<p>Beta blockers reduce the workload on the heart by blocking adrenaline, which slows the heart rate and lowers blood pressure.</p>
<h2>What to Expect</h2>
<ul>
<li>Slower, steadier heartbeat</li>
<li>Possible tiredness in the first weeks</li>
<li>Cold hands or feet in some people</li>
</ul>
<h2>Important Safety Note</h2>
<p>Never stop a beta blocker suddenly — doing so can cause a dangerous rebound in heart rate and blood pressure. Your doctor will reduce the dose gradually if it needs to be stopped.</p>`,
    content_ur: `<h1>بیٹا بلاکرز</h1>
<p>بیٹا بلاکرز ایڈرینالین کے اثر کو روک کر دل کی دھڑکن اور بلڈ پریشر کم کرتے ہیں۔</p>
<p>انہیں کبھی اچانک بند نہ کریں — ایسا کرنا دل کی دھڑکن کو خطرناک حد تک بڑھا سکتا ہے۔ ڈاکٹر کے مشورے سے خوراک آہستہ آہستہ کم کی جاتی ہے۔</p>`,
    read_time_minutes: 4,
    is_published: 1,
    sort_order: 3,
  },
  {
    category_id: 1,
    slug: 'bp-lifestyle-tips',
    title_en: '10 Daily Habits That Help Your BP Medicine Work',
    title_ur: 'بلڈ پریشر کی دوا کو مؤثر بنانے والی 10 روزانہ عادات',
    summary_en: 'Simple lifestyle habits that make blood pressure medication more effective.',
    summary_ur: 'سادہ روزانہ عادات جو بلڈ پریشر کی دوا کو زیادہ مؤثر بناتی ہیں۔',
    content_en: `<h1>Helping Your Medicine Work</h1>
<p>Medication works best alongside healthy habits:</p>
<ul>
<li>Limit added salt (pickles, packaged snacks)</li>
<li>Walk 30 minutes most days</li>
<li>Sleep 7–8 hours</li>
<li>Take your tablet at the same time daily</li>
<li>Check your BP weekly and note it down</li>
</ul>
<p>These habits can meaningfully lower the dose you need — but never change your dose yourself.</p>`,
    content_ur: `<h1>دوا کو مؤثر بنائیں</h1>
<p>نمک کم کریں، روزانہ 30 منٹ پیدل چلیں، 7–8 گھنٹے سوئیں اور دوا روزانہ ایک ہی وقت پر لیں۔ ہفتہ وار بلڈ پریشر نوٹ کریں۔</p>`,
    read_time_minutes: 3,
    is_published: 1,
    sort_order: 4,
  },
  {
    category_id: 2,
    slug: 'finish-your-antibiotics',
    title_en: 'Why You Must Finish the Full Antibiotic Course',
    title_ur: 'اینٹی بائیوٹک کا مکمل کورس کیوں ضروری ہے',
    summary_en: 'Stopping early feels fine but breeds resistant bacteria. Here is why the full course matters.',
    summary_ur: 'کورس ادھورا چھوڑنے سے جراثیم مضبوط ہو جاتے ہیں، مکمل کورس کیوں ضروری ہے جانیں۔',
    content_en: `<h1>The Full Course Matters</h1>
<p>When you feel better, the weakest bacteria are already gone — the strongest remain. Stopping early leaves those strong bacteria alive to multiply and share resistance.</p>
<h2>Key Rules</h2>
<ul>
<li>Take the exact dose at the exact times</li>
<li>Finish every tablet even if you feel well</li>
<li>Never save leftovers for next time</li>
<li>Never share antibiotics with anyone</li>
</ul>`,
    content_ur: `<h1>مکمل کورس ضروری ہے</h1>
<p>بہتری محسوس ہونے پر بھی کورس مکمل کریں۔ ادھورا کورس مضبوط جراثیم کو زندہ رکھتا ہے جو مزاحمت پیدا کرتے ہیں۔ بچی ہوئی دوائیں محفوظ نہ کریں۔</p>`,
    read_time_minutes: 4,
    is_published: 1,
    sort_order: 3,
  },
  {
    category_id: 2,
    slug: 'antibiotics-side-effects',
    title_en: 'Antibiotic Side Effects: Normal vs Warning Signs',
    title_ur: 'اینٹی بائیوٹکس کے اثرات: معمول اور خطرے کی علامات',
    summary_en: 'Which side effects are harmless, and which mean stop and seek help immediately.',
    summary_ur: 'کون سے اثرات معمولی ہیں اور کون سی علامات پر فوراً ڈاکٹر سے رجوع کرنا چاہیے۔',
    content_en: `<h1>What Is Normal</h1>
<ul>
<li>Mild stomach upset or loose stools</li>
<li>Metallic taste (some antibiotics)</li>
</ul>
<h2>Stop and Seek Help</h2>
<ul>
<li>Rash, hives or facial swelling</li>
<li>Difficulty breathing</li>
<li>Severe or bloody diarrhoea</li>
</ul>
<p>Taking antibiotics with food (where allowed) and completing the course reduces most mild effects.</p>`,
    content_ur: `<h1>معمولی اثرات</h1>
<p>ہلکی معدے کی خرابی معمول ہے۔ لیکن جلد پر دانے، سانس کی تکلیف یا شدید دست پر فوراً ڈاکٹر سے رجوع کریں۔</p>`,
    read_time_minutes: 3,
    is_published: 1,
    sort_order: 4,
  },
  {
    category_id: 3,
    slug: 'paracetamol-safety',
    title_en: 'Paracetamol Safety: The Hidden Overdose Risk',
    title_ur: 'پیراسیٹامول کی حفاظت: چھپا ہوا اوور ڈوز خطرہ',
    summary_en: 'Paracetamol is in many cold and flu combos — doubling up can damage the liver.',
    summary_ur: 'پیراسیٹامول بہت سی زکام کی ادویات میں موجود ہے — زیادہ مقدار جگر کو نقصان پہنچا سکتی ہے۔',
    content_en: `<h1>Why It Is Risky Without Anyone Knowing</h1>
<p>Paracetamol is safe at the prescribed dose, but it also hides in many cough, cold and flu combination products. Taking both can silently exceed the safe daily limit.</p>
<h2>Safety Rules</h2>
<ul>
<li>Read every label for paracetamol / acetaminophen</li>
<li>Respect the minimum gap between doses</li>
<li>Never exceed the daily maximum on the label</li>
<li>Avoid alcohol while taking it regularly</li>
</ul>`,
    content_ur: `<h1>احتیاط ضروری ہے</h1>
<p>پیراسیٹامول زکام و فلو کی کئی ادویات میں شامل ہوتا ہے۔ ایک ساتھ کئی دوائیں لینے سے محفوظ حد تجاوز ہو سکتی ہے۔ لیبل ضرور پڑھیں۔</p>`,
    read_time_minutes: 4,
    is_published: 1,
    sort_order: 3,
  },
  {
    category_id: 3,
    slug: 'nsaids-and-stomach',
    title_en: 'Painkillers Like Ibuprofen: Protecting Your Stomach',
    title_ur: 'آئیبوپروفین جیسی درد کی دوائیں: معدے کی حفاظت',
    summary_en: 'NSAIDs can irritate the stomach lining — learn how to take them safely.',
    summary_ur: 'NSAIDs معدے کو خراب کر سکتی ہیں — انہیں محفوظ طریقے سے لینے کے طریقے جانیں۔',
    content_en: `<h1>NSAIDs and Your Stomach</h1>
<p>Non-steroidal anti-inflammatories (like ibuprofen) reduce pain and swelling but can irritate the stomach lining, especially with long use.</p>
<h2>Protection Tips</h2>
<ul>
<li>Always take after food</li>
<li>Use the lowest effective dose</li>
<li>Tell your doctor if you have ulcer history</li>
<li>Watch for black stools or burning pain — report them</li>
</ul>`,
    content_ur: `<h1>معدے کی حفاظت</h1>
<p>یہ دوائیں ہمیشہ کھانے کے بعد لیں، کم سے کم مؤثر خوراک استعمال کریں اور پرانے السر کی صورت میں ڈاکٹر کو بتائیں۔</p>`,
    read_time_minutes: 4,
    is_published: 1,
    sort_order: 4,
  },
  {
    category_id: 4,
    slug: 'vitamin-d-essentials',
    title_en: 'Vitamin D: Who Actually Needs a Supplement?',
    title_ur: 'ویتامن ڈی: کن لوگوں کو سپلیمنٹ کی ضرورت ہے؟',
    summary_en: 'Sunlight, food sources, and the groups most likely to be deficient.',
    summary_ur: 'دھوپ، غذا اور کن لوگوں میں ویتامن ڈی کی کمی زیادہ ہوتی ہے۔',
    content_en: `<h1>Vitamin D Basics</h1>
<p>Vitamin D supports bones, muscles and immunity. The body makes it from sunlight, but indoor lifestyles and covering clothing reduce production.</p>
<h2>Commonly Deficient</h2>
<ul>
<li>People with little sun exposure</li>
<li>Older adults</li>
<li>People with darker skin in low-sun regions</li>
</ul>
<p>A simple blood test confirms deficiency; supplement only at the dose advised, since excess vitamin D also causes harm.</p>`,
    content_ur: `<h1>ویتامن ڈی</h1>
<p>ویتامن ڈی ہڈیوں اور قوتِ مدافعت کے لیے ضروری ہے۔ دھوپ کم لینے والوں اور بزرگوں میں کمی عام ہے۔ خون کے ٹیسٹ کے بعد ہی سپلیمنٹ لیں۔</p>`,
    read_time_minutes: 3,
    is_published: 1,
    sort_order: 3,
  },
  {
    category_id: 4,
    slug: 'iron-supplements-guide',
    title_en: 'Iron Supplements: Getting the Absorption Right',
    title_ur: 'آئرن سپلیمنٹس: صحیح جذب کے طریقے',
    summary_en: 'Tea, coffee and dairy block iron absorption — timing matters more than the brand.',
    summary_ur: 'چائے، کافی اور دودھ آئرن کے جذب کو روکتے ہیں — وقت کا انتخاب برانڈ سے زیادہ اہم ہے۔',
    content_en: `<h1>Making Iron Work</h1>
<p>Iron treats anaemia, but absorption is easily blocked. Timing is everything.</p>
<h2>Absorption Rules</h2>
<ul>
<li>Take on an empty stomach if tolerated</li>
<li>Vitamin C (orange juice) boosts absorption</li>
<li>Keep a 2-hour gap from tea, coffee and milk</li>
<li>Dark stools are a normal, harmless effect</li>
</ul>`,
    content_ur: `<h1>آئرن کا صحیح استعمال</h1>
<p>آئرن خالی پیٹ لیں اگر ممکن ہو، ساتھ وٹامن سی لیں اور چائے/دودھ سے دو گھنٹے کا وقفہ رکھیں۔ سیاہ پاخانہ معمولی اثر ہے۔</p>`,
    read_time_minutes: 4,
    is_published: 1,
    sort_order: 4,
  },
  {
    category_id: 5,
    slug: 'why-adherence-matters',
    title_en: 'Why Taking Medicines on Time Changes Outcomes',
    title_ur: 'ادویات وقت پر لینے سے نتائج کیسے بدلتے ہیں',
    summary_en: 'Steady medicine levels in the body are what make treatment work — and how reminders help.',
    summary_ur: 'جسم میں دوا کی مستقل سطح علاج کو مؤثر بناتی ہے — یاد دہانیوں کا کردار جانیں۔',
    content_en: `<h1>Steady Levels, Real Results</h1>
<p>Most medicines only work while their level in your blood stays in a target range. Missed doses create gaps; double doses create spikes. Both reduce safety and effect.</p>
<h2>Habits That Help</h2>
<ul>
<li>Link doses to daily habits (breakfast, brushing)</li>
<li>Use app reminders and a weekly pill box</li>
<li>Never double up after a missed dose unless told</li>
<li>Tell your doctor if a schedule is too hard to follow</li>
</ul>`,
    content_ur: `<h1>وقت پر دوا کی اہمیت</h1>
<p>دوا کی مستقل سطح ہی علاج کو مؤثر بناتی ہے۔ خوراک چھوٹنے پر وقفہ اور دوہری خوراک سے نقصان ہوتا ہے۔ یاد دہانی اور pill box استعمال کریں۔</p>`,
    read_time_minutes: 5,
    is_published: 1,
    sort_order: 1,
  },
  {
    category_id: 5,
    slug: 'safe-storage-of-medicines',
    title_en: 'Storing Medicines Safely at Home',
    title_ur: 'گھر میں ادویات کی محفوظ ذخیرہ اندوزی',
    summary_en: 'Heat, humidity and curious children — the three risks every household should fix.',
    summary_ur: 'گرمی، نمی اور بچوں کی رسائی — تین خطرات جنہیں ہر گھر کو ٹھیک کرنا چاہیے۔',
    content_en: `<h1>The Three Risks</h1>
<ul>
<li><strong>Heat & humidity:</strong> bathrooms and cars degrade medicines. Use a cool, dry cupboard.</li>
<li><strong>Children:</strong> store medicines up high, ideally in a locked box.</li>
<li><strong>Expiry:</strong> check dates every few months and dispose of expired tablets at a pharmacy, not the trash.</li>
</ul>
<p>Keep medicines in their original packaging so the name and expiry stay visible.</p>`,
    content_ur: `<h1>محفوظ ذخیرہ</h1>
<p>ادویات کو ٹھنڈی خشک جگہ، بچوں کی پہنچ سے دور اور اصل پیکٹ میں رکھیں۔ ایکسپائری کی تاریخیں چیک کرتے رہیں۔</p>`,
    read_time_minutes: 3,
    is_published: 1,
    sort_order: 2,
  },
];
