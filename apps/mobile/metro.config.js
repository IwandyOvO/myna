// Sentry's wrapper around Expo's default Metro config: adds debug IDs so production stack traces
// can be matched to source maps. Expo's monorepo (workspaces) support is unchanged.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
