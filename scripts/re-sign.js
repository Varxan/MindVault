#!/usr/bin/env node
/**
 * MindVault — Complete re-signing script
 *
 * Signs the entire .app bundle in correct inside-out order:
 *   1. All individual Mach-O binaries (deepest first)
 *      → chrome_crashpad_handler gets an explicit correct Developer ID DR
 *   2. All .framework bundles (deepest first, NO --deep)
 *      → Each gets an explicit DR using its CFBundleIdentifier
 *   3. All .app helper bundles (deepest first)
 *      → Each gets an explicit DR using its CFBundleIdentifier
 *   4. The main .app bundle (with explicit DR)
 *   5. Verify
 *
 * Root cause of "does not satisfy its designated Requirement":
 *   When Apple's WWDR intermediate certificate is absent from the keychain,
 *   codesign cannot build the proper Developer ID chain and auto-generates:
 *     identifier "X" and certificate root = H"<leaf-cert-hash>"
 *   That requirement always fails during --strict verification because the
 *   actual root is Apple Root CA, not our leaf cert.
 *   Fix: supply an explicit designated requirement for every bundle we sign.
 *
 * Usage: node scripts/re-sign.js [path-to-app]
 *   Default: dist/mac-arm64/MindVault.app
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

// Filter out flag arguments (--force, etc.) to find the optional app path argument
const _appArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const APP_PATH = _appArg || path.join(__dirname, '..', 'dist', 'mac-arm64', 'MindVault.app');
const ENTITLEMENTS = path.join(__dirname, '..', 'electron', 'entitlements.mac.plist');

// ── Find Developer ID certificate ──────────────────────────────────────────

function findIdentity() {
  try {
    const output = execSync(
      'security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | head -1',
      { encoding: 'utf8' }
    ).trim();
    const match = output.match(/(\w{40})\s+"([^"]+)"/);
    if (match) {
      console.log(`  Identity: ${match[2]}`);
      console.log(`  Hash:     ${match[1]}`);
      return match[1];
    }
  } catch {}
  console.error('  ❌ No Developer ID Application certificate found!');
  process.exit(1);
}

// ── Extract Team ID (OU) from Developer ID certificate ─────────────────────

function findTeamID() {
  try {
    const subject = execSync(
      'security find-certificate -c "Developer ID Application" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null',
      { encoding: 'utf8' }
    ).trim();
    const m = subject.match(/OU\s*=\s*([A-Z0-9]+)/);
    if (m) return m[1];
  } catch {}
  return null;
}

// ── Get CFBundleIdentifier from a bundle's Info.plist ──────────────────────
// Returns null if not found (e.g. bare .framework with no Info.plist).

function getBundleIdentifier(bundlePath) {
  const candidates = [
    path.join(bundlePath, 'Contents', 'Info.plist'),             // .app bundles
    path.join(bundlePath, 'Versions', 'A', 'Resources', 'Info.plist'), // versioned .frameworks
    path.join(bundlePath, 'Resources', 'Info.plist'),             // flat .frameworks
  ];
  for (const plist of candidates) {
    if (fs.existsSync(plist)) {
      try {
        const out = execSync(
          `/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${plist}" 2>/dev/null`,
          { encoding: 'utf8' }
        ).trim();
        if (out && !out.includes('Does Not Exist') && !out.includes('error')) {
          return out;
        }
      } catch {}
    }
  }
  return null;
}

// ── Build a valid Developer ID designated requirement ─────────────────────
// "anchor apple generic" = any cert anchored to Apple Root CA (correct for
// Developer ID).  Scoped to our team via certificate leaf[subject.OU].

function makeRequirement(identifier, teamID) {
  if (!identifier || !teamID) return null;
  return `=designated => identifier "${identifier}" and anchor apple generic and certificate leaf[subject.OU] = "${teamID}"`;
}

// ── Mach-O detection ───────────────────────────────────────────────────────

function isMachO(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (stat.size < 8) return false;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    const magic = buf.readUInt32LE(0);
    if (magic === 0xfeedfacf || magic === 0xcffaedfe ||
        magic === 0xfeedface || magic === 0xcefaedfe) return true;
    if (magic === 0xbebafeca || magic === 0xcafebabe) {
      const archCount = buf.readUInt32BE(4);
      return archCount > 0 && archCount < 20 && stat.size > 4096;
    }
    return false;
  } catch { return false; }
}

// ── Recursive scanner ──────────────────────────────────────────────────────

function scanApp(dir) {
  const binaries = [];
  const frameworks = [];
  const apps = [];

  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      // Skip symlinks — sign real files only; symlink targets are reached via
      // their real path, so we never sign the same inode twice.
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (entry.name.endsWith('.framework')) {
          frameworks.push(fullPath);
          walk(fullPath);
        } else if (entry.name.endsWith('.app') && fullPath !== APP_PATH) {
          apps.push(fullPath);
          walk(fullPath);
        } else {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (isMachO(fullPath)) {
          binaries.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return { binaries, frameworks, apps };
}

// ── Sign a single item ─────────────────────────────────────────────────────

function signItem(filePath, identity, useDeep = false, req = null) {
  const args = [
    '--force',
    '--sign', identity,
    '--timestamp',
    '--options', 'runtime',
  ];

  if (useDeep) args.push('--deep');

  if (req) {
    args.push('-r', req);
  }

  if (fs.existsSync(ENTITLEMENTS)) {
    args.push('--entitlements', ENTITLEMENTS);
  }

  args.push(filePath);

  try {
    execFileSync('codesign', args, { stdio: 'pipe', timeout: 180000 });
    return true;
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    const label = path.relative(APP_PATH, filePath);
    console.log(`    ❌ FAILED: ${label}`);
    console.log(`       ${stderr}`);
    return false;
  }
}

// ── Verify an item and print result ───────────────────────────────────────

function verifyItem(itemPath, useVerbose = false) {
  try {
    const args = useVerbose
      ? ['--verify', '--strict', '-vvvv', itemPath]
      : ['--verify', '--strict', itemPath];
    execFileSync('codesign', args, { stdio: 'pipe', timeout: 60000 });
    return { ok: true };
  } catch (e) {
    const out = [
      e.stdout ? e.stdout.toString().trim() : '',
      e.stderr ? e.stderr.toString().trim() : '',
    ].filter(Boolean).join('\n');
    return { ok: false, out };
  }
}

// ══ Main ════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════════');
console.log('  MindVault — Complete Re-signing');
console.log('══════════════════════════════════════════════════════\n');

if (!fs.existsSync(APP_PATH)) {
  console.error(`  ❌ App not found: ${APP_PATH}`);
  process.exit(1);
}

// ── Safety: refuse to re-sign an already-notarized/stapled app ─────────────
// After xcrun stapler staple, macOS modifies the .app bundle. Trying to
// re-sign it causes two failure modes:
//   • "internal error in Code Signing subsystem" for Python .so files
//   • "Operation not permitted" for main Electron framework binaries
// Both are caused by macOS protecting the stapled files.
//
// To fix a stapled app, run:
//   xcrun stapler remove /path/to/MindVault.app
//   xattr -cr /path/to/MindVault.app
//   chflags -R nouchg /path/to/MindVault.app
//   npm run dist:resign
//
// Or pass --force to have this script do those steps automatically.

const FORCE = process.argv.includes('--force');

try {
  execFileSync('xcrun', ['stapler', 'validate', APP_PATH], { stdio: 'pipe' });
  // Stapler validate succeeded → app is already stapled
  if (!FORCE) {
    console.error('  ❌ This .app is already notarized and stapled!');
    console.error('     Re-signing a stapled app corrupts it (macOS protects the files).');
    console.error('');
    console.error('     To reset and re-sign, run:');
    console.error(`       xcrun stapler remove "${APP_PATH}"`);
    console.error(`       xattr -cr "${APP_PATH}"`);
    console.error(`       chflags -R nouchg "${APP_PATH}"`);
    console.error('       npm run dist:resign');
    console.error('');
    console.error('     Or re-run with --force to do this automatically:');
    console.error('       node scripts/re-sign.js --force');
    process.exit(1);
  } else {
    console.log('  ⚠  App is stapled — --force passed, cleaning up before re-signing…');
    try { execSync(`xcrun stapler remove "${APP_PATH}"`, { stdio: 'pipe' }); } catch {}
    try { execSync(`xattr -cr "${APP_PATH}"`, { stdio: 'pipe' }); } catch {}
    try { execSync(`chflags -R nouchg "${APP_PATH}"`, { stdio: 'pipe' }); } catch {}
    console.log('  ✓ Staple removed, xattrs cleared, immutable flags cleared');
  }
} catch {
  // validate failed → not stapled, safe to proceed
}

console.log(`  App: ${APP_PATH}`);
const identity = findIdentity();
const teamID   = findTeamID();

if (teamID) {
  console.log(`  Team ID: ${teamID}`);
  console.log('  Explicit DRs: enabled (workaround for broken auto-generated DRs)');
} else {
  console.log('  ⚠ Could not extract Team ID — explicit DRs disabled, signing may fail');
}

console.log(`  Entitlements: ${ENTITLEMENTS}\n`);

// ── Phase 1: Scan ──────────────────────────────────────────────────────────

console.log('  Phase 1: Scanning app bundle...');
const { binaries, frameworks, apps } = scanApp(APP_PATH);

const byDepth = (a, b) => b.split(path.sep).length - a.split(path.sep).length;
binaries.sort(byDepth);
frameworks.sort(byDepth);
apps.sort(byDepth);

console.log(`    Found ${binaries.length} Mach-O binaries`);
console.log(`    Found ${frameworks.length} .framework bundles`);
console.log(`    Found ${apps.length} .app helper bundles\n`);

// ── Phase 2: Sign Mach-O binaries ─────────────────────────────────────────
// EVERY binary gets an explicit designated requirement.
// Without it, codesign auto-generates a broken DR:
//   identifier "X" and certificate root = H"<our-leaf-cert-hash>"
// which fails Apple's notarization check ("The signature of the binary is
// invalid") because the actual chain root is Apple Root CA, not our leaf.
//
// We use a generic DR that doesn't pin to a specific identifier:
//   anchor apple generic and certificate leaf[subject.OU] = "TEAMID"
// This is valid for all Developer ID binaries. The identifier embedded in
// the code directory is still set by codesign from the binary filename or
// existing LC_CODE_SIGNATURE — only the designated REQUIREMENT is overridden.

console.log('  Phase 2: Signing individual Mach-O binaries...');
if (teamID) {
  console.log('    All binaries will get explicit Developer ID DR');
}

// Generic DR that works for any binary signed by our team
const genericReq = teamID
  ? `=designated => anchor apple generic and certificate leaf[subject.OU] = "${teamID}"`
  : null;

let signed = 0, failed = 0;
for (const bin of binaries) {
  const rel = path.relative(APP_PATH, bin);

  if (signItem(bin, identity, false, genericReq)) {
    signed++;
    if (signed <= 3 || signed % 50 === 0 || signed === binaries.length) {
      console.log(`    ✓ [${signed}/${binaries.length}] ${rel}`);
    }
  } else {
    failed++;
  }
}
console.log(`    Binaries: ${signed} signed, ${failed} failed\n`);

// ── Phase 3: Sign .framework bundles ──────────────────────────────────────
// NO --deep: we pre-signed all nested Mach-O binaries in Phase 2, so --deep
// is NOT needed and would re-sign chrome_crashpad_handler with a broken
// auto-generated DR, overwriting the correct DR we embedded above.
//
// Every framework gets an explicit DR based on its CFBundleIdentifier.
// This is critical: without it, codesign auto-generates
//   identifier "X" and certificate root = H"<our-leaf-cert-hash>"
// which always fails --strict because the actual trust anchor is Apple Root CA.

console.log('  Phase 3: Signing .framework bundles (no --deep, explicit DRs)...');

let fwSigned = 0, fwFailed = 0;
for (const fw of frameworks) {
  const rel = path.relative(APP_PATH, fw);
  const isElectronFramework = path.basename(fw) === 'Electron Framework.framework';

  const bundleId = getBundleIdentifier(fw);
  const req = makeRequirement(bundleId, teamID);

  if (bundleId) {
    console.log(`    [id: ${bundleId}] ${rel}`);
  } else {
    console.log(`    [no bundle id] ${rel}`);
  }

  if (signItem(fw, identity, false, req)) {
    fwSigned++;
    const result = verifyItem(fw, isElectronFramework);
    if (result.ok) {
      console.log(`      ✓ self-verify OK`);
    } else {
      console.log(`      ⚠ self-verify FAILED:`);
      result.out.split('\n').forEach(l => console.log(`         ${l}`));
    }
  } else {
    fwFailed++;
  }
}
console.log(`    Frameworks: ${fwSigned} signed, ${fwFailed} failed\n`);

// ── Phase 4: Sign helper .app bundles ─────────────────────────────────────

console.log('  Phase 4: Signing .app helper bundles (explicit DRs)...');

let appSigned = 0, appFailed = 0;
for (const app of apps) {
  const rel = path.relative(APP_PATH, app);
  const bundleId = getBundleIdentifier(app);
  const req = makeRequirement(bundleId, teamID);

  if (signItem(app, identity, false, req)) {
    appSigned++;
    const result = verifyItem(app);
    if (result.ok) {
      console.log(`    ✓ ${rel} [self-verify OK]`);
    } else {
      console.log(`    ⚠ ${rel} [self-verify FAILED: ${result.out}]`);
    }
  } else {
    appFailed++;
  }
}
console.log(`    Helpers: ${appSigned} signed, ${appFailed} failed\n`);

// ── Phase 5: Sign main app bundle ─────────────────────────────────────────

console.log('  Phase 5: Signing main app bundle...');

// Remove stale _CodeSignature to force a fresh CodeResources build
const codeSignDir = path.join(APP_PATH, 'Contents', '_CodeSignature');
if (fs.existsSync(codeSignDir)) {
  fs.rmSync(codeSignDir, { recursive: true, force: true });
  console.log('    Removed stale _CodeSignature');
}

const mainBundleId = getBundleIdentifier(APP_PATH);
const mainReq = makeRequirement(mainBundleId, teamID);
console.log(`    Bundle ID: ${mainBundleId || '(unknown)'}`);

if (!signItem(APP_PATH, identity, false, mainReq)) {
  console.log('    ❌ Main app signing failed!\n');
  process.exit(1);
}
console.log('    ✓ MindVault.app signed\n');

// ── Phase 6: Verify ────────────────────────────────────────────────────────

console.log('  Phase 6: Verification...');

// Top-level verify (no --deep)
{
  const r = verifyItem(APP_PATH, false);
  if (r.ok) {
    console.log('    ✅ codesign --verify --strict: VALID');
  } else {
    console.log(`    ❌ codesign --verify --strict: FAILED`);
    console.log(`       ${r.out}`);
  }
}

// Deep verify
{
  try {
    execFileSync('codesign', ['--verify', '--strict', '--deep', APP_PATH], {
      stdio: 'pipe', timeout: 120000,
    });
    console.log('    ✅ codesign --verify --strict --deep: VALID');
  } catch (e) {
    const out = [
      e.stdout ? e.stdout.toString().trim() : '',
      e.stderr ? e.stderr.toString().trim() : '',
    ].filter(Boolean).join('\n');
    console.log('    ❌ codesign --verify --strict --deep: FAILED');
    console.log(`       ${out}`);
  }
}

// Gatekeeper assess
{
  try {
    execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=4', APP_PATH], {
      stdio: 'pipe', timeout: 120000,
    });
    console.log('    ✅ spctl --assess: ACCEPTED');
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : e.message;
    console.log(`    ⚠  spctl --assess: ${stderr}`);
  }
}

console.log('\n══════════════════════════════════════════════════════\n');

const totalFailed = failed + fwFailed + appFailed;
if (totalFailed > 0) {
  console.log(`  ⚠ ${totalFailed} item(s) failed to sign — check output above`);
  process.exit(1);
} else {
  const total = signed + fwSigned + appSigned + 1;
  console.log(`  Total: ${total} items signed`);
  console.log('  Next step: run notarization (afterSign.js or notarytool)\n');
}
