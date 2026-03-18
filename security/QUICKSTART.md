# Quick Start Guide

## Prerequisites

- Node.js installed
- Git repository cloned
- 10 minutes for full reproduction

## Fastest Reproduction (2 minutes)

### Test 1: Token Exposure

```bash
cd HA_smartblock
npm install
npm run start
```

Open browser: http://localhost:8080

Press F12, then in console:
```javascript
console.log(__HA_TOKEN__);
```

**Expected**: Token is displayed (vulnerable).

---

### Test 2: XSS

In same browser console:
```javascript
const div = document.createElement('div');
div.innerHTML = '<img src=x onerror="alert(1)">';
document.body.appendChild(div);
```

**Expected**: Alert appears (vulnerable).

---

### Test 3: Prototype Pollution

In same browser console:
```javascript
console.log('Before:', {}.polluted);
Object.prototype.polluted = "test";
console.log('After:', {}.polluted);
```

**Expected**: Shows "test" in second log (vulnerable).

---

## Using Demo Page

```bash
cd security-report
python3 -m http.server 8888
```

Open: http://localhost:8888/poc/demo.html

Click each "Run Test" button.

---

## Applying Fixes

```bash
cd HA_smartblock

# Apply patches
git apply security-report/fixes/webpack.config.js.patch
git apply security-report/fixes/ha_pull_panel.js.patch
git apply security-report/fixes/push_automation.js.patch

# Verify
npm run build
grep "__HA_TOKEN__" dist/bundle.js  # Should return nothing
```

---

## Verification After Fix

1. Token test:
```javascript
typeof __HA_TOKEN__  // Should be "undefined"
```

2. XSS test:
```javascript
const div = document.createElement('div');
div.textContent = '<script>alert(1)</script>';  // Safe
document.body.appendChild(div);
// Script appears as text, not executed
```

3. Pollution test:
```javascript
Object.freeze(Object.prototype);
Object.prototype.test = "fail";  // Should throw or fail silently
```

---

## Production Build Check

```bash
npm run build

# Token should NOT appear in bundle
grep -r "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" dist/

# Exit code 1 = not found (good)
```

---

## Contact

For questions, see README.md for disclosure timeline and contact info.
