/** @type {import("@bacons/apple-targets/app.plugin").ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "LooperWidgets",
  displayName: "Looper",
  bundleIdentifier: ".widgets",
  deploymentTarget: "16.2",
  colors: {
    $accent: "#8f9cff",
    $widgetBackground: "#101116",
  },
  entitlements: {
    "com.apple.security.application-groups":
      config.ios?.entitlements?.["com.apple.security.application-groups"] ?? [],
  },
});
