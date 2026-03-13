#!/usr/bin/env node
/**
 * MindVault — Notarize-only script
 *
 * Run AFTER npm run dist:resign has produced a fully-signed .app.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  CORRECT ORDER (critical — do NOT change):                  ║
 * ║                                                              ║
 * ║  1. Create DMG from the SIGNED, UN-STAPLED .app             ║
 * ║  2. Sign DMG                                                 ║
 * ║  3. Notarize DMG  → staple DMG                              ║
 * ║  4. Notarize .app → staple .app                             ║
 * ║                                                              ║
 * ║  The .app must NOT be stapled before being packed into       ║
 * ║  the DMG. xcrun stapler modifies the bundle after codesign   ║
 * ║  sealed it — copying a stapled .app into an HFS+ DMG causes  ║
 * ║  the framework binaries (Electron Framework, Mantle, etc.)   ║
 * ║  to appear as "invalid signature" to Apple's notarytool.     ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Flags:
 *   --dmg-only   Create + notarize DMG only, skip .app notarization
 *   --app-only   Notarize .app only, skip DMG creation
 *
 * Credentials are loaded from backend/.env:
 *   APPLE_ID
 *   APPLE_APP_SPECIFIC_PASSWORD  (or NOTARYTOOL_PASSWORD)
 *   APPLE_TEAM_ID
 *
 * Usage:
 *   node scripts/notarize-only.js
 *   npm run dist:notarize
 */

const fs   = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

// ── Load credentials ────────────────────────────────────────────────────────

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
} catch {}

const APPLE_ID       = process.env.APPLE_ID;
const APPLE_PASSWORD = process.env.NOTARYTOOL_PASSWORD || process.env.APPLE_APP_SPECIFIC_PASSWORD;
const APPLE_TEAM_ID  = process.env.APPLE_TEAM_ID;

// ── Paths ────────────────────────────────────────────────────────────────────

const pkg      = require(path.join(__dirname, '..', 'package.json'));
const VERSION  = pkg.version;
const DIST_DIR = path.join(__dirname, '..', 'dist', 'mac-arm64');
const APP_PATH = path.join(DIST_DIR, 'MindVault.app');
const ZIP_PATH = path.join(DIST_DIR, 'MindVault-notarization.zip');
const DMG_NAME = `MindVault-${VERSION}-arm64.dmg`;
const DMG_PATH = path.join(DIST_DIR, DMG_NAME);

// ── Flags ────────────────────────────────────────────────────────────────────

const DMG_ONLY = process.argv.includes('--dmg-only');
const APP_ONLY = process.argv.includes('--app-only');

// ── Helpers ──────────────────────────────────────────────────────────────────

function step(label) {
  console.log(`\n  ── ${label} ──`);
}

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

function fetchNotaryLog(submissionId) {
  console.log(`\n  Fetching Apple diagnostic log for submission ${submissionId}…`);
  try {
    const log = run(
      `xcrun notarytool log ${submissionId} \
        --apple-id "${APPLE_ID}" \
        --password "${APPLE_PASSWORD}" \
        --team-id "${APPLE_TEAM_ID}"`,
      { timeout: 60000 }
    );
    console.log(log);
  } catch (le) {
    console.error('  (Could not fetch log:', le.message, ')');
  }
}

function notarizeAndStaple(filePath, label, stapleTarget) {
  // stapleTarget: where to staple the ticket (defaults to filePath).
  // For .app: submit the ZIP but staple the .app bundle.
  const targetForStaple = stapleTarget || filePath;
  let output;
  try {
    output = run(
      `xcrun notarytool submit "${filePath}" \
        --apple-id "${APPLE_ID}" \
        --password "${APPLE_PASSWORD}" \
        --team-id "${APPLE_TEAM_ID}" \
        --wait`,
      { timeout: 1800000 }
    );
    console.log(output.split('\n').map(l => `  ${l}`).join('\n'));
  } catch (e) {
    const out    = (e.stdout || '').toString();
    const errOut = (e.stderr || '').toString();
    const combined = (out + '\n' + errOut).trim() || e.message;
    console.error(`  ❌ ${label} notarization error:`);
    console.error(combined.split('\n').map(l => `  ${l}`).join('\n'));
    const idMatch = combined.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (idMatch) fetchNotaryLog(idMatch[1]);
    process.exit(1);
  }

  if (!output.toLowerCase().includes('accepted')) {
    const idMatch = output.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (idMatch) fetchNotaryLog(idMatch[1]);
    console.error(`\n  ❌ ${label}: notarytool did not return "Accepted" — see log above`);
    process.exit(1);
  }

  console.log(`  ✅ ${label} notarization accepted by Apple`);

  run(`xcrun stapler staple "${targetForStaple}"`);
  console.log(`  ✅ Ticket stapled to ${path.basename(targetForStaple)}`);
}

// ── Verify preconditions ─────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════');
console.log('  MindVault — Notarize & Package');
console.log(`  Version: ${VERSION}`);
console.log('══════════════════════════════════════════════════════\n');

if (!fs.existsSync(APP_PATH)) {
  console.error(`  ❌ Signed .app not found: ${APP_PATH}`);
  console.error('     Run "npm run dist:resign" first.');
  process.exit(1);
}

if (!APPLE_ID || !APPLE_PASSWORD || !APPLE_TEAM_ID) {
  console.error('  ❌ Missing credentials in backend/.env:');
  if (!APPLE_ID)       console.error('     APPLE_ID is not set');
  if (!APPLE_PASSWORD) console.error('     APPLE_APP_SPECIFIC_PASSWORD is not set');
  if (!APPLE_TEAM_ID)  console.error('     APPLE_TEAM_ID is not set');
  process.exit(1);
}

console.log(`  App:      ${APP_PATH}`);
console.log(`  Apple ID: ${APPLE_ID}`);
console.log(`  Team ID:  ${APPLE_TEAM_ID}`);
if (DMG_ONLY) console.log('  Mode:     --dmg-only (skip .app notarization)');
if (APP_ONLY) console.log('  Mode:     --app-only (skip DMG creation)');

// Verify the app is properly signed before doing anything
step('Pre-flight signature check');
try {
  execFileSync('codesign', ['--verify', '--strict', '--deep', APP_PATH], {
    stdio: 'pipe', timeout: 120000,
  });
  console.log('  ✅ codesign --verify --strict --deep: VALID');
} catch (e) {
  const stderr = e.stderr ? e.stderr.toString().trim() : e.message;
  console.error('  ❌ Signature check failed — run "npm run dist:resign" first');
  console.error(`     ${stderr}`);
  process.exit(1);
}

// Warn if the app is already stapled — it shouldn't be at this point
try {
  execFileSync('xcrun', ['stapler', 'validate', APP_PATH], { stdio: 'pipe' });
  console.log('\n  ⚠  WARNING: The .app already has a staple ticket.');
  console.log('     This usually means "npm run dist:notarize" was already run.');
  console.log('     The DMG will be built from this already-stapled app, which');
  console.log('     may cause framework signatures to appear invalid in the DMG.');
  console.log('     For a clean run: start fresh from "npm run dist:resign".\n');
} catch {
  // Not stapled — this is the expected state
  console.log('  ✅ .app is not yet stapled (correct state for DMG creation)');
}

// ── PART 1: DMG ──────────────────────────────────────────────────────────────

if (!APP_ONLY) {

  // ── Step 1: Create DMG from the signed, un-stapled .app ──────────────────

  step('Step 1/4 — Creating DMG from signed .app');
  if (fs.existsSync(DMG_PATH)) fs.unlinkSync(DMG_PATH);

  // Use Homebrew create-dmg for a professional drag-to-install layout:
  //   App icon (left) + Applications shortcut (right), custom window.
  // Falls back to plain hdiutil if not installed.
  // Install: brew install create-dmg
  const CREATE_DMG_BIN = '/opt/homebrew/bin/create-dmg';
  const DMG_SRC = path.join(DIST_DIR, '_dmg_src');
  if (fs.existsSync(DMG_SRC)) fs.rmSync(DMG_SRC, { recursive: true, force: true });
  fs.mkdirSync(DMG_SRC, { recursive: true });
  run(`ditto "${APP_PATH}" "${DMG_SRC}/MindVault.app"`);

  if (fs.existsSync(CREATE_DMG_BIN)) {
    try {
      execSync([
        `"${CREATE_DMG_BIN}"`,
        `--volname "MindVault"`,
        `--window-pos 200 120`,
        `--window-size 560 340`,
        `--icon-size 100`,
        `--icon "MindVault.app" 150 165`,
        `--hide-extension "MindVault.app"`,
        `--app-drop-link 400 165`,
        `"${DMG_PATH}"`,
        `"${DMG_SRC}"`,
      ].join(' '), { timeout: 180000, stdio: 'inherit' });
    } finally {
      fs.rmSync(DMG_SRC, { recursive: true, force: true });
    }
  } else {
    console.log('  (create-dmg not found — using hdiutil. Run "brew install create-dmg" for a better layout)');
    fs.symlinkSync('/Applications', path.join(DMG_SRC, 'Applications'));
    run(`hdiutil create -volname "MindVault" -srcfolder "${DMG_SRC}" -ov -format UDZO "${DMG_PATH}"`,
      { timeout: 120000 });
    fs.rmSync(DMG_SRC, { recursive: true, force: true });
  }

  const dmgSize = (fs.statSync(DMG_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`  ✓ ${DMG_NAME} (${dmgSize} MB)`);

  // ── Step 2: Sign DMG ─────────────────────────────────────────────────────

  step('Step 2/4 — Signing DMG');
  const identity = execSync(
    'security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | head -1',
    { encoding: 'utf8' }
  ).trim().match(/(\w{40})\s+/)?.[1];

  if (!identity) {
    console.error('  ❌ Could not find Developer ID Application certificate');
    process.exit(1);
  }

  execFileSync('codesign', [
    '--force',
    '--sign', identity,
    '--timestamp',
    DMG_PATH,
  ], { stdio: 'pipe', timeout: 120000 });
  console.log('  ✅ DMG signed');

  // ── Step 3: Notarize + staple DMG ────────────────────────────────────────

  step('Step 3/4 — Notarizing DMG (Apple checks all content inside)');
  console.log('  Waiting for Apple to process DMG…');
  notarizeAndStaple(DMG_PATH, 'DMG');

} else {
  console.log('\n  --app-only: skipping DMG creation');
}

// ── PART 2: .app ─────────────────────────────────────────────────────────────

if (!DMG_ONLY) {

  // ── Step 4: Notarize + staple .app ───────────────────────────────────────

  step('Step 4/4 — Notarizing .app (for direct distribution)');
  console.log('  Creating ZIP…');

  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
  run(`ditto -c -k --keepParent "${APP_PATH}" "${ZIP_PATH}"`);
  const zipSize = (fs.statSync(ZIP_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`  ✓ ${path.basename(ZIP_PATH)} (${zipSize} MB)`);

  console.log('  Waiting for Apple to process .app…');
  notarizeAndStaple(ZIP_PATH, '.app', APP_PATH);  // submit ZIP, staple .app

  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);

} else {
  console.log('\n  --dmg-only: skipping .app notarization');
}

// ── Final Gatekeeper check ────────────────────────────────────────────────────

console.log('\n  ── Gatekeeper check ──');
try {
  execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=4', APP_PATH], {
    stdio: 'pipe', timeout: 30000,
  });
  console.log('  ✅ spctl: ACCEPTED (notarized + stapled)');
} catch (e) {
  const stderr = e.stderr ? e.stderr.toString().trim() : e.message;
  console.log(`  ⚠  spctl: ${stderr}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════');
console.log('  ✅ Done!');
if (!APP_ONLY)  console.log(`  DMG: dist/mac-arm64/${DMG_NAME}`);
if (!DMG_ONLY)  console.log(`  App: dist/mac-arm64/MindVault.app (notarized + stapled)`);
console.log('\n  Next: push DMG to GitHub as release v' + VERSION);
console.log('══════════════════════════════════════════════════════\n');
