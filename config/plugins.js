module.exports = ({ env }) => ({
  transformer: {
    enabled: true,
    config: {
      prefix: "/",
      responseTransforms: {
        removeAttributesKey: true,
        removeDataKey: true,
      },
    },
  },
});
