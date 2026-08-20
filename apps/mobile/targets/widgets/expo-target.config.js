/** @type {import("@bacons/apple-targets/app.plugin").ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "LooperWidgets",
  displayName: "Looper",
  bundleIdentifier: ".widgets",
  deploymentTarget: "16.2",
  colors: {
    $accent: "#626bd5",
    $widgetBackground: "#000000",
  },
  entitlements: {
    "com.apple.security.application-groups":
      config.ios?.entitlements?.["com.apple.security.application-groups"] ?? [],
  },
});
