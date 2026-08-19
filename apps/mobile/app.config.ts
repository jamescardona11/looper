import type { ConfigContext, ExpoConfig } from "expo/config";

const appGroup = "group.com.j11.looper.mobile";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Looper",
  slug: "looper",
  scheme: "looper",
  version: "0.1.0",
  icon: "./assets/app-icon.png",
  orientation: "portrait",
  ios: {
    bundleIdentifier: "com.j11.looper.mobile",
    appleTeamId: "9Y84AJHU4X",
    entitlements: {
      "com.apple.security.application-groups": [appGroup],
    },
    infoPlist: {
      NSMicrophoneUsageDescription:
        "Looper usa el micrófono para convertir tu voz en texto en el dispositivo.",
      NSSupportsLiveActivities: true,
    },
  },
  // El papel del logo, para que el icono adaptativo no recorte sobre blanco de
  // Expo. Ver packages/ts/config/src/palette.ts (BRAND_MARK).
  backgroundColor: "#f7f5f2",
  android: {
    package: "com.j11.looper.mobile",
    permissions: ["android.permission.RECORD_AUDIO", "android.permission.POST_NOTIFICATIONS"],
    adaptiveIcon: {
      foregroundImage: "./assets/app-icon.png",
      backgroundColor: "#f7f5f2",
    },
  },
  plugins: [
    "expo-router",
    [
      "expo-audio",
      {
        enableBackgroundRecording: true,
        microphonePermission:
          "Looper usa el micrófono para convertir tu voz en texto en el dispositivo.",
      },
    ],
    "expo-secure-store",
    [
      "@kesha-antonov/react-native-background-downloader",
      {
        // Sherpa ONNX already provides the MMKV runtime that persists downloads.
        skipMmkvDependency: true,
      },
    ],
    "@bacons/apple-targets",
    "./plugins/with-looper-keyboard",
  ],
  experiments: {
    typedRoutes: true,
  },
});
