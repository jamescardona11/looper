const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules"),
];

const sherpaDownloadEntrypoint = path.join(
  workspaceRoot,
  "node_modules/react-native-sherpa-onnx/lib/module/download/index.js",
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react-native-sherpa-onnx/download") {
    return { filePath: sherpaDownloadEntrypoint, type: "sourceFile" };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
