const os = require('node:os');

try {
  os.userInfo();
} catch {
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || 'vr-geonusa',
    homedir: process.env.USERPROFILE || process.cwd(),
    shell: null,
  });
}

process.argv.splice(2, 0, 'generate');
require('../node_modules/drizzle-kit/bin.cjs');
