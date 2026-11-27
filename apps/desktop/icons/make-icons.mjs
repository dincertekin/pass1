// Renders the app icons from the two SVGs next to this file, and writes them in each platform's
// format: pass1.icns (macOS), pass1.ico (Windows), pass1.png (Linux, and the window icon), and
// pass1-macos.png (the Dock icon while developing, when there's no app bundle with the .icns).
// Run it after changing an SVG: `npm run icons -w @pass1/desktop`, then commit the
// results. Rendering uses Playwright's Chromium (the browser tests' own), so no image tool is
// needed; the .icns and .ico containers are simple enough to write here.

import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HERE = import.meta.dirname;
// Windows picks the closest size for each place it shows an icon (title bar, taskbar, Explorer).
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
// macOS icon types that hold PNG data, and their pixel sizes ("@2x" types are for Retina).
const ICNS_TYPES = [
  ["icp4", 16],
  ["icp5", 32],
  ["ic11", 32],
  ["ic12", 64],
  ["ic07", 128],
  ["ic13", 256],
  ["ic08", 256],
  ["ic14", 512],
  ["ic09", 512],
  ["ic10", 1024],
];
const LINUX_SIZE = 512;

/** Input: an SVG file and sizes. Output: a PNG (Buffer) per size, with a transparent background. */
async function renderPngs(browser, svgFile, sizes) {
  const svg = readFileSync(join(HERE, svgFile), "utf8");
  const page = await browser.newPage();
  const pngs = new Map();
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
    pngs.set(size, await page.screenshot({ omitBackground: true }));
  }
  await page.close();
  return pngs;
}

/** The .ico container: a directory of entries, each pointing at a PNG image (Windows Vista and later). */
function icoFile(pngs) {
  const entries = [...pngs.entries()];
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(([size, png], i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at); // 0 means 256
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4); // color planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map(([, png]) => png)]);
}

/** The .icns container: "icns" and its length, then each entry as type, length and PNG data. */
function icnsFile(pngs) {
  const chunks = ICNS_TYPES.map(([type, size]) => {
    const png = pngs.get(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}

// The installed Google Chrome, like the browser tests use locally; Playwright's own otherwise.
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const square = await renderPngs(browser, "pass1.svg", [...new Set([...ICO_SIZES, LINUX_SIZE])]);
const mac = await renderPngs(browser, "pass1-macos.svg", [...new Set(ICNS_TYPES.map(([, size]) => size))]);
await browser.close();

writeFileSync(join(HERE, "pass1.ico"), icoFile(new Map(ICO_SIZES.map((size) => [size, square.get(size)]))));
writeFileSync(join(HERE, "pass1.icns"), icnsFile(mac));
writeFileSync(join(HERE, "pass1.png"), square.get(LINUX_SIZE));
writeFileSync(join(HERE, "pass1-macos.png"), mac.get(LINUX_SIZE));
console.log("Wrote pass1.icns, pass1.ico, pass1.png and pass1-macos.png");
