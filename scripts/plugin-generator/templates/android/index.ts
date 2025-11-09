import { content as buildGradle } from './build.gradle.js';
import { content as manifest } from './src/main/AndroidManifest.xml.js';
import { content as pluginKt } from './src/main/java/com/aide/browser/AideBrowserPlugin.kt.js';
import { content as activityKt } from './src/main/java/com/aide/browser/BrowserActivity.kt.js';
import { content as proguard } from './proguard-rules.pro.js';

export const androidFiles = {
  'android/build.gradle': buildGradle,
  'android/src/main/AndroidManifest.xml': manifest,
  'android/src/main/java/com/aide/browser/AideBrowserPlugin.kt': pluginKt,
  'android/src/main/java/com/aide/browser/BrowserActivity.kt': activityKt,
  'android/proguard-rules.pro': proguard,
};
