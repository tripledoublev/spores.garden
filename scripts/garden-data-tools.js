import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const XRPC_CREATE_SESSION = 'com.atproto.server.createSession';
const XRPC_LIST_RECORDS = 'com.atproto.repo.listRecords';
const XRPC_PUT_RECORD = 'com.atproto.repo.putRecord';
const XRPC_DELETE_RECORD = 'com.atproto.repo.deleteRecord';

const COLLECTIONS = [
  'garden.spores.site.config',
  'garden.spores.site.layout',
  'garden.spores.site.section',
  'garden.spores.site.profile',
  'garden.spores.content.text',
  'garden.spores.content.image',
  'garden.spores.social.flower',
  'garden.spores.social.takenFlower',
  'garden.spores.item.specialSpore',
  'coop.hypha.spores.site.config',
  'coop.hypha.spores.site.layout',
  'coop.hypha.spores.site.section',
  'coop.hypha.spores.site.profile',
  'coop.hypha.spores.content.text',
  'coop.hypha.spores.content.image',
  'coop.hypha.spores.social.flower',
  'coop.hypha.spores.social.takenFlower',
  'coop.hypha.spores.item.specialSpore',
];

const MAX_PAGES = 500;

function usage() {
  console.log(`Usage:
  node scripts/garden-data-tools.js backup [--out <file>]
  node scripts/garden-data-tools.js reset [--dry-run] [--yes]
  node scripts/garden-data-tools.js restore --from <file> [--dry-run]

Required env (for all commands):
  ATPROTO_IDENTIFIER
  ATPROTO_APP_PASSWORD

Optional env:
  ATPROTO_AUTH_SERVICE (default: https://bsky.social)
  ATPROTO_PDS_URL      (override resolved PDS)
  ATPROTO_REPO_DID     (defaults to authenticated DID)

Examples:
  node scripts/garden-data-tools.js backup
  node scripts/garden-data-tools.js reset --dry-run
  node scripts/garden-data-tools.js reset --yes
  node scripts/garden-data-tools.js restore --from backups/spores-garden-backup-2026-02-16.json
`);
}

function normalizeServiceUrl(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = new Map();
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith('--')) {
      flags.set(key, true);
    } else {
      flags.set(key, next);
      i += 1;
    }
  }
  return { command, flags };
}

function didWebToDidDocumentUrl(did) {
  const withoutPrefix = did.slice('did:web:'.length);
  const parts = withoutPrefix.split(':');
  const host = parts.shift();
  const pathParts = parts.map(decodeURIComponent);
  const pathSuffix = pathParts.length ? `/${pathParts.join('/')}` : '';
  return `https://${host}${pathSuffix}/did.json`;
}

async function jsonRequest(url, method, body, accessJwt) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessJwt ? { Authorization: `Bearer ${accessJwt}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${url} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function xrpcPost(serviceUrl, method, body, accessJwt) {
  return jsonRequest(`${normalizeServiceUrl(serviceUrl)}/xrpc/${method}`, 'POST', body, accessJwt);
}

async function xrpcGet(serviceUrl, method, query, accessJwt) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const url = `${normalizeServiceUrl(serviceUrl)}/xrpc/${method}?${params.toString()}`;
  return jsonRequest(url, 'GET', undefined, accessJwt);
}

async function authenticate() {
  const authService = process.env.ATPROTO_AUTH_SERVICE || 'https://bsky.social';
  const identifier = process.env.ATPROTO_IDENTIFIER;
  const password = process.env.ATPROTO_APP_PASSWORD;
  if (!identifier || !password) {
    throw new Error('Missing ATPROTO_IDENTIFIER or ATPROTO_APP_PASSWORD');
  }
  const session = await xrpcPost(authService, XRPC_CREATE_SESSION, { identifier, password });
  if (!session?.accessJwt || !session?.did) {
    throw new Error('Invalid session response (missing accessJwt or did)');
  }
  return { accessJwt: session.accessJwt, did: session.did };
}

async function resolvePdsFromDid(did) {
  const didDocUrl = did.startsWith('did:plc:')
    ? `https://plc.directory/${did}`
    : did.startsWith('did:web:')
      ? didWebToDidDocumentUrl(did)
      : null;

  if (!didDocUrl) {
    throw new Error(`Unsupported DID method for PDS resolution: ${did}`);
  }

  const didDoc = await jsonRequest(didDocUrl, 'GET');
  const services = Array.isArray(didDoc?.service) ? didDoc.service : [];
  const pds = services.find((s) => s?.type === 'AtprotoPersonalDataServer') || services[0];
  if (!pds?.serviceEndpoint || typeof pds.serviceEndpoint !== 'string') {
    throw new Error(`No PDS endpoint found in DID document for ${did}`);
  }
  return pds.serviceEndpoint;
}

async function buildContext() {
  const { accessJwt, did: authDid } = await authenticate();
  const repoDid = process.env.ATPROTO_REPO_DID || authDid;
  const pdsUrl = process.env.ATPROTO_PDS_URL || await resolvePdsFromDid(repoDid);
  return { accessJwt, authDid, repoDid, pdsUrl };
}

function backupFilename(repoDid) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `spores-garden-backup-${repoDid}-${ts}.json`;
}

async function listAllRecords(ctx, collection) {
  const all = [];
  const seen = new Set();
  let cursor = undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await xrpcGet(ctx.pdsUrl, XRPC_LIST_RECORDS, {
      repo: ctx.repoDid,
      collection,
      limit: 100,
      cursor,
    }, ctx.accessJwt).catch((error) => {
      const msg = String(error?.message || error);
      if (msg.includes('Could not locate record') || msg.includes('RepoNotFound') || msg.includes('InvalidRequest')) {
        return { records: [] };
      }
      throw error;
    });

    const records = response?.records || [];
    all.push(...records);
    const next = response?.cursor;
    if (!next) break;
    if (next === cursor || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }
  return all;
}

async function collectGardenRecords(ctx) {
  const byCollection = {};
  let total = 0;
  for (const collection of COLLECTIONS) {
    const records = await listAllRecords(ctx, collection);
    byCollection[collection] = records;
    total += records.length;
    console.log(`  ${collection}: ${records.length}`);
  }
  return { byCollection, total };
}

async function backupCommand(ctx, flags) {
  const { byCollection, total } = await collectGardenRecords(ctx);
  const outArg = flags.get('out');
  const outFile = outArg
    ? path.resolve(process.cwd(), String(outArg))
    : path.join(rootDir, 'backups', backupFilename(ctx.repoDid));

  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const backup = {
    version: 1,
    generatedAt: new Date().toISOString(),
    repoDid: ctx.repoDid,
    collections: byCollection,
    totalRecords: total,
  };

  fs.writeFileSync(outFile, JSON.stringify(backup, null, 2));
  console.log(`\nBackup complete: ${outFile}`);
  console.log(`Total records: ${total}`);
}

function extractRkey(uri) {
  const parts = String(uri || '').split('/');
  return parts.length >= 5 ? parts[4] : null;
}

async function resetCommand(ctx, flags) {
  const dryRun = !!flags.get('dry-run');
  const yes = !!flags.get('yes');

  if (!dryRun && !yes) {
    throw new Error('Refusing destructive reset without --yes (or use --dry-run first).');
  }

  const { byCollection, total } = await collectGardenRecords(ctx);
  console.log(`\nRecords matched for reset: ${total}`);
  if (dryRun) {
    console.log('Dry run only. No records were deleted.');
    return;
  }

  let deleted = 0;
  for (const collection of COLLECTIONS) {
    const records = byCollection[collection] || [];
    for (const record of records) {
      const rkey = extractRkey(record.uri);
      if (!rkey) continue;
      await xrpcPost(ctx.pdsUrl, XRPC_DELETE_RECORD, {
        repo: ctx.repoDid,
        collection,
        rkey,
      }, ctx.accessJwt);
      deleted += 1;
    }
  }

  console.log(`Reset complete. Deleted ${deleted} records.`);
}

async function restoreCommand(ctx, flags) {
  const from = flags.get('from');
  const dryRun = !!flags.get('dry-run');
  if (!from || typeof from !== 'string') {
    throw new Error('Missing --from <backup-file>');
  }

  const filePath = path.resolve(process.cwd(), from);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`);
  }

  const backup = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!backup?.collections || typeof backup.collections !== 'object') {
    throw new Error(`Invalid backup format: ${filePath}`);
  }

  let total = 0;
  for (const collection of COLLECTIONS) {
    const records = backup.collections[collection] || [];
    total += records.length;
  }
  console.log(`Records to restore: ${total}`);
  if (dryRun) {
    console.log('Dry run only. No records were written.');
    return;
  }

  let written = 0;
  for (const collection of COLLECTIONS) {
    const records = backup.collections[collection] || [];
    for (const record of records) {
      const rkey = extractRkey(record.uri);
      const value = record?.value;
      if (!rkey || !value || typeof value !== 'object') continue;
      await xrpcPost(ctx.pdsUrl, XRPC_PUT_RECORD, {
        repo: ctx.repoDid,
        collection,
        rkey,
        record: value,
        validate: true,
      }, ctx.accessJwt);
      written += 1;
    }
  }

  console.log(`Restore complete. Wrote ${written} records.`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (!command || command === '--help' || command === '-h' || flags.get('help') || flags.get('h')) {
    usage();
    return;
  }

  const ctx = await buildContext();
  console.log(`Authenticated DID: ${ctx.authDid}`);
  console.log(`Target repo DID: ${ctx.repoDid}`);
  console.log(`PDS endpoint: ${ctx.pdsUrl}\n`);

  if (command === 'backup') {
    await backupCommand(ctx, flags);
    return;
  }
  if (command === 'reset') {
    await resetCommand(ctx, flags);
    return;
  }
  if (command === 'restore') {
    await restoreCommand(ctx, flags);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error?.message || error}`);
  process.exitCode = 1;
});
