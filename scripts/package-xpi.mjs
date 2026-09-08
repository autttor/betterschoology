/**
 * Produces an installable .xpi from the packaged Firefox build.
 *
 * An XPI is a ZIP with `manifest.json` at its root, so this is a copy rather
 * than a repack — which keeps the bytes identical to what CI built and what
 * would be submitted to AMO.
 *
 * The resulting file is UNSIGNED. Firefox release and ESR refuse to install
 * unsigned extensions permanently; see the install matrix in the README.
 * `npm run sign:firefox` produces a signed, self-distributable XPI once AMO
 * credentials are available.
 */
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { name, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const zip = join(root, '.output', `${name}-${version}-firefox.zip`);
const xpi = join(root, '.output', `${name}-${version}.xpi`);

if (!existsSync(zip)) {
  console.error(`Missing ${zip}. Run: npm run zip:firefox`);
  process.exit(1);
}

copyFileSync(zip, xpi);

const kb = (statSync(xpi).size / 1024).toFixed(1);
console.log(`  ✓ ${name}-${version}.xpi  (${kb} KB)`);
console.log('');
console.log('  Install (unsigned):');
console.log('    Any Firefox, temporary:  about:debugging#/runtime/this-firefox');
console.log('                             -> Load Temporary Add-on -> pick this .xpi');
console.log('    Developer Edition /');
console.log('    Nightly, permanent:      set xpinstall.signatures.required=false');
console.log('                             in about:config, then open the .xpi');
console.log('');
console.log('  For release Firefox, a signed build is required: npm run sign:firefox');
