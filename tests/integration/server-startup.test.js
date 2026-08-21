'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function loadServerModule() {
  return require(path.join(PROJECT_ROOT, 'server.js'));
}

async function closeServer(server) {
  if (!server.listening) return;
  server.close();
  await once(server, 'close');
}

async function requestApp(app, pathname, options) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const { port } = server.address();
    return await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  } finally {
    await closeServer(server);
  }
}

test('import server tidak membuka listener, query database, atau memuat ML native', () => {
  const script = String.raw`
    const Module = require('node:module');
    const net = require('node:net');
    const originalLoad = Module._load;

    net.Server.prototype.listen = function forbiddenListen() {
      throw new Error('listener dibuka saat import');
    };

    Module._load = function guardedLoad(request) {
      if (request === './ml/predict' || request === '@tensorflow/tfjs-node') {
        throw new Error('ML dimuat saat import');
      }
      if (request === 'mysql2/promise') {
        return {
          createPool() {
            return {
              query() {
                throw new Error('database di-query saat import');
              },
            };
          },
        };
      }
      return originalLoad.apply(this, arguments);
    };

    const loaded = require('./server.js');
    if (!loaded.app || !loaded.startServer || !loaded.initDb) {
      throw new Error('export startup tidak lengkap');
    }
    console.log('import-ok');
  `;

  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: 5_000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /import-ok/);
});

test('startServer tetap membuka HTTP server ketika inisialisasi ML gagal', async () => {
  const { startServer } = loadServerModule();
  const errors = [];
  const logger = {
    log() {},
    error(...args) { errors.push(args.join(' ')); },
  };

  const server = await startServer({
    port: 0,
    initializeDatabase: async () => {},
    initializeMl: async () => { throw new Error('ML unavailable'); },
    logger,
  });

  try {
    assert.equal(server.listening, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /ML unavailable/);
  } finally {
    await closeServer(server);
  }
});

test('liveness tetap sukses tanpa membaca database', async () => {
  const { app } = loadServerModule();
  const originalPool = app.locals.dbPool;
  let queries = 0;
  app.locals.dbPool = {
    query: async () => {
      queries += 1;
      throw new Error('database tidak boleh dibaca oleh liveness');
    },
  };

  try {
    const response = await requestApp(app, '/api/health');
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, 'VR-GeoNusa server running');
    assert.equal(body.status, 'live');
    assert.equal(body.db, undefined);
    assert.equal(body.scenes, undefined);
    assert.equal(queries, 0);
  } finally {
    app.locals.dbPool = originalPool;
  }
});

test('database readiness terpisah dan gagal terkontrol', async () => {
  const { app } = loadServerModule();
  const originalPool = app.locals.dbPool;
  app.locals.dbPool = {
    query: async () => { throw new Error('database unavailable'); },
  };

  try {
    const response = await requestApp(app, '/api/health/readiness/database');
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(body, {
      success: false,
      status: 'unavailable',
      component: 'database',
      timestamp: body.timestamp,
    });
    assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    app.locals.dbPool = originalPool;
  }
});

test('prediction mengembalikan JSON 503 stabil ketika ML belum siap', async () => {
  const { app } = loadServerModule();
  const originalLogger = app.locals.logger;
  app.locals.logger = { log() {}, error() {} };

  try {
    const response = await requestApp(app, '/api/ml/predict/borobudur/missing-node', {
      method: 'POST',
    });
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.deepEqual(body, {
      success: false,
      message: 'Layanan prediksi ML belum siap',
    });
  } finally {
    app.locals.logger = originalLogger;
  }
});
