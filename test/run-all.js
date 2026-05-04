/**
 * CtrlK Unified Test Runner
 * Run: node test/run-all.js
 */
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const phases = [
  { name: 'Phase 1 (State & Fields)', file: 'test/phase1.js' },
  { name: 'Phase 2 (Power Layer)', file: 'test/phase2.js' },
  { name: 'Phase 3 (Navigation & Session)', file: 'test/phase3.js' },
  { name: 'ViewShare (Shareable Views)', file: 'test/share.js' },
];

console.log('\n  ╔══════════════════════════════════════╗');
console.log('  ║     CtrlK Unified Test Suite         ║');
console.log('  ╚══════════════════════════════════════╝\n');

let totalPassed = 0;
let totalFailed = 0;
let allPassed = true;

for (const phase of phases) {
  console.log(`  ── ${phase.name} ──`);
  try {
    const output = execSync(`node ${join(root, phase.file)}`, {
      cwd: root,
      encoding: 'utf-8',
      timeout: 30000,
    });
    console.log(output);

    // Parse results
    const passedMatch = output.match(/Passed:\s*(\d+)/);
    const failedMatch = output.match(/Failed:\s*(\d+)/);
    if (passedMatch) totalPassed += parseInt(passedMatch[1], 10);
    if (failedMatch) { totalFailed += parseInt(failedMatch[1], 10); allPassed = false; }
  } catch (err) {
    console.log(err.stdout || '');
    console.log(`  ✗ ${phase.name} FAILED`);
    const passedMatch = (err.stdout || '').match(/Passed:\s*(\d+)/);
    const failedMatch = (err.stdout || '').match(/Failed:\s*(\d+)/);
    if (passedMatch) totalPassed += parseInt(passedMatch[1], 10);
    if (failedMatch) totalFailed += parseInt(failedMatch[1], 10);
    allPassed = false;
  }
}

console.log('  ╔══════════════════════════════════════╗');
console.log('  ║     COMBINED RESULTS                 ║');
console.log('  ╠══════════════════════════════════════╣');
console.log(`  ║  ✓ Passed:  ${String(totalPassed).padStart(4)}                     ║`);
if (totalFailed > 0) {
  console.log(`  ║  ✗ Failed:  ${String(totalFailed).padStart(4)}                     ║`);
}
console.log(`  ║  Total:    ${String(totalPassed + totalFailed).padStart(4)}                     ║`);
console.log('  ╚══════════════════════════════════════╝\n');

process.exit(allPassed ? 0 : 1);
