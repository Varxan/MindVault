/**
 * MindVault — afterSign hook for electron-builder
 *
 * 1. Runs diagnostic checks on key binaries BEFORE notarizing
 * 2. Triggers Apple notarization after electron-builder has signed the app
 *
 * Requires environment variables:
 *   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD (or NOTARYTOOL_PASSWORD), APPLE_TEAM_ID
 */

const { notarize } = require('@electron/notarize');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

// Load .env from backend
try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
} catch {}

/**
 * Run codesign diagnostics on a binary and return the output
 */
function diagnoseBinary(filePath, label) {
  console.log(`\n  ── Diagnostics for ${label} ──`);
  console.log(`     Path: ${filePath}`);

  // Check if file exists
  const fs = require('fs');
  if (!fs.existsSync(filePath)) {
    console.log(`     ❌ FILE DOES NOT EXIST`);
    return;
  }

  // Check file info
  try {
    const stat = fs.statSync(filePath);
    console.log(`     Size: ${stat.size} bytes`);
    console.log(`     Symlink: ${fs.lstatSync(filePath).isSymbolicLink()}`);
  } catch (e) {
    console.log(`     Stat error: ${e.message}`);
  }

  // codesign -dv (display signature info)
  try {
    const info = execFileSync('codesign', ['-dv', '--verbose=4', filePath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    // codesign -dv outputs to stderr
    console.log(`     Signature info: (see stderr output above or below)`);
  } catch (e) {
    // codesign -dv outputs to stderr even on success
    const stderr = e.stderr ? e.stderr.toString() : '';
    const stdout = e.stdout ? e.stdout.toString() : '';
    if (stderr) {
      console.log(`     Signature details:\n${stderr.split('\n').map(l => `       ${l}`).join('\n')}`);
    }
    if (e.status !== 0 && !stderr.includes('Executable=')) {
      console.log(`     ❌ codesign -dv failed: exit code ${e.status}`);
    }
  }

  // codesign --verify --strict (no --deep, just this binary)
  try {
    execFileSync('codesign', ['--verify', '--strict', filePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    console.log(`     ✅ codesign --verify --strict: VALID`);
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : e.message;
    console.log(`     ❌ codesign --verify --strict: FAILED`);
    console.log(`        ${stderr}`);
  }

  // codesign --verify --strict --deep (full bundle check)
  try {
    execFileSync('codesign', ['--verify', '--strict', '--deep', filePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    console.log(`     ✅ codesign --verify --strict --deep: VALID`);
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : e.message;
    console.log(`     ❌ codesign --verify --strict --deep: FAILED`);
    console.log(`        ${stderr}`);
  }

  // Check architecture
  try {
    const lipo = execFileSync('lipo', ['-info', filePath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    console.log(`     Architecture: ${lipo.trim()}`);
  } catch (e) {
    // Not a fat binary or lipo not applicable
  }
}

module.exports = async function afterSign(context) {
  const { appOutDir } = context;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`\n  ══════════════════════════════════════════════════════`);
  console.log(`  afterSign: Running signature diagnostics...`);
  console.log(`  App path: ${appPath}`);
  console.log(`  ══════════════════════════════════════════════════════`);

  // Diagnose the two binaries that Apple keeps rejecting
  const mainBinary = path.join(appPath, 'Contents', 'MacOS', 'MindVault');
  const electronFramework = path.join(appPath, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Electron Framework');
  const electronFrameworkBundle = path.join(appPath, 'Contents', 'Frameworks', 'Electron Framework.framework');

  diagnoseBinary(mainBinary, 'MindVault main binary');
  diagnoseBinary(electronFramework, 'Electron Framework binary');
  diagnoseBinary(electronFrameworkBundle, 'Electron Framework.framework bundle');

  // Also check the whole app
  console.log(`\n  ── Whole app verification ──`);
  try {
    execFileSync('codesign', ['--verify', '--strict', appPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    console.log(`     ✅ App signature (no --deep): VALID`);
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : e.message;
    console.log(`     ❌ App signature (no --deep): FAILED`);
    console.log(`        ${stderr}`);
  }

  try {
    execFileSync('codesign', ['--verify', '--strict', '--deep', appPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    });
    console.log(`     ✅ App signature (--deep): VALID`);
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : e.message;
    console.log(`     ❌ App signature (--deep): FAILED`);
    console.log(`        ${stderr}`);
  }

  // Check what identity electron-builder actually used
  console.log(`\n  ── Signing identity check ──`);
  try {
    const { execSync } = require('child_process');
    const certs = execSync(
      'security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    console.log(`     Available certs:\n${certs.split('\n').map(l => `       ${l}`).join('\n')}`);
  } catch (e) {
    console.log(`     ❌ Could not list certificates: ${e.message}`);
  }

  console.log(`\n  ══════════════════════════════════════════════════════`);
  console.log(`  ℹ  Signatures above are expected to be invalid at this stage.`);
  console.log(`     electron-builder's osx-sign leaves nested binaries in a broken`);
  console.log(`     state that requires a manual re-sign pass.`);
  console.log(`\n  Next steps:`);
  console.log(`     npm run dist:resign    ← fixes all signatures`);
  console.log(`     npm run dist:notarize  ← notarizes + creates DMG`);
  console.log(`  ══════════════════════════════════════════════════════\n`);

  // Notarization is intentionally NOT done here.
  // electron-builder's osx-sign leaves the bundle with "nested code is modified
  // or invalid" because it signs the outer bundle without properly handling the
  // pre-signed Python .so files from afterPack.js.
  // The fix is always a manual dist:resign pass, so notarizing here would just
  // fail and crash the build. Use "npm run dist:notarize" after dist:resign.
};
