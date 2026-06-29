const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.watchFolders = [path.resolve(__dirname, 'packages')];

config.resolver.blockList = [
  new RegExp(`${path.resolve(__dirname, 'server').replace(/\\/g, '\\\\')}.*`),
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    if (moduleName === "react-native-agora") {
      return { filePath: path.resolve(__dirname, "stubs/react-native-agora.js"), type: "sourceFile" };
    }
    if (moduleName === "agora-rn-uikit") {
      return { filePath: path.resolve(__dirname, "stubs/agora-rn-uikit.js"), type: "sourceFile" };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;