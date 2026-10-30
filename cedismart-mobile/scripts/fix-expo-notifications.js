/**
 * Workaround for Expo Go on Android:
 * Upstream expo-notifications attempts to require 'ExpoTopicSubscriptionModule' at top-level import,
 * which crashes Expo Go because TopicSubscriptionModule is not registered in Expo Go's Android client
 * (Expo issue #52175).
 *
 * This script safely patches TopicSubscriptionModule.android.js to use requireOptionalNativeModule
 * with a fallback dummy implementation so the app loads smoothly in Expo Go.
 */

const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(
  __dirname,
  '../node_modules/expo-notifications/build/TopicSubscriptionModule.android.js'
);

if (fs.existsSync(targetFile)) {
  const content = fs.readFileSync(targetFile, 'utf8');
  if (!content.includes('requireOptionalNativeModule')) {
    const patchedContent = `import { requireOptionalNativeModule } from 'expo';

const fallback = {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};

const nativeModule =
  requireOptionalNativeModule('ExpoTopicSubscriptionModule') ||
  requireOptionalNativeModule('ExpoTopicsSubscriptionModule');

export default nativeModule || fallback;
`;
    fs.writeFileSync(targetFile, patchedContent, 'utf8');
    console.log('✅ [fix-expo-notifications] Patched TopicSubscriptionModule.android.js for Expo Go.');
  }
}
