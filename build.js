/**
 * CtrlK Build Script — bundles all ES modules into a single IIFE.
 * Run: node build.js
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MODULES = [
  'src/core/event-bus.js',
  'src/core/command-registry.js',
  'src/keys/shortcut-engine.js',
  'src/palette/command-palette.js',
  'src/density/density-controller.js',
  'src/core/auto-discover.js',
  'src/grid/grid-adapter.js',
  'src/views/view-state-manager.js',
  'src/selection/selection-model.js',
  'src/fields/field-registry.js',
  'src/column-nav/column-navigator.js',
  'src/focus/focus-navigator.js',
  'src/session/session-tracker.js',
  'src/filter-bar/active-filter-bar.js',
  'src/macro/macro-engine.js',
  'src/history/history-manager.js',
  'src/share/view-share.js',
];

function build() {
  console.log('⚡ Building CtrlK v1.0.0 Runtime...\n');

  const parts = [];
  for (const file of MODULES) {
    const content = readFileSync(join(__dirname, file), 'utf-8')
      .replace(/^import\s+.*$/gm, '')
      .replace(/^export\s+/gm, '');
    parts.push(`  // ═══ ${file.split('/').pop()} ═══\n${content}`);
    console.log(`  ✓ ${file}`);
  }

  const entry = readFileSync(join(__dirname, 'src/ctrlk.js'), 'utf-8')
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+.*$/gm, '');

  const bundle = `/**
 * CtrlK v1.0.0 — Power-User Runtime for Enterprise Web Applications
 * ctrlk.dev · MIT License
 * 
 * 18 modules · 153 tests · Zero dependencies
 * 
 * Drop-in: <script src="ctrlk.runtime.js"><\/script>
 * The command palette opens with Ctrl+K. Zero config.
 * 
 * Built: ${new Date().toISOString()}
 */
(function(global) {
'use strict';

${parts.join('\n\n')}

  // ═══ ctrlk.js (main) ═══
${entry}

  // ═══ Global Export + Auto-Init ═══
  global.ctrlk = ctrlk;
  global.CtrlK = CtrlK;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { ctrlk.init(); });
  } else {
    ctrlk.init();
  }

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
`;

  mkdirSync(join(__dirname, 'dist'), { recursive: true });

  const outPath = join(__dirname, 'dist/ctrlk.runtime.js');
  writeFileSync(outPath, bundle);
  const sizeKB = (Buffer.byteLength(bundle) / 1024).toFixed(1);
  console.log(`\n  → dist/ctrlk.runtime.js (${sizeKB} KB)`);

  // Minified (basic)
  const minified = bundle
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/^\s*\n/gm, '')
    .replace(/\n\s*\n/g, '\n');
  const minPath = join(__dirname, 'dist/ctrlk.runtime.min.js');
  writeFileSync(minPath, minified);
  const minSizeKB = (Buffer.byteLength(minified) / 1024).toFixed(1);
  console.log(`  → dist/ctrlk.runtime.min.js (${minSizeKB} KB)`);

  console.log('\n⚡ Build complete!\n');
}

build();
