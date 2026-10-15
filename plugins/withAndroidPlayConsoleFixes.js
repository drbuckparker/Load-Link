const {
  AndroidConfig,
  withAndroidManifest,
  withAndroidStyles,
} = require('expo/config-plugins');

// Theme items that call the Android 15 deprecated system-bar color APIs.
// The splash plugin copies splash.backgroundColor onto androidStatusBar, which
// then writes android:statusBarColor. Edge-to-edge draws behind the bars instead.
const DEPRECATED_SYSTEM_BAR_STYLE_ITEMS = new Set([
  'android:statusBarColor',
  'android:navigationBarColor',
  'android:navigationBarDividerColor',
  'android:windowTranslucentStatus',
  'android:windowTranslucentNavigation',
]);

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function withResizableAndroidActivities(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    application.$['android:resizeableActivity'] = 'true';
    delete application.$['android:maxAspectRatio'];
    delete application.$['android:minAspectRatio'];

    for (const activity of asArray(application.activity)) {
      if (!activity.$) continue;
      // Root orientation stays portrait for iOS. Android 16 ignores that lock on
      // large screens and Play Console warns about it, so leave the activity unlocked.
      activity.$['android:resizeableActivity'] = 'true';
      delete activity.$['android:screenOrientation'];
      delete activity.$['android:maxAspectRatio'];
      delete activity.$['android:minAspectRatio'];
    }

    return config;
  });
}

function withEdgeToEdgeSystemBars(config) {
  return withAndroidStyles(config, (config) => {
    const styles = config.modResults?.resources?.style ?? [];
    for (const style of styles) {
      if (!Array.isArray(style.item)) continue;
      style.item = style.item.filter(
        (item) => !DEPRECATED_SYSTEM_BAR_STYLE_ITEMS.has(item?.$?.name),
      );
    }
    return config;
  });
}

function withAndroidPlayConsoleFixes(config) {
  config = withResizableAndroidActivities(config);
  config = withEdgeToEdgeSystemBars(config);
  return config;
}

module.exports = withAndroidPlayConsoleFixes;
