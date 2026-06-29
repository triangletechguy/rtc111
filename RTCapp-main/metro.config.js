const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.watchFolders = [path.resolve(__dirname, 'packages')];

config.resolver.blockList = [
  new RegExp(`${path.resolve(__dirname, 'server').replace(/\\/g, '\\\\')}.*`),
];

module.exports = config;
