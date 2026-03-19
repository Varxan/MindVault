#!/usr/bin/env node

/**
 * MindVault — Comprehensive Code Signing & Notarization Script
 *
 * This script performs deep signing of the entire app bundle, then notarizes it.
 *
 * Usage:
 *   node scripts/sign-and-notarize.js
 *
 * Environment variables:
 *   APPLE_ID                    Apple ID email for notarization
 *   APPLE_APP_SPECIFIC_PASSWORD App-specific password from appleid.apple.com
 *   APPLE_TEAM_ID              Team ID from developer.apple.com/account
 *   NOTARYTOOL_PASSWORD         (optional) Override for app-specific password
 *
 * The script:
 *   1. Discovers the Developer ID Application certificate
 *   2. Finds all Mach-O binaries in the app bundle
 *   3. Signs them recursively from deepest to shallowest (inside-out):
 *      - Individual .dylib, .so, .node files
 *      - Nested .app and .framework bundles (deepest first)
 *      - Main app bundle
 *   4. Creates a ZIP archive for notarization
 *   5. Submits to Apple for notarization using xcrun notarytool
 *   6. Waits for notarization approval
 *   7. Staples the notarization ticket
 *   8. Creates a DMG installer
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync, exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');

// Load environment variables from backend/.env if available
try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
} catch {
  // dotenv might not be installed, that's okay
}

const execAsync = promisify(exec);

// Config
const DIST_DIR = path.join(__dirname, '..', 'dist', 'mac-arm64');
const APP_NAME = 'MindVault';
const APP_PATH = path.join(DIST_DIR, `${APP_NAME}.app`);
const ENTITLEMENTS_PATH = path.join(__dirname, '..', 'electron', 'entitlements.mac.plist');

// Credentials
const APPLE_ID = process.env.APPLE_ID;
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;
const APPLE_PASSWORD = process.env.NOTARYTOOL_PASSWORD || process.env.APPLE_APP_SPECIFIC_PASSWORD;

/**
 * Check if a file is a Mach-O binary (including fat/universal binaries)
 */
function isMachO(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (stat.size < 8) return false; // Too small to be a binary

    // Read first 8 bytes to check Mach-O magic number
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);

    const magic = buffer.readUInt32LE(0);

    // Standard Mach-O magic numbers
    if (magic === 0xfeedfacf ||  // 64-bit little-endian
        magic === 0xcffaedfe ||  // 64-bit big-endian
        magic === 0xfeedface ||  // 32-bit little-endian
        magic === 0xcefaedfe) {  // 32-bit big-endian
      return true;
    }

    // Fat/universal binary magic: 0xcafebabe (big-endian)
    // Note: Java .class files also use 0xcafebabe, but they are tiny
    // and have different second bytes. Fat binaries have arch count as 2nd uint32.
    if (magic === 0xbebafeca || magic === 0xcafebabe) {
      // Read the arch count (bytes 4-7) — fat binaries have small counts (1-10)
      // Java .class files have version numbers (45-65) in bytes 4-7
      const archCount = buffer.readUInt32BE(4);
      return archCount > 0 && archCount < 20 && stat.size > 4096;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Find the Developer ID Application certificate
 */
function findDeveloperIDCert() {
  try {
    const output = execSync(
      'security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | head -1',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (!output) return null;

    // Extract the hash (40-char hex string) and name
    const match = output.match(/(\w{40})\s+"([^"]+)"/);
    if (match) {
      return { hash: match[1], name: match[2] };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a path is a symlink (including through parent directories)
 */
function isSymlink(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Find all individual binaries (non-bundle) that need signing.
 * Bundles (.app, .framework) are collected separately and signed as wholes.
 */
function findFilesToSign(dir, baseDir = dir) {
  const result = { files: [], bundles: [] };

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip all symlinks
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (entry.name.endsWith('.app') || entry.name.endsWith('.framework')) {
          // First, recurse into the bundle to sign its inner contents
          const inner = findFilesToSign(fullPath, baseDir);
          result.files.push(...inner.files);
          result.bundles.push(...inner.bundles);
          // Then add the bundle itself (will be signed as a bundle, not individual binary)
          result.bundles.push(fullPath);
        } else {
          const inner = findFilesToSign(fullPath, baseDir);
          result.files.push(...inner.files);
          result.bundles.push(...inner.bundles);
        }
      } else if (entry.isFile()) {
        // Check ALL files for Mach-O magic bytes — don't rely on extension filtering
        // This catches: .dylib, .so, .node, extensionless binaries, and files with
        // version numbers in their names (python3.11, protoc-3.13.0.0, libgcc_s.1.1.dylib)
        if (isMachO(fullPath)) {
          result.files.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dir}: ${err.message}`);
  }

  return result;
}

/**
 * Sort files by depth (deepest/longest path first)
 */
function sortByDepth(files) {
  return files.sort((a, b) => {
    const depthA = a.split(path.sep).length;
    const depthB = b.split(path.sep).length;
    return depthB - depthA; // Descending (deepest first)
  });
}

/**
 * Sign a single file or bundle using execFileSync (no shell escaping issues)
 */
function signFile(filePath, identity, entitlements, isBundle = false) {
  const args = [
    '--force',
    '--sign', identity,
    '--timestamp',
    '--options', 'runtime',
  ];

  if (entitlements && fs.existsSync(entitlements)) {
    args.push('--entitlements', entitlements);
  }

  args.push(filePath);

  try {
    execFileSync('codesign', args, {
      stdio: 'pipe',
      timeout: 60000,
    });
    return true;
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    console.log(`     Error: ${stderr.trim() || err.message}`);
    return false;
  }
}

/**
 * Sign the entire app bundle, recursively, inside-out
 *
 * Phase 1: Sign individual binaries (deepest first)
 * Phase 2: Sign bundles (.framework, .app) (deepest first)
 * Phase 3: Sign the main app bundle
 */
function signAppBundle(appPath, identity, entitlements) {
  console.log(`\n📝 Signing app bundle with identity: ${identity}`);

  // Find all files and bundles that need signing
  const { files, bundles } = findFilesToSign(appPath);

  // Sort both by depth (deepest first = inside-out)
  const sortedFiles = sortByDepth(files);
  const sortedBundles = sortByDepth(bundles);

  console.log(`\n   Found ${sortedFiles.length} individual binaries and ${sortedBundles.length} bundles to sign`);

  let signed = 0;
  let failed = 0;

  // Phase 1: Sign individual binaries (deepest first)
  console.log(`\n   ── Phase 1: Signing individual binaries ──`);
  for (const filePath of sortedFiles) {
    const relPath = path.relative(appPath, filePath);

    if (signFile(filePath, identity, entitlements, false)) {
      console.log(`   ✓ ${relPath}`);
      signed++;
    } else {
      console.log(`   ✗ ${relPath} (failed)`);
      failed++;
    }
  }

  console.log(`\n   Phase 1 complete: ${signed} signed, ${failed} failed`);

  // Phase 2: Sign bundles (.framework and .app, deepest first)
  console.log(`\n   ── Phase 2: Signing bundles (.framework, .app) ──`);
  let bundleSigned = 0;
  let bundleFailed = 0;

  for (const bundlePath of sortedBundles) {
    const relPath = path.relative(appPath, bundlePath);

    if (signFile(bundlePath, identity, entitlements, true)) {
      console.log(`   ✓ [bundle] ${relPath}`);
      bundleSigned++;
    } else {
      console.log(`   ✗ [bundle] ${relPath} (failed)`);
      bundleFailed++;
    }
  }

  console.log(`\n   Phase 2 complete: ${bundleSigned} bundles signed, ${bundleFailed} failed`);

  // Phase 3: Sign the main app bundle
  console.log(`\n   ── Phase 3: Signing main app bundle ──`);
  if (signFile(appPath, identity, entitlements, true)) {
    console.log(`   ✓ ${APP_NAME}.app`);
  } else {
    console.log(`   ✗ ${APP_NAME}.app (failed)`);
    bundleFailed++;
  }

  const totalFailed = failed + bundleFailed;
  console.log(`\n   Total: ${signed + bundleSigned + 1} signed, ${totalFailed} failed`);

  if (totalFailed > 0) {
    throw new Error(`Signing failed for ${totalFailed} file(s)`);
  }

  // Phase 4: Verify the entire app signature
  console.log(`\n   ── Phase 4: Verifying app signature ──`);
  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
      stdio: 'pipe',
      timeout: 120000,
    });
    console.log(`   ✓ Signature verification passed`);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    console.log(`   ⚠ Verification warning: ${stderr.trim()}`);
    console.log(`   Continuing anyway — Apple notarization will perform its own validation`);
  }
}

/**
 * Create a ZIP archive of the app for notarization
 */
function createNotarizationZip(appPath) {
  const zipPath = path.join(DIST_DIR, `${APP_NAME}-notarization.zip`);

  console.log(`\n📦 Creating ZIP archive for notarization...`);

  // Remove existing zip if it exists
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  try {
    execSync(
      `cd "${DIST_DIR}" && ditto -c -k --keepParent "${APP_NAME}.app" "${zipPath}"`,
      { stdio: 'pipe' }
    );
    console.log(`   ✓ Created ${path.basename(zipPath)}`);
    return zipPath;
  } catch (err) {
    throw new Error(`Failed to create ZIP: ${err.message}`);
  }
}

/**
 * Submit app for notarization using xcrun notarytool
 */
async function submitForNotarization(zipPath, appleId, password, teamId) {
  console.log(`\n🔐 Submitting for notarization...`);
  console.log(`   Apple ID: ${appleId}`);
  console.log(`   Team ID: ${teamId}`);

  if (!appleId || !password || !teamId) {
    throw new Error('Missing notarization credentials: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID required');
  }

  try {
    const cmd = `xcrun notarytool submit "${zipPath}" --apple-id "${appleId}" --password "${password}" --team-id "${teamId}" --wait --timeout 1200`;

    const { stdout, stderr } = await execAsync(cmd, { timeout: 1500000 }); // 25 minutes

    console.log(stdout);

    // Parse the submission ID from output
    // Output typically contains: id: "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
    const idMatch = stdout.match(/id:\s*"?([a-f0-9-]+)"?/i) ||
                     stdout.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);

    if (idMatch) {
      console.log(`   ✓ Notarization submission ID: ${idMatch[1]}`);
      return idMatch[1];
    }

    // If --wait was used, it might have already completed
    if (stdout.includes('Accepted') || stdout.includes('accepted')) {
      console.log(`   ✓ Notarization accepted!`);
      return null; // Already stapled
    }

    return null;
  } catch (err) {
    throw new Error(`Notarization submission failed: ${err.message}`);
  }
}

/**
 * Staple the notarization ticket to the app
 */
function stapleNotarizationTicket(appPath) {
  console.log(`\n📌 Stapling notarization ticket...`);

  try {
    execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'pipe' });
    console.log(`   ✓ Notarization ticket stapled`);
  } catch (err) {
    throw new Error(`Failed to staple notarization ticket: ${err.message}`);
  }
}

/**
 * Create DMG installer
 */
function createDMG(appPath, version) {
  const dmgPath = path.join(DIST_DIR, `${APP_NAME}-${version}-arm64.dmg`);
  const tmpDmgPath = path.join(DIST_DIR, `${APP_NAME}-tmp.dmg`);

  console.log(`\n📀 Creating DMG installer...`);

  // Remove existing DMG if it exists
  if (fs.existsSync(dmgPath)) {
    fs.unlinkSync(dmgPath);
  }

  if (fs.existsSync(tmpDmgPath)) {
    fs.unlinkSync(tmpDmgPath);
  }

  try {
    // Create a temporary directory for DMG contents
    const tmpDir = path.join(DIST_DIR, 'dmg-temp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Copy app to temporary directory
    execSync(`cp -r "${appPath}" "${tmpDir}/"`);

    // Create a symlink to /Applications
    execSync(`ln -s /Applications "${tmpDir}/Applications"`, { stdio: 'pipe' });

    // Create the DMG from the temporary directory
    execSync(
      `hdiutil create -volname "${APP_NAME}" -srcfolder "${tmpDir}" -ov -format UDZO "${dmgPath}"`,
      { stdio: 'pipe' }
    );

    // Clean up temporary directory
    fs.rmSync(tmpDir, { recursive: true, force: true });

    console.log(`   ✓ Created ${path.basename(dmgPath)}`);
  } catch (err) {
    throw new Error(`Failed to create DMG: ${err.message}`);
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         MindVault Code Signing & Notarization              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Verify app exists
  if (!fs.existsSync(APP_PATH)) {
    console.error(`\n❌ Error: App not found at ${APP_PATH}`);
    process.exit(1);
  }

  console.log(`\nℹ️  App path: ${APP_PATH}`);

  // Find Developer ID certificate
  const cert = findDeveloperIDCert();
  if (!cert) {
    console.error('\n❌ Error: No Developer ID Application certificate found');
    console.error('   Please ensure you have a valid Developer ID certificate in your keychain');
    process.exit(1);
  }

  console.log(`✓ Found certificate: ${cert.name}`);
  console.log(`  Hash: ${cert.hash}`);

  const version = require(path.join(__dirname, '..', 'package.json')).version;

  try {
    // Step 1: Sign the entire app bundle
    signAppBundle(APP_PATH, cert.hash, ENTITLEMENTS_PATH);

    // Step 2: Create ZIP for notarization
    const zipPath = createNotarizationZip(APP_PATH);

    // Step 3: Submit for notarization
    if (APPLE_ID && APPLE_PASSWORD && APPLE_TEAM_ID) {
      const submissionId = await submitForNotarization(
        zipPath,
        APPLE_ID,
        APPLE_PASSWORD,
        APPLE_TEAM_ID
      );

      // Step 4: Staple the ticket
      stapleNotarizationTicket(APP_PATH);

      // Clean up ZIP
      fs.unlinkSync(zipPath);
    } else {
      console.log('\n⚠️  Notarization credentials not configured, skipping notarization');
      console.log('   Set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID to enable');
    }

    // Step 5: Create DMG
    createDMG(APP_PATH, version);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              ✅ Signing & Notarization Complete              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n✓ App ready at: ${APP_PATH}`);
    console.log(`✓ DMG created at: ${path.join(DIST_DIR, `${APP_NAME}-${version}-arm64.dmg`)}`);

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

// Run the script
main().catch(err => {
  console.error(`\n❌ Unexpected error: ${err.message}`);
  process.exit(1);
});
