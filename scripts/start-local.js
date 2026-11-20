'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const local = path.join(root, '.local');
const children = new Set();
let stopping = false;

function launch(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: 'inherit', ...options });
  children.add(child);
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.once('exit', (code) => {
    children.delete(child);
    if (!stopping) { console.error('A project service stopped. Run npm start to retry.'); stop(code || 1); }
  });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

function freePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(port)));
  });
}

async function waitFor(check, label) {
  for (let retry = 0; retry < 60 && !stopping; retry += 1) {
    try { if (await check()) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} could not start. Check the service output above.`);
}

function findMongo() {
  const candidates = [process.env.OEP_MONGOD, 'mongod'];
  if (process.platform === 'win32') {
    const versions = path.join(process.env.ProgramFiles || 'C:/Program Files', 'MongoDB', 'Server');
    if (fs.existsSync(versions)) {
      for (const version of fs.readdirSync(versions).sort().reverse()) {
        candidates.push(path.join(versions, version, 'bin', 'mongod.exe'));
      }
    }
  }
  const binary = candidates.filter(Boolean).find((candidate) =>
    spawnSync(candidate, ['--version'], { windowsHide: true, stdio: 'ignore' }).status === 0
  );
  if (!binary) throw new Error('MongoDB is required. Install MongoDB Community Server or set MONGO_URI to an existing database.');
  return binary;
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Use Node.js 22.12 or newer.');
  fs.mkdirSync(local, { recursive: true });

  // Install only when the lockfile changes or the installation is missing.
  for (const folder of ['server', 'client']) {
    const directory = path.join(root, folder);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, 'package-lock.json'))).digest('hex');
    const stamp = path.join(local, folder + '-dependencies');
    if (!fs.existsSync(path.join(directory, 'node_modules')) ||
        !fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== hash) {
      console.log(`Preparing ${folder} dependencies…`);
      const npm = process.env.npm_execpath;
      if (!npm) throw new Error('Run this project with npm start.');
      const result = spawnSync(process.execPath, [npm, 'ci', '--no-audit', '--no-fund'], {
        cwd: directory, windowsHide: true, stdio: 'inherit',
      });
      if (result.status !== 0) throw new Error(`${folder} dependency installation failed; check your connection and retry npm start.`);
      fs.writeFileSync(stamp, hash);
    }
  }

  const dotenv = require(path.join(root, 'server/node_modules/dotenv'));
  const envFile = path.join(root, 'server/.env');
  const configured = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
  const settings = { ...configured, ...process.env };
  const apiPort = Number(settings.PORT || 5000);
  const clientPort = Number(settings.OEP_CLIENT_PORT || 5173);
  await freePort(apiPort);
  await freePort(clientPort);

  const secretFile = path.join(local, 'jwt-secret');
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  const secret = settings.JWT_SECRET && !settings.JWT_SECRET.startsWith('replace-')
    ? settings.JWT_SECRET : fs.readFileSync(secretFile, 'utf8');

  let mongoUri = settings.MONGO_URI;
  if (!mongoUri) {
    const binary = findMongo();
    const dbPort = Number(settings.OEP_MONGO_PORT || 27018);
    await freePort(dbPort);
    // Keep database files outside OneDrive and preserve them between starts.
    const identity = crypto.createHash('sha256').update(root).digest('hex').slice(0, 12);
    const data = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local/share'), 'OnlineExamPortal', identity);
    fs.mkdirSync(data, { recursive: true });
    launch(binary, ['--dbpath', data, '--port', String(dbPort), '--bind_ip', '127.0.0.1',
      '--logpath', path.join(data, 'mongo.log'), '--logappend']);
    mongoUri = `mongodb://127.0.0.1:${dbPort}/oep`;
    await waitFor(() => new Promise((resolve) => {
      const socket = net.connect(dbPort, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    }), 'MongoDB');
  }
  if (stopping) return;
  const clientUrl = `http://localhost:${clientPort}`;
  const apiUrl = `http://localhost:${apiPort}/api`;
  launch(process.execPath, ['src/index.js'], {
    cwd: path.join(root, 'server'),
    env: { ...settings, PORT: String(apiPort), MONGO_URI: mongoUri, JWT_SECRET: secret, CLIENT_ORIGIN: clientUrl },
  });
  await waitFor(async () => (await fetch(apiUrl + '/ready', { signal: AbortSignal.timeout(2000) })).ok, 'API');
  if (stopping) return;
  launch(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(clientPort), '--strictPort'], {
    cwd: path.join(root, 'client'), env: { ...settings, VITE_API_BASE_URL: apiUrl },
  });
  await waitFor(async () => (await fetch(clientUrl, { signal: AbortSignal.timeout(2000) })).ok, 'Frontend');
  console.log(`\nOpen ${clientUrl}\nUse Create account to register a student. Press Ctrl+C to stop the project.\n`);
}

main().catch((error) => {
  console.error(error.code === 'EADDRINUSE'
    ? 'A project port is already in use. Stop the other instance, then run npm start again.'
    : error.message);
  stop(1);
});
