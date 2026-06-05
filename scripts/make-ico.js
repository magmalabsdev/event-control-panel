// Generates build/icon.ico (multi-size) from build/icon.png.
// No native ico tooling is available on macOS, so this runs once before Windows builds.
const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const src = path.join(__dirname, '..', 'build', 'icon.png');
const out = path.join(__dirname, '..', 'build', 'icon.ico');

pngToIco(src)
  .then(buf => {
    fs.writeFileSync(out, buf);
    console.log(`Wrote ${out} (${buf.length} bytes)`);
  })
  .catch(err => {
    console.error('Failed to generate icon.ico:', err);
    process.exit(1);
  });
