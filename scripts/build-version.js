#!/usr/bin/env node
// Prints the STATIC desktop-build version: the build date as YY.M.D (e.g. 26.6.14).
//
// The `dist:*` npm scripts feed this to electron-builder via
// `-c.extraMetadata.version=$(node scripts/build-version.js)`, so every packaged app
// carries a fixed version stamped at build time. This is deliberately decoupled from the
// web app's live, commit-derived YY.M.<commit count> version (see app/app.js): desktop
// builds don't self-update, so their number reflects *when they were built*, not the
// current tip of the repo.
const d = new Date();
process.stdout.write(
  `${String(d.getFullYear()).slice(-2)}.${d.getMonth() + 1}.${d.getDate()}`
);
