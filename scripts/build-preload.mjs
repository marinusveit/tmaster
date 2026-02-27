import { build, context } from 'esbuild';

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'es2022',
  outfile: 'dist/preload/index.js',
  format: 'cjs',
  external: ['electron'],
};

if (isWatch) {
  const ctx = await context(options);
  await ctx.watch();
  // eslint-disable-next-line no-console
  console.log('[preload] watching for changes...');
} else {
  await build(options);
}
