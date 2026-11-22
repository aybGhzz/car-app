// Adds build details to app.json's config, for Settings > About. EAS sets EAS_BUILD_GIT_COMMIT_HASH on its build servers.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    commit: (process.env.EAS_BUILD_GIT_COMMIT_HASH || '').slice(0, 7), // empty outside EAS
    builtAt: new Date().toISOString(),
  },
});
