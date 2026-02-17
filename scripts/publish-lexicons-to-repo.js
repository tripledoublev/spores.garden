import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const lexiconsDir = path.join(rootDir, 'lexicons');

const XRPC_CREATE_SESSION = 'com.atproto.server.createSession';
const XRPC_PUT_RECORD = 'com.atproto.repo.putRecord';
const LEXICON_COLLECTION = 'com.atproto.lexicon.schema';
const LEXICON_TYPE = 'com.atproto.lexicon.schema';
const NSID_PREFIX = 'coop.hypha.spores.';

function printUsage() {
  console.log(`Usage:
  node scripts/publish-lexicons-to-repo.js [--dry-run]

Required env (unless --dry-run):
  ATPROTO_IDENTIFIER   Account handle/email for lexicon authority account
  ATPROTO_APP_PASSWORD App password for lexicon authority account

Optional env:
  ATPROTO_AUTH_SERVICE Authentication service URL (default: https://bsky.social)
  ATPROTO_PDS_URL      Explicit PDS URL; skips DID document lookup
  LEXICON_REPO_DID     DID repo to write records into (default: session did)
`);
}

function findJsonFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (entry.name.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

function normalizeServiceUrl(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function didWebToDidDocumentUrl(did) {
  const withoutPrefix = did.slice('did:web:'.length);
  const parts = withoutPrefix.split(':');
  const host = parts.shift();
  const pathParts = parts.map(decodeURIComponent);
  const pathSuffix = pathParts.length ? `/${pathParts.join('/')}` : '';
  return `https://${host}${pathSuffix}/did.json`;
}

async function xrpcPost(serviceUrl, method, body, accessJwt) {
  const res = await fetch(`${normalizeServiceUrl(serviceUrl)}/xrpc/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessJwt ? { Authorization: `Bearer ${accessJwt}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function resolvePdsFromDid(did) {
  let didDocUrl = null;
  if (did.startsWith('did:plc:')) {
    didDocUrl = `https://plc.directory/${did}`;
  } else if (did.startsWith('did:web:')) {
    didDocUrl = didWebToDidDocumentUrl(did);
  } else {
    throw new Error(`Unsupported DID method for automatic PDS resolution: ${did}`);
  }

  const res = await fetch(didDocUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch DID document (${res.status}) from ${didDocUrl}`);
  }
  const didDoc = await res.json();
  const services = Array.isArray(didDoc?.service) ? didDoc.service : [];
  const pdsService = services.find((s) => s?.type === 'AtprotoPersonalDataServer') || services[0];
  const endpoint = pdsService?.serviceEndpoint;
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error(`No PDS service endpoint found in DID document for ${did}`);
  }
  return endpoint;
}

function loadTargetLexicons() {
  const allFiles = findJsonFiles(lexiconsDir);
  const lexicons = allFiles
    .map((filePath) => {
      const raw = fs.readFileSync(filePath, 'utf8');
      const json = JSON.parse(raw);
      return { filePath, json };
    })
    .filter(({ json }) => typeof json?.id === 'string' && json.id.startsWith(NSID_PREFIX))
    .sort((a, b) => a.json.id.localeCompare(b.json.id));

  if (!lexicons.length) {
    throw new Error(`No lexicons found with prefix ${NSID_PREFIX}`);
  }
  return lexicons;
}

function buildLexiconRecord(lexiconJson) {
  if (lexiconJson.lexicon !== 1) {
    throw new Error(`Lexicon ${lexiconJson.id} has unsupported lexicon version: ${lexiconJson.lexicon}`);
  }
  if (!lexiconJson.id || typeof lexiconJson.id !== 'string') {
    throw new Error('Lexicon missing id');
  }
  if (!lexiconJson.defs || typeof lexiconJson.defs !== 'object') {
    throw new Error(`Lexicon ${lexiconJson.id} missing defs`);
  }
  return {
    $type: LEXICON_TYPE,
    ...lexiconJson,
  };
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
    throw new Error('Session response missing accessJwt or did');
  }

  return {
    accessJwt: session.accessJwt,
    did: session.did,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    printUsage();
    return;
  }
  const dryRun = args.has('--dry-run');

  const lexicons = loadTargetLexicons();
  console.log(`Found ${lexicons.length} lexicons to publish (${NSID_PREFIX}*)`);

  if (dryRun) {
    for (const { json } of lexicons) {
      console.log(`  [dry-run] ${json.id}`);
    }
    console.log('Dry run complete. No records were written.');
    return;
  }

  const { accessJwt, did: sessionDid } = await authenticate();
  const repoDid = process.env.LEXICON_REPO_DID || sessionDid;
  const pdsUrl = process.env.ATPROTO_PDS_URL || await resolvePdsFromDid(repoDid);
  console.log(`Authenticated as ${sessionDid}`);
  console.log(`Publishing to repo ${repoDid} via ${pdsUrl}`);

  for (const { json, filePath } of lexicons) {
    const nsid = json.id;
    const record = buildLexiconRecord(json);
    await xrpcPost(pdsUrl, XRPC_PUT_RECORD, {
      repo: repoDid,
      collection: LEXICON_COLLECTION,
      rkey: nsid,
      record,
      validate: true,
    }, accessJwt);
    console.log(`  [published] ${nsid} <- ${path.relative(rootDir, filePath)}`);
  }

  console.log('Lexicon publish complete.');
}

main().catch((error) => {
  console.error('Failed to publish lexicons to repo:', error?.message || error);
  process.exitCode = 1;
});
