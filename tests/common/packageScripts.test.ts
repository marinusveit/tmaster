import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  scripts?: Record<string, string>;
}

const readPackageManifest = (): PackageManifest => {
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const packageJsonContent = readFileSync(packageJsonPath, 'utf8');
  return JSON.parse(packageJsonContent) as PackageManifest;
};

describe('package scripts', () => {
  it('rebuild native modules for the matching runtime entrypoint', () => {
    const manifest = readPackageManifest();
    const scripts = manifest.scripts ?? {};

    expect(scripts['rebuild:native:electron']).toBe('electron-rebuild -f -w node-pty,better-sqlite3');
    expect(scripts['rebuild:native:node']).toBe(
      'cross-env npm_config_runtime=node pnpm rebuild node-pty better-sqlite3',
    );
    expect(scripts.postinstall).toBe('pnpm run rebuild:native:electron');
    expect(scripts['predev:electron']).toBe('pnpm run rebuild:native:electron');
    expect(scripts.prestart).toBe('pnpm run rebuild:native:electron');
    expect(scripts.pretest).toBe('pnpm run rebuild:native:node');
    expect(scripts.posttest).toBeUndefined();
  });
});
