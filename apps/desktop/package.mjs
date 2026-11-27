// Packages the desktop app for this computer's platform into out/, unsigned.
// Run `npm run package -w @pass1/desktop` (it builds the web app and the main process first).
//
// TODO: code signing and notarization (macOS), signing (Windows), and installers (.dmg, .exe,
// AppImage, .deb). They need paid certificates, so they wait until releases are public.

import { flipFuses, FuseV1Options, FuseVersion } from "@electron/fuses";
import { packager } from "@electron/packager";
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";

// The web build goes into the app's resources as "web" (see webBuildFolder() in src/main.ts).
const STAGED_WEB = join("build", "web");
rmSync("build", { recursive: true, force: true });
cpSync(join("..", "web", "dist"), STAGED_WEB, { recursive: true });

const [appPath] = await packager({
  dir: ".",
  out: "out",
  overwrite: true,
  name: "pass1",
  appBundleId: "app.pass1.desktop",
  // The app's code in one archive, checked against a hash at startup (fuse below).
  asar: true,
  extraResource: [STAGED_WEB],
  // Only the bundled main process and package.json go in: everything else is bundled or unused.
  ignore: [/^\/(src|build|out|node_modules)(\/|$)/, /^\/(build|package)\.mjs$/, /^\/tsconfig\.json$/],
});

// Electron features pass1 never uses, switched off inside the binary itself, so nobody can turn
// them back on with a command-line flag or environment variable.
const binary = {
  darwin: join(appPath, "pass1.app", "Contents", "MacOS", "pass1"),
  win32: join(appPath, "pass1.exe"),
  linux: join(appPath, "pass1"),
}[process.platform];

await flipFuses(binary, {
  version: FuseVersion.V1,
  // Changing the binary breaks its signature; Apple Silicon refuses to run it without at least
  // an ad hoc one, so it's re-signed ad hoc.
  resetAdHocDarwinSignature: process.platform === "darwin",
  // No running the app as a plain Node.js process (ELECTRON_RUN_AS_NODE).
  [FuseV1Options.RunAsNode]: false,
  // No NODE_OPTIONS and no --inspect: nobody can inject code or attach a debugger from outside.
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  // Only the app's own archive is loaded, and only if it matches the hash recorded at packaging.
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  // file:// pages get no extra powers (pass1 never uses file://).
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
});

rmSync("build", { recursive: true, force: true });
console.log(`Packaged: ${appPath}`);
