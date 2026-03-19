/**
 * Creates a DMG from the unsigned app bundle for testing.
 *
 * Works around macOS TCC restrictions that prevent hdiutil from
 * accessing .app bundles directly in project directories by
 * copying to a temp location first.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const distDir = path.join(__dirname, '..', 'dist');
const appDir = path.join(distDir, 'mac-arm64');
const appPath = path.join(appDir, 'MindVault.app');
const dmgOut = path.join(distDir, 'MindVault-test.dmg');

if (!fs.existsSync(appPath)) {
  console.error(`App not found at ${appPath}`);
  process.exit(1);
}

// Clean previous DMG
if (fs.existsSync(dmgOut)) fs.unlinkSync(dmgOut);

const tmpApp = path.join(os.tmpdir(), 'MindVault-dmg-staging', 'MindVault.app');
const tmpDir = path.dirname(tmpApp);

console.log('\n📦 Creating test DMG...');

// Clean and copy to temp
if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });
execSync(`cp -R "${appPath}" "${tmpApp}"`);

// Create DMG
execSync(`hdiutil create -srcfolder "${tmpApp}" -volname "MindVault" -format UDZO -fs APFS "${dmgOut}"`);

// Clean up
fs.rmSync(tmpDir, { recursive: true });

console.log(`✅ DMG created: ${dmgOut}\n`);
