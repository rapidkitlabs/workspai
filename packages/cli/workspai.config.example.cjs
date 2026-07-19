/**
 * Directory configuration for the legacy `npx workspai <workspace-name>`
 * creation shorthand. Canonical `create workspace` and `create project` flows
 * do not consume every field; prefer their explicit flags for automation.
 *
 * Supported names: workspai.config.cjs, workspai.config.mjs, or a .js file whose
 * syntax matches the containing package type. rapidkit.config.* is legacy only.
 */
module.exports = {
  workspace: {
    defaultAuthor: 'Your Name or Team',
    // Optional version pin. Python 3.10 is the minimum supported version.
    // Omit this setting to let Workspai detect and select an installed version.
    // pythonVersion: '3.10',
    installMethod: 'poetry',
  },
  projects: {
    defaultKit: 'fastapi.standard',
    skipGit: false,
  },
};

// Directory config precedence for the legacy shorthand:
// CLI flags > workspai.config.* > ~/.workspairc.json > legacy config > defaults
//
// Reserved fields addDefaultModules and skipInstall are not automatically
// applied by canonical project creation. Use explicit create-project flags.
