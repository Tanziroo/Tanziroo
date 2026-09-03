/* Syntax-check every inline <script> in every HTML page.
 * These pages have no build step, so a typo ships silently — this is the net. */
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html')).sort();
let bad = 0;
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, code = '', blocks = 0;
  while ((m = re.exec(html))) { code += m[1] + '\n'; blocks++; }
  try {
    new Function(code);
    // guard rails that already bit us once: a page must fail loud, not silent
    const surfaced = /showFatal/.test(html);
    const guarded = !/(?<!function )\bstart\(\);/.test(html) || /try\s*\{\s*start\(\)/.test(html);
    if (!surfaced || !guarded) {
      console.error(`  ✗ ${f} — ${!surfaced ? 'no error surface' : ''} ${!guarded ? 'unguarded start()' : ''}`);
      bad++;
    } else {
      console.log(`  ✓ ${f} (${blocks} script block${blocks === 1 ? '' : 's'})`);
    }
  } catch (e) {
    console.error(`  ✗ ${f} — SYNTAX ERROR: ${e.message}`);
    bad++;
  }
}
console.log(bad ? `\n${bad} page(s) failed` : `\nall ${files.length} pages OK`);
process.exit(bad ? 1 : 0);
