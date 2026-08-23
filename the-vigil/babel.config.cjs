module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo auto-detects react-native-reanimated/worklets in
    // node_modules and adds the required plugin itself as of the SDK 54
    // era — no explicit reanimated or worklets plugin entry needed here.
    presets: ["babel-preset-expo"],
  };
};
