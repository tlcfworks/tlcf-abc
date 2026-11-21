# ABC distribution

All three installations run the same Windows-local application. Provider authentication remains in the native CLIs. Package installation, updates and runtime downloads need an internet connection; the dashboard is hosted only on 127.0.0.1.

## npm registry

Once the maintainer publishes version 1.0.1:

```powershell
npm install -g tlcf-abc
tlcf-abc
```

Node.js 24 or later is required. `tlcf-abc --no-open` starts without opening the browser; `tlcf-abc --port 4320` changes the port. `tlcf-abc --version` reports the version. Close with Ctrl+C.

Before npm publication, install the release tarball locally instead:

```powershell
npm install -g .\tlcf-abc-1.0.1.tgz
tlcf-abc
```

The registry tarball is `release/tlcf-abc-1.0.1.tgz`. It contains precompiled JavaScript, the browser files, documentation and license. There are no runtime dependencies or install scripts. No compilation or TypeScript loader runs on users' machines.

Maintainer publication (not executed by the build scripts):

```powershell
npm login --registry=https://registry.npmjs.org
npm publish .\release\tlcf-abc-1.0.1.tgz --registry=https://registry.npmjs.org --access=public
```

The npm account that publishes the first version owns the unscoped package name. A registry authentication or two-factor prompt must be completed by the maintainer. Do not put npm credentials in the repository or release files.

## GitHub source checkout

```powershell
git clone https://github.com/tlcfworks/tlcf-abc.git
cd tlcf-abc
npm ci
npm start
```

`npm start` compiles TypeScript and launches the local dashboard. After the initial build, Windows users can double-click `start.cmd`. Source installs require Node.js 24+, npm and Git. Changing between installation methods keeps the same local data directory.

## Windows ZIP

Download `tlcf-abc-1.0.1-windows-x64.zip` from https://github.com/tlcfworks/tlcf-abc/releases and extract it completely. Double-click `start.cmd`. The default browser opens automatically. Keep its terminal window open; Ctrl+C stops ABC. Node.js and npm do not need to be installed.

The ZIP includes the compiled app, a checksum-verified official Node.js runtime and its license. It does not include your provider CLIs or subscriptions. Install and sign in to the providers you want to monitor separately. Keep the extracted folder in place while monitoring is enabled: collector commands reference its runtime and application paths. Disable monitoring before moving or removing that installation, then enable it from the new location. Windows may show a warning for downloaded unsigned software; no administrator privileges are required by ABC.

The bundled runtime version and official archive checksum appear in `runtime/manifest.json`. Artifact checksums are published alongside the release in `SHA256SUMS.txt`. The initial ZIP targets Windows x64; the packaging script also accepts `-Architecture arm64`, but an ARM64 runtime has not been tested on this x64 machine.

## GitHub Packages mirror

The separate GitHub registry tarball is `release/tlcfworks-tlcf-abc-1.0.1.tgz`, named `@tlcfworks/tlcf-abc`. It contains the same application as the npm tarball. GitHub Packages currently requires an authenticated GitHub account and a classic token with package-read permission even for public npm packages; the public npm registry and ZIP are the simpler download methods.

Authenticate through npm's supported login flow, never by copying a token into this repository:

```powershell
npm login --scope=@tlcfworks --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @tlcfworks/tlcf-abc --registry=https://npm.pkg.github.com
tlcf-abc
```

GitHub registry documentation: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry

## Build and validate releases

```powershell
npm ci
npm run check
npm run build
npm test
npm run release:pack
npm run release:verify
npm run release:windows
```

`release:verify` installs the actual tarball in an isolated prefix and exercises the installed CLI, served assets and enable/collect/disable flow using a temporary provider fixture. Production collectors contain no mocked values. Live provider validation is separate: `npm run verify:live` uses existing provider authentication without running inference. Release scripts never publish to npm automatically.

The GitHub Actions CI performs the source build and tarball-install checks on Windows. A manually triggered release-artifact workflow additionally builds the ZIP. Publishing a registry package or GitHub release is a separate maintainer action.
