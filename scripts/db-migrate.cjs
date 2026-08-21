require('esbuild-register/dist/node').register({ target: 'node22' });

require('../src/db/migrate').main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Migration gagal');
  process.exitCode = 1;
});
