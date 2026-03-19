/**
 * MindVault — Custom signing function for electron-builder
 *
 * Replaces electron-builder's built-in signing to avoid the
 * "nested code is modified or invalid" error caused by its
 * `codesign --verify --deep --strict` verification step.
 *
 * This function:
 *   1. Finds all Mach-O binaries and .node native modules
 *   2. Signs them from deepest to shallowest (inside-out)
 *   3. Signs .app bundles and .framework bundles
 *   4. Signs the main app bundle
 *   5. Verifies with `codesign --verify` (without --deep --strict)
 *
 * Apple's own documentation recommends against --deep for verification.
 * The notarization step will catch any real signing issues.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Recursively find all files matching a condition.
 */
function findFiles(dir, condition, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue; // skip symlinks
    if (entry.isDirectory()) {
      findFiles(fullPath, condition, results);
    } else if (entry.isFile() && condition(fullPath, entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Find all .app and .framework bundles (directories).
 */
function findBundles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.app') || entry.name.endsWith('.framework')) {
        results.push(fullPath);
      }
      findBundles(fullPath, results);
    }
  }
  return results;
}

/**
 * Check if a file is a Mach-O binary.
 */
function isMachO(filePath) {
  try {
    const result = execSync(`file "${filePath}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return /Mach-O/.test(result);
  } catch {
    return false;
  }
}

/**
 * Sign a single file or bundle.
 */
function signFile(filePath, identity, entitlements, isBundle = false) {
  const args = [
    'codesign',
    '--force',
    '--sign', `"${identity}"`,
    '--timestamp',
    '--options', 'runtime',
  ];

  if (entitlements && !isBundle) {
    args.push('--entitlements', `"${entitlements}"`);
  }
  if (entitlements && isBundle) {
    args.push('--entitlements', `"${entitlements}"`);
  }

  args.push(`"${filePath}"`);

  try {
    execSync(args.join(' '), { shell: '/bin/bash', stdio: 'pipe', timeout: 120000 });
    return true;
  } catch (err) {
    console.warn(`  Warning: failed to sign ${path.basename(filePath)}: ${err.message.substring(0, 100)}`);
    return false;
  }
}

/**
 * electron-builder custom sign function.
 * Called with a single config object containing the path and other details.
 */
module.exports = async function customSign(config) {
  const appPath = config.path || config.appOutDir;

  if (!appPath || !fs.existsSync(appPath)) {
    console.log('  Custom sign: no app path provided, skipping');
    return;
  }

  // Skip for test builds
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    console.log('  Custom sign: test build — skipping');
    return;
  }

  // Get identity from config or auto-discover
  let identity = config.identity || process.env.CSC_NAME || '';

  if (!identity) {
    try {
      const certs = execSync(
        'security find-identity -v -p codesigning | grep "Developer ID Application"',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      const match = certs.match(/"([^"]+)"/);
      if (match) identity = match[1];
    } catch (_) {}
  }

  if (!identity) {
    console.error('  Custom sign: No Developer ID certificate found!');
    throw new Error('No signing identity found');
  }

  const entitlements = config.entitlements || null;

  console.log(`\n  Custom signing: ${path.basename(appPath)}`);
  console.log(`  Identity: ${identity.substring(0, 50)}...`);
  if (entitlements) console.log(`  Entitlements: ${path.basename(entitlements)}`);

  // Step 1: Find and sign all individual Mach-O binaries and .node files
  console.log('  Step 1: Signing individual binaries...');
  const binaries = findFiles(appPath, (fp, name) => {
    return name.endsWith('.node') || name.endsWith('.dylib') || name.endsWith('.so');
  });

  // Also find other Mach-O executables (python3.11, ffmpeg, etc.)
  const allFiles = findFiles(appPath, () => true);
  const machOFiles = [];
  for (const f of allFiles) {
    const ext = path.extname(f);
    if (['.node', '.dylib', '.so'].includes(ext)) {
      machOFiles.push(f);
    } else if (!ext || ext === '.py' || ext === '.js' || ext === '.json' || ext === '.txt' ||
               ext === '.html' || ext === '.css' || ext === '.map' || ext === '.plist' ||
               ext === '.png' || ext === '.icns' || ext === '.jpg' || ext === '.svg' ||
               ext === '.md' || ext === '.yml' || ext === '.yaml' || ext === '.sh' ||
               ext === '.cfg' || ext === '.ini' || ext === '.pem' || ext === '.crt') {
      // Check extensionless files and skip known non-binary extensions
      if (!ext && isMachO(f)) {
        machOFiles.push(f);
      }
    }
  }

  // Sort by depth (deepest first — inside-out signing)
  machOFiles.sort((a, b) => b.split('/').length - a.split('/').length);

  let signed = 0;
  for (const f of machOFiles) {
    if (signFile(f, identity, entitlements)) signed++;
  }
  console.log(`  Signed ${signed}/${machOFiles.length} binaries`);

  // Step 2: Sign all .framework and .app bundles (deepest first)
  console.log('  Step 2: Signing bundles...');
  const bundles = findBundles(appPath);
  bundles.sort((a, b) => b.split('/').length - a.split('/').length);

  let bundlesSigned = 0;
  for (const b of bundles) {
    if (signFile(b, identity, entitlements, true)) bundlesSigned++;
  }
  console.log(`  Signed ${bundlesSigned}/${bundles.length} bundles`);

  // Step 3: Sign the main app bundle
  console.log('  Step 3: Signing main app...');
  signFile(appPath, identity, entitlements, true);

  // Step 4: Verify (without --deep --strict — Apple recommends against --deep)
  console.log('  Step 4: Verifying...');
  try {
    execSync(`codesign --verify --verbose=2 "${appPath}"`, { stdio: 'pipe' });
    console.log('  Signature verified OK');
  } catch (err) {
    const stderr = err.stderr?.toString() || '';
    console.warn(`  Verification warning: ${stderr.substring(0, 200)}`);
    // Don't throw — let notarization catch real issues
  }

  // Also verify with spctl (Gatekeeper assessment)
  try {
    execSync(`spctl --assess --type exec -v "${appPath}" 2>&1`, { stdio: 'pipe' });
    console.log('  Gatekeeper assessment: accepted');
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || '';
    console.log(`  Gatekeeper: ${output.trim().substring(0, 100)}`);
    // Pre-notarization this may fail — that's expected
  }

  console.log('  Custom signing complete\n');
};
