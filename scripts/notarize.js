/**
 * MindVault — macOS Notarization Hook
 *
 * Called automatically by electron-builder after signing (afterSign).
 * Submits the app to Apple for notarization so macOS Gatekeeper
 * accepts it without warnings on any Mac.
 *
 * Required env vars (add to backend/.env or export in terminal):
 *   APPLE_ID                    your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID               your Team ID from developer.apple.com/account
 *
 * To get your Team ID:
 *   → developer.apple.com/account → scroll to "Membership details"
 */

const { notarize } = require('@electron/notarize');
const path = require('path');

// Load env vars from backend/.env if not already set
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize on macOS
  if (electronPlatformName !== 'darwin') return;

  // Skip for test builds (no real code signing, so notarization would fail)
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    console.log('⚠️  Notarization skipped — test build (CSC_IDENTITY_AUTO_DISCOVERY=false)');
    return;
  }

  // Skip if credentials are not configured (dev builds without signing)
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('⚠️  Notarization skipped — APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`\n🔏 Notarizing ${appName}…`);
  console.log(`   App path: ${appPath}`);
  console.log(`   Apple ID: ${process.env.APPLE_ID}`);
  console.log(`   Team ID:  ${process.env.APPLE_TEAM_ID}`);

  try {
    await notarize({
      appPath,
      appleId:             process.env.APPLE_ID,
      appleIdPassword:     process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId:              process.env.APPLE_TEAM_ID,
    });
    console.log(`✅ Notarization complete!\n`);
  } catch (err) {
    console.error('❌ Notarization failed:', err.message);
    throw err;
  }
};
