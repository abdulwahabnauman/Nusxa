/**
 * with-next-dose-widget — Expo config plugin that adds the Android
 * home-screen widget ("Next dose" + one-tap Taken) to the prebuilt app.
 *
 * Canonical widget sources live in plugins/widget-files/ so a fresh
 * `expo prebuild --clean` regenerates everything:
 *   - NextDoseWidgetProvider.kt  → app/src/main/java/com/nusxa/app/
 *     (also declares NextDoseCompactWidgetProvider for the small variant)
 *   - widget_next_dose.xml, widget_next_dose_compact.xml, widget_dot.xml
 *                                → app/src/main/res/layout/
 *   - widget_fade_in.xml, widget_fade_out.xml → app/src/main/res/anim/
 *   - widget_next_dose_info.xml, widget_next_dose_compact_info.xml
 *                                → app/src/main/res/xml/
 *   - widget_strings.xml         → app/src/main/res/values/
 *   - widget_background.xml, widget_button.xml, widget_dot_filled.xml,
 *     widget_dot_empty.xml       → app/src/main/res/drawable/
 * It registers both AppWidgetProvider receivers in AndroidManifest.xml
 * (users can pick either size) and injects onResume/onStop refresh hooks
 * into MainActivity so the widgets track doses taken inside the app.
 *
 * Registered in app.json → plugins. Runs during `expo prebuild`.
 */
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, 'widget-files');

const RESUMES_MARKER = 'NextDoseWidgetProvider.refreshAll';

const ON_RESUME_BLOCK = `
  /**
   * Refresh the next-dose home-screen widget whenever the app resumes, so
   * doses taken/skipped inside the app show up on the widget immediately.
   */
  override fun onResume() {
    super.onResume()
    NextDoseWidgetProvider.refreshAll(this)
  }

  /**
   * Also refresh when the app goes to the background: onResume alone only
   * catches the NEXT foregrounding, so a user who changes a schedule and
   * then presses Home would keep seeing the stale widget until they return.
   */
  override fun onStop() {
    super.onStop()
    NextDoseWidgetProvider.refreshAll(this)
  }
`;

module.exports = function withNextDoseWidget(config) {
  // Copy widget sources/resources + patch MainActivity.kt
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const mainRoot = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main');
      const javaDir = path.join(mainRoot, 'java', 'com', 'nusxa', 'app');
      const resRoot = path.join(mainRoot, 'res');

      fs.mkdirSync(javaDir, { recursive: true });
      fs.mkdirSync(path.join(resRoot, 'layout'), { recursive: true });
      fs.mkdirSync(path.join(resRoot, 'anim'), { recursive: true });
      fs.mkdirSync(path.join(resRoot, 'xml'), { recursive: true });
      fs.mkdirSync(path.join(resRoot, 'values'), { recursive: true });
      fs.mkdirSync(path.join(resRoot, 'drawable'), { recursive: true });

      const copies = [
        ['NextDoseWidgetProvider.kt', path.join(javaDir, 'NextDoseWidgetProvider.kt')],
        ['widget_next_dose.xml', path.join(resRoot, 'layout', 'widget_next_dose.xml')],
        ['widget_next_dose_compact.xml', path.join(resRoot, 'layout', 'widget_next_dose_compact.xml')],
        ['widget_dot.xml', path.join(resRoot, 'layout', 'widget_dot.xml')],
        ['widget_fade_in.xml', path.join(resRoot, 'anim', 'widget_fade_in.xml')],
        ['widget_fade_out.xml', path.join(resRoot, 'anim', 'widget_fade_out.xml')],
        ['widget_next_dose_info.xml', path.join(resRoot, 'xml', 'widget_next_dose_info.xml')],
        ['widget_next_dose_compact_info.xml', path.join(resRoot, 'xml', 'widget_next_dose_compact_info.xml')],
        ['widget_strings.xml', path.join(resRoot, 'values', 'widget_strings.xml')],
        ['widget_background.xml', path.join(resRoot, 'drawable', 'widget_background.xml')],
        ['widget_button.xml', path.join(resRoot, 'drawable', 'widget_button.xml')],
        ['widget_dot_filled.xml', path.join(resRoot, 'drawable', 'widget_dot_filled.xml')],
        ['widget_dot_empty.xml', path.join(resRoot, 'drawable', 'widget_dot_empty.xml')],
      ];
      for (const [src, dest] of copies) {
        fs.copyFileSync(path.join(SOURCE_DIR, src), dest);
      }

      // Idempotent MainActivity patch: refresh the widget on resume
      const activityPath = path.join(javaDir, 'MainActivity.kt');
      if (fs.existsSync(activityPath)) {
        let source = fs.readFileSync(activityPath, 'utf8');
        if (!source.includes(RESUMES_MARKER)) {
          const anchor = 'override fun getMainComponentName(): String = "main"';
          const anchorIndex = source.indexOf(anchor);
          if (anchorIndex !== -1) {
            const insertAt = anchorIndex + anchor.length;
            source = source.slice(0, insertAt) + '\n' + ON_RESUME_BLOCK + source.slice(insertAt);
            fs.writeFileSync(activityPath, source);
          }
        }
      }
      return cfg;
    },
  ]);

  // Register both widget receivers (standard + compact) on the
  // application element so users can place either size
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    app.receiver = app.receiver ?? [];

    const registerWidget = (name, metadataResource) => {
      const alreadyRegistered = app.receiver.some(
        (entry) => entry.$['android:name'] === name,
      );
      if (alreadyRegistered) return;
      app.receiver.push({
        $: {
          'android:name': name,
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
              { $: { 'android:name': 'android.intent.action.DATE_CHANGED' } },
              { $: { 'android:name': 'android.intent.action.TIME_SET' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': metadataResource,
            },
          },
        ],
      });
    };

    registerWidget('.NextDoseWidgetProvider', '@xml/widget_next_dose_info');
    registerWidget('.NextDoseCompactWidgetProvider', '@xml/widget_next_dose_compact_info');
    return cfg;
  });
};
