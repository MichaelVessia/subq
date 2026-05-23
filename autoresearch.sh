#!/usr/bin/env bash
set -u -o pipefail

failures=0
passed=0
log_dir=".autoresearch-logs"
mkdir -p "$log_dir"

run_check() {
  local name="$1"
  shift
  local log="$log_dir/${name}.log"
  echo "=== CHECK ${name} ==="
  if timeout 300s bash -lc "$*" >"$log" 2>&1; then
    echo "PASS ${name}"
    passed=$((passed + 1))
  else
    local status=$?
    echo "FAIL ${name} exit=${status}"
    tail -80 "$log" || true
    failures=$((failures + 1))
  fi
}

node_has_script() {
  local script="$1"
  node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['${script}'] ? 0 : 1)"
}

run_node_gate() {
  local name="$1"
  local js="$2"
  echo "=== CHECK ${name} ==="
  if node -e "$js"; then
    echo "PASS ${name}"
    passed=$((passed + 1))
  else
    echo "FAIL ${name}"
    failures=$((failures + 1))
  fi
}

# Real repo checks. These are allowed to fail during migration; the metric is
# the count. Do not weaken them to improve the score.
run_check typecheck "bun run typecheck"
run_check lint "bun run lint"
run_check format "bun run format"
run_check test "bun run test"
run_check knip "bun run knip"

if node_has_script validate; then
  run_check validate "bun run validate"
else
  echo "=== CHECK validate ==="
  echo "FAIL validate missing package.json script"
  failures=$((failures + 1))
fi

run_node_gate effect-v4-deps "
const fs = require('fs');
const paths = ['package.json', ...fs.readdirSync('packages').map((p) => 'packages/' + p + '/package.json').filter(fs.existsSync)];
const bad = [];
for (const path of paths) {
  const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const [name, version] of Object.entries(deps)) {
    if (name === 'effect' && !String(version).includes('4.')) bad.push(path + ' ' + name + '@' + version);
    if (name.startsWith('@effect/') && !['@effect/language-service', '@effect/tsgo'].includes(name) && !String(version).includes('4.')) bad.push(path + ' ' + name + '@' + version);
  }
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
"

run_node_gate effect-smol-reference "
const fs = require('fs');
const failures = [];
if (fs.existsSync('repos/effect')) failures.push('old repos/effect still exists');
if (!fs.existsSync('repos/effect-smol/LLMS.md')) failures.push('repos/effect-smol/LLMS.md missing');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
"

run_node_gate no-warden "
const fs = require('fs');
const forbidden = ['warden.toml', '.github/workflows/warden.yml'];
const found = forbidden.filter(fs.existsSync);
if (found.length) { console.error(found.join('\n')); process.exit(1); }
"

echo "METRIC failing_checks=${failures}"
echo "METRIC passed_checks=${passed}"
exit 0
