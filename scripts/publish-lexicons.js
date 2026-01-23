import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const lexiconsDir = path.join(rootDir, 'lexicons');
const publicDir = path.join(rootDir, 'public');
const publicLexiconsDir = path.join(publicDir, 'lexicons');

// Ensure public/lexicons exists
if (!fs.existsSync(publicLexiconsDir)) {
    fs.mkdirSync(publicLexiconsDir, { recursive: true });
}

// Read all JSON files from lexicons directory
const files = fs.readdirSync(lexiconsDir).filter(file => file.endsWith('.json'));

console.log(`Publishing ${files.length} lexicons to ${publicLexiconsDir}...`);

files.forEach(file => {
    const srcPath = path.join(lexiconsDir, file);
    const destPath = path.join(publicLexiconsDir, file);
    fs.copyFileSync(srcPath, destPath);
    console.log(`  - ${file}`);
});

console.log('Done!');
