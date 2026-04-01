/**
 * MindVault — afterPack hook for electron-builder
 *
 * Runs after packaging but BEFORE electron-builder's code signing.
 *
 * This hook:
 *   1. Removes absolute/dangling symlinks
 *   2. Cleans up __pycache__ directories
 *   3. Signs ALL non-Electron Mach-O binaries with Developer ID
 *      (python-standalone, ffmpeg, yt-dlp, fsevents, sharp, etc.)
 *
 * After this hook completes, electron-builder signs the Electron parts
 * (Electron Framework, Helper apps, main binary) which it knows how to do correctly.
 * The patch-builder.js script patches out the --deep --strict verification so that
 * electron-builder doesn't fail when verifying our pre-signed binaries.
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

// ── Helpers ──────────────────────────────────────────────────────────────────

function removeBadSymlinks(dir) {
  let removed = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(fullPath);
      const resolvedTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(fullPath), target);
      const isAbsolute = path.isAbsolute(target);
      const isDangling = !fs.existsSync(resolvedTarget);
      if (isAbsolute || isDangling) {
        fs.unlinkSync(fullPath);
        removed++;
        const reason = isAbsolute ? 'absolute' : 'dangling';
        console.log(`  Removed ${reason} symlink: ${path.basename(fullPath)} -> ${target}`);
      }
    } else if (entry.isDirectory()) {
      removed += removeBadSymlinks(fullPath);
    }
  }
  return removed;
}

function removePycacheDirs(dir) {
  let removed = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__') {
        fs.rmSync(fullPath, { recursive: true, force: true });
        removed++;
      } else {
        removed += removePycacheDirs(fullPath);
      }
    }
  }
  return removed;
}

/**
 * Check if a file is a Mach-O binary (including fat/universal binaries)
 */
function isMachO(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (stat.size < 8) return false;

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);

    const magic = buffer.readUInt32LE(0);

    // Standard Mach-O magic numbers
    if (magic === 0xfeedfacf ||  // 64-bit LE
        magic === 0xcffaedfe ||  // 64-bit BE
        magic === 0xfeedface ||  // 32-bit LE
        magic === 0xcefaedfe) {  // 32-bit BE
      return true;
    }

    // Fat/universal binary magic: 0xcafebabe
    if (magic === 0xbebafeca || magic === 0xcafebabe) {
      const archCount = buffer.readUInt32BE(4);
      return archCount > 0 && archCount < 20 && stat.size > 4096;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Find the Developer ID Application certificate hash
 */
function findDeveloperIDCert() {
  try {
    const output = execSync(
      'security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | head -1',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (!output) return null;
    const match = output.match(/(\w{40})\s+"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Recursively find all Mach-O binaries in a directory, EXCLUDING Electron framework/helper dirs.
 * We skip Contents/Frameworks/ because electron-builder handles signing those.
 */
function findNonElectronBinaries(dir, appContentsDir) {
  const files = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip symlinks
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        // Skip the Frameworks directory — electron-builder signs those
        if (fullPath === path.join(appContentsDir, 'Frameworks')) {
          continue;
        }
        // Skip the MacOS directory — electron-builder signs the main binary
        if (fullPath === path.join(appContentsDir, 'MacOS')) {
          continue;
        }
        files.push(...findNonElectronBinaries(fullPath, appContentsDir));
      } else if (entry.isFile()) {
        if (isMachO(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.error(`  Error scanning ${dir}: ${err.message}`);
  }

  return files;
}

/**
 * Sign a single binary using execFileSync (safe with special characters in paths)
 */
function signBinary(filePath, identity, entitlements) {
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
    execFileSync('codesign', args, { stdio: 'pipe', timeout: 60000 });
    return true;
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    console.log(`    FAILED: ${stderr}`);
    return false;
  }
}

// ── Main Hook ────────────────────────────────────────────────────────────────

module.exports = async function afterPack(context) {
  const { appOutDir } = context;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const contentsDir = path.join(appPath, 'Contents');
  const resourcesDir = path.join(contentsDir, 'Resources');
  const entitlementsPath = path.join(__dirname, '..', 'electron', 'entitlements.mac.plist');

  console.log('\n  afterPack: Cleaning up bundle...');

  // 0. Replace .env with .env.dist — strip personal/build credentials from bundle
  const envDistSrc  = path.join(__dirname, '..', 'backend', '.env.dist');
  const envBundled  = path.join(resourcesDir, 'backend', '.env');
  if (fs.existsSync(envDistSrc)) {
    fs.copyFileSync(envDistSrc, envBundled);
    console.log('  ✅  .env replaced with .env.dist (personal credentials stripped)');
  } else {
    console.warn('  ⚠️  .env.dist not found — bundled .env may contain personal credentials!');
  }

  // 1. Remove absolute and dangling symlinks
  let symlinksRemoved = removeBadSymlinks(resourcesDir);
  symlinksRemoved += removeBadSymlinks(resourcesDir);
  console.log(`  Removed ${symlinksRemoved} bad symlink(s)`);

  // 2. Remove __pycache__ directories
  const pythonStandaloneDir = path.join(resourcesDir, 'backend', 'python-standalone');
  if (fs.existsSync(pythonStandaloneDir)) {
    const pycacheRemoved = removePycacheDirs(pythonStandaloneDir);
    console.log(`  Removed ${pycacheRemoved} __pycache__ director(ies) from python-standalone`);
  }

  // 3. Sign all non-Electron Mach-O binaries
  const certHash = findDeveloperIDCert();
  if (!certHash) {
    console.log('  ⚠ No Developer ID certificate found, skipping pre-signing');
    console.log('  Bundle cleanup complete\n');
    return;
  }

  console.log(`  Signing non-Electron binaries with Developer ID: ${certHash.substring(0, 8)}...`);

  const binaries = findNonElectronBinaries(contentsDir, contentsDir);

  // Sort by depth (deepest first = inside-out)
  binaries.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);

  console.log(`  Found ${binaries.length} non-Electron Mach-O binaries to sign`);

  let signed = 0;
  let failed = 0;

  for (const filePath of binaries) {
    const relPath = path.relative(appPath, filePath);
    if (signBinary(filePath, certHash, entitlementsPath)) {
      signed++;
      // Only log every 50th file + first and last to avoid spam
      if (signed <= 3 || signed % 50 === 0 || signed === binaries.length) {
        console.log(`    ✓ [${signed}/${binaries.length}] ${relPath}`);
      }
    } else {
      console.log(`    ✗ ${relPath} (failed)`);
      failed++;
    }
  }

  console.log(`  Pre-signing complete: ${signed} signed, ${failed} failed`);
  console.log('  Bundle cleanup complete\n');
};
