// Ad-hoc code-sign the macOS app for UNSIGNED distribution builds.
//
// Without any signature the app bundle is invalid ("not signed at all") and carries
// Electron's default identifier with no entitlements. macOS TCC can't bind a microphone
// grant to such an app, so it re-prompts on every launch. Ad-hoc signing gives the bundle
// a valid, stable signature (cdhash) under our own identifier plus the audio-input
// entitlement, which lets the grant persist.
//
// Guarded by ADHOC_SIGN=1 so that real Developer ID builds (electron-builder's own signing)
// are never clobbered by this hook.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.ADHOC_SIGN !== '1') return;
  // Skip the per-arch intermediates of a `--universal` build: signing them separately makes
  // their code signatures diverge and breaks the @electron/universal merge. Universal builds
  // therefore can't be ad-hoc signed this way — build per-arch (x64 / arm64) instead.
  if (context.appOutDir.endsWith('-temp')) return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const entitlements = path.join(__dirname, 'entitlements.mac.plist');

  console.log(`  • ad-hoc signing (unsigned build) ${appName}`);
  execFileSync(
    'codesign',
    [
      '--force',
      '--deep',
      '--sign', '-',
      '--options', 'runtime',
      '--entitlements', entitlements,
      '--timestamp=none',
      appPath,
    ],
    { stdio: 'inherit' }
  );
};
