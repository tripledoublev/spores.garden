import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const lexiconsDir = path.join(rootDir, 'lexicons');
const publicDir = path.join(rootDir, 'public');

// Ensure directories exist
const publicLexiconsDir = path.join(publicDir, 'lexicons');
const wellKnownDir = path.join(publicDir, '.well-known');
const atProtoLexiconDir = path.join(wellKnownDir, 'atproto-lexicon');

[publicLexiconsDir, atProtoLexiconDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Read all JSON files from lexicons directory
const files = fs.readdirSync(lexiconsDir).filter(file => file.endsWith('.json'));
const bundle = [];

console.log(`Publishing ${files.length} lexicons...`);

files.forEach(file => {
    const srcPath = path.join(lexiconsDir, file);
    const content = fs.readFileSync(srcPath, 'utf8');
    const json = JSON.parse(content);
    bundle.push(json);

    const nsid = file.replace(/\.json$/, '');

    // 1. /lexicons/<nsid>.json
    const legacyDest = path.join(publicLexiconsDir, file);
    fs.copyFileSync(srcPath, legacyDest);

    // 2. /.well-known/atproto-lexicon/<nsid>
    const rfcDest = path.join(atProtoLexiconDir, nsid);
    fs.writeFileSync(rfcDest, content); // Write content without extension

    console.log(`  - ${nsid}`);
});

// 3. /.well-known/atproto-lexicons (bundle)
const bundlePath = path.join(wellKnownDir, 'atproto-lexicons');
fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
console.log(`  - Bundle written to ${bundlePath}`);

console.log('Done!');
