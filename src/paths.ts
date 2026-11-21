import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
// Keep the original data location compatible with installations made before the ABC rename.
export const dataDir = resolve(process.env.ABC_DATA_DIR || process.env.QUOTA_DESK_DATA || join(process.env.LOCALAPPDATA || homedir(), 'QuotaDesk'));
const parent = resolve(import.meta.dirname, '..');
export const root = existsSync(join(parent, 'package.json')) ? parent : resolve(parent, '..');
export const statuslinePath = join(root, 'dist', 'scripts', 'statusline.js');
export const wrapperPath = join(root, 'dist', 'scripts', 'collector-wrapper.js');
