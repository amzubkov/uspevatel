module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Replace import.meta.env with process.env for web compatibility
      function () {
        return {
          visitor: {
            MetaProperty(path) {
              // import.meta.env.X → process.env.X
              if (
                path.node.meta.name === 'import' &&
                path.node.property.name === 'meta'
              ) {
                const parent = path.parentPath;
                if (
                  parent.isMemberExpression() &&
                  parent.node.property.name === 'env'
                ) {
                  parent.replaceWithSourceString('process.env');
                } else {
                  // import.meta → { env: process.env }
                  path.replaceWithSourceString('({ env: process.env })');
                }
              }
            },
          },
        };
      },
      'react-native-reanimated/plugin',
    ],
  };
};
