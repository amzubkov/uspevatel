const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix "import.meta" for zustand on web
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

// Support GIF assets
config.resolver.assetExts = [...(config.resolver.assetExts || []), 'gif'];

module.exports = config;
