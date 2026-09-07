/**
 * with-today-shortcut — Expo config plugin that adds a static Android app
 * shortcut ("Today's doses") to the launcher long-press menu.
 *
 * The shortcut deep-links into the app via the `nusxa://` scheme, which
 * expo-router resolves to the Home tab — i.e. today's schedule with the
 * next-dose hero card and the dose timeline.
 *
 * Registered in app.json → plugins. Runs during `expo prebuild`.
 */
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SHORTCUTS_XML = `<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
    android:shortcutId="todays-schedule"
    android:enabled="true"
    android:icon="@drawable/notification_icon"
    android:shortcutShortLabel="@string/shortcut_today_short"
    android:shortcutLongLabel="@string/shortcut_today_long">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="com.nusxa.app"
      android:targetClass="com.nusxa.app.MainActivity"
      android:data="nusxa://" />
  </shortcut>
</shortcuts>
`;

const STRINGS_XML = `<resources>
  <string name="shortcut_today_short">Today\\'s doses</string>
  <string name="shortcut_today_long">Open today\\'s medication schedule</string>
</resources>
`;

module.exports = function withTodayShortcut(config) {
  // Write the shortcut XML + label strings into the generated res folder
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resRoot = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      fs.mkdirSync(path.join(resRoot, 'xml'), { recursive: true });
      fs.mkdirSync(path.join(resRoot, 'values'), { recursive: true });
      fs.writeFileSync(path.join(resRoot, 'xml', 'shortcuts.xml'), SHORTCUTS_XML);
      fs.writeFileSync(path.join(resRoot, 'values', 'shortcut_strings.xml'), STRINGS_XML);
      return cfg;
    },
  ]);

  // Register the shortcuts resource on the application element
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    app['meta-data'] = app['meta-data'] ?? [];
    const alreadyRegistered = app['meta-data'].some(
      (entry) => entry.$['android:name'] === 'android.app.shortcuts',
    );
    if (!alreadyRegistered) {
      app['meta-data'].push({
        $: {
          'android:name': 'android.app.shortcuts',
          'android:resource': '@xml/shortcuts',
        },
      });
    }
    return cfg;
  });
};
