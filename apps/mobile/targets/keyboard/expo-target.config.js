/** @type {import("@bacons/apple-targets/app.plugin").ConfigFunction} */
module.exports = (config) => ({
  type: "keyboard",
  name: "LooperKeyboard",
  displayName: "Looper Keyboard",
  bundleIdentifier: ".keyboard",
  frameworks: ["UIKit", "AVFoundation"],
  deploymentTarget: "16.0",
  images: {
    LooperLogo: "./assets/LooperLogo.png",
  },
  entitlements: {
    "com.apple.security.application-groups":
      config.ios?.entitlements?.["com.apple.security.application-groups"] ?? [],
  },
});
