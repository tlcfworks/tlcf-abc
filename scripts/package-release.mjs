import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const release = join(root, 'release');
await mkdir(release, { recursive: true });
function npm(args, cwd = root) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw Error('Run this script with npm run release:pack.');
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return result.stdout;
}
const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', release]));
const meta = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const githubDir = join(release, 'github-package');
await mkdir(githubDir, { recursive: true });
for (const dir of ['bin', 'dist', 'public']) await cp(join(root, dir), join(githubDir, dir), { recursive: true });
for (const file of ['README.md', 'LICENSE']) await cp(join(root, file), join(githubDir, file));
await mkdir(join(githubDir, 'docs'), { recursive: true });
await cp(join(root, 'docs', 'feasibility.md'), join(githubDir, 'docs', 'feasibility.md'));
await cp(join(root, 'docs', 'distribution.md'), join(githubDir, 'docs', 'distribution.md'));
const scoped = { ...meta, name: '@tlcfworks/abc', publishConfig: { registry: 'https://npm.pkg.github.com' } };
delete scoped.scripts; delete scoped.devDependencies;
await writeFile(join(githubDir, 'package.json'), JSON.stringify(scoped, null, 2) + '\n');
const githubPack = JSON.parse(npm(['pack', '--json', '--pack-destination', release], githubDir));
const packages = [packed[0], githubPack[0]];
for (const item of packages) {
  const contents = item.files.map(f => f.path);
  if (contents.some(p => /(^|\/)(\.research|node_modules|accounts\.json|\.npmrc|auth\.json|\.credentials\.json|test)(\/|$)/.test(p))) throw Error('Unexpected private/development file in package.');
  if (contents.some(p => p.endsWith('.ts'))) throw Error('Published package must contain compiled JavaScript only.');
  if (!contents.includes('bin/abc.js') || !contents.includes('dist/scripts/statusline.js') || !contents.includes('dist/scripts/collector-wrapper.js') || !contents.includes('public/index.html')) throw Error('Required runtime asset missing.');
}
const checksums = await Promise.all(packages.map(async p => `${createHash('sha256').update(await readFile(join(release, p.filename))).digest('hex')}  ${p.filename}`));
await writeFile(join(release, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
console.log(`npm: ${join(release, packed[0].filename)}\nGitHub Packages: ${join(release, githubPack[0].filename)}\nBoth tarballs contain compiled runtime files only.`);
