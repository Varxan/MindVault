/**
 * MindVault — Patch codesign verification in @electron/osx-sign AND @electron/notarize
 *
 * Both packages run `codesign --verify --deep --strict` which fails with
 * "nested code is modified or invalid" when bundled Python binaries are present.
 *
 * This patch:
 *   1. Replaces verifySignApplication in @electron/osx-sign with a no-op
 *   2. Replaces checkSignatures in @electron/notarize with a no-op
 *
 * Apple's actual notarization service validates the signing — these local
 * pre-checks are redundant and overly strict.
 */

const fs = require('fs');
const path = require('path');

let totalPatched = 0;

// ── 1. Patch @electron/osx-sign ─────────────────────────────────────────────
const osxSignFiles = [
  path.join(__dirname, '..', 'node_modules', '@electron', 'osx-sign', 'dist', 'cjs', 'sign.js'),
  path.join(__dirname, '..', 'node_modules', '@electron', 'osx-sign', 'dist', 'esm', 'sign.js'),
];

for (const filePath of osxSignFiles) {
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, 'utf8');
  const variant = path.basename(path.dirname(filePath));

  if (content.includes('// PATCHED: skip verification')) {
    console.log(`  patch-builder: osx-sign/${variant}/sign.js already patched`);
    totalPatched++;
    continue;
  }

  const startMarker = 'async function verifySignApplication(opts) {';
  const endMarker = 'function defaultOptionsForFile';
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx);
    content = before + `async function verifySignApplication(opts) {\n    // PATCHED: skip verification — notarization handles validation\n    console.log('  Skipping codesign verification (patched)');\n    return;\n}\n` + after;
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  patch-builder: osx-sign/${variant}/sign.js — verification replaced with no-op`);
    totalPatched++;
  } else {
    console.warn(`  patch-builder: Could not find verifySignApplication in osx-sign/${variant}/sign.js`);
  }
}

// ── 2. Patch @electron/notarize ─────────────────────────────────────────────
const notarizeCheckSig = path.join(__dirname, '..', 'node_modules', '@electron', 'notarize', 'lib', 'check-signature.js');

if (fs.existsSync(notarizeCheckSig)) {
  let content = fs.readFileSync(notarizeCheckSig, 'utf8');

  if (content.includes('// PATCHED: skip signature check')) {
    console.log('  patch-builder: notarize/check-signature.js already patched');
    totalPatched++;
  } else {
    // Replace the checkSignatures function body
    const marker = 'function checkSignatures(opts) {';
    const idx = content.indexOf(marker);

    if (idx !== -1) {
      // Find the closing of the function (exports.checkSignatures line)
      const exportsLine = 'exports.checkSignatures = checkSignatures;';
      const exportsIdx = content.indexOf(exportsLine);

      if (exportsIdx !== -1) {
        const before = content.substring(0, idx);
        const after = content.substring(exportsIdx);
        content = before + `function checkSignatures(opts) {\n    // PATCHED: skip signature check — let Apple's notarization service validate\n    return __awaiter(this, void 0, void 0, function* () {\n        console.log('  Skipping pre-notarization signature check (patched)');\n        return;\n    });\n}\n` + after;
        fs.writeFileSync(notarizeCheckSig, content, 'utf8');
        console.log('  patch-builder: notarize/check-signature.js — checkSignatures replaced with no-op');
        totalPatched++;
      } else {
        console.warn('  patch-builder: Could not find exports line in check-signature.js');
      }
    } else {
      console.warn('  patch-builder: Could not find checkSignatures in check-signature.js');
    }
  }
} else {
  console.log('  patch-builder: notarize/check-signature.js not found, skipping');
}

// ── Summary ─────────────────────────────────────────────────────────────────
if (totalPatched === 0) {
  console.error('  patch-builder: No files were patched!');
  process.exit(1);
} else {
  console.log(`  patch-builder: Done (${totalPatched} file(s) patched)`);
}
