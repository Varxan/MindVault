/**
 * rebuild-native.js
 *
 * Rebuilds better-sqlite3 against Electron's Node.js ABI before packaging.
 * Uses @electron/rebuild CLI for maximum compatibility.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const backendPath = path.join(root, 'backend');

// Get electron version from installed package
const electronPkg = path.join(root, 'node_modules', 'electron', 'package.json');
const electronVersion = JSON.parse(fs.readFileSync(electronPkg, 'utf8')).version;

// Path to electron-rebuild binary
const rebuildBin = path.join(root, 'node_modules', '.bin', 'electron-rebuild');

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║         Rebuilding native modules for Electron        ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log(`  Electron version : ${electronVersion}`);
console.log(`  Backend path     : ${backendPath}`);
console.log(`  Arch             : ${process.arch}`);
console.log(`  Module           : better-sqlite3\n`);

if (!fs.existsSync(rebuildBin)) {
  console.error('ERROR: electron-rebuild not found at:', rebuildBin);
  console.error('Run: npm install -D @electron/rebuild');
  process.exit(1);
}

try {
  execSync(
    `"${rebuildBin}" -f -w better-sqlite3 --module-dir "${backendPath}" --electron-version ${electronVersion} --arch ${process.arch}`,
    { stdio: 'inherit', cwd: root }
  );
  console.log('\n✅ Rebuild successful!\n');
} catch (err) {
  console.error('\n❌ Rebuild failed:', err.message);
  console.error('\nTrying fallback: npm rebuild with electron flags...\n');

  // Fallback: use npm rebuild with electron-specific flags
  try {
    const nodeABI = execSync(
      `node -e "process.versions.node"`,
      { cwd: root, encoding: 'utf8' }
    ).trim();

    execSync(
      `npm rebuild better-sqlite3 --runtime=electron --target=${electronVersion} --dist-url=https://electronjs.org/headers --arch=${process.arch}`,
      { stdio: 'inherit', cwd: backendPath }
    );
    console.log('\n✅ Fallback rebuild successful!\n');
  } catch (err2) {
    console.error('\n❌ Fallback also failed:', err2.message);
    console.error('\nManual fix: run the following in the backend folder:');
    console.error(`  cd backend && npm rebuild better-sqlite3 --runtime=electron --target=${electronVersion} --dist-url=https://electronjs.org/headers`);
    process.exit(1);
  }
}
