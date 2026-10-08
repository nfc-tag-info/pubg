import { build } from 'esbuild';
await build({ entryPoints: ['src/app.mjs'], outfile: 'assets/app.js', bundle: true,
  minify: true, format: 'esm', target: ['safari15', 'chrome100'], legalComments: 'eof' });
