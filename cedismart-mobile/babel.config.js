module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'nativewind/babel',
      // babel-preset-expo automatically configures the Worklets plugin for Reanimated.
    ],
  };
};
