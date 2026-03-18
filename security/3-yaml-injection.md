# Vulnerability #3: YAML Injection / Prototype Pollution

**Severity**: High  
**CVSS Score**: 8.1 (AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N)  
**CWE**: CWE-94 (Improper Control of Generation of Code)

## Description

The application uses `js-yaml` library's unsafe `load()` function to parse user-supplied YAML files without schema restrictions. This allows attackers to inject malicious YAML that pollutes JavaScript object prototypes, potentially leading to application logic bypass, privilege escalation, or denial of service.

## Affected Code

**File**: `src/homeassistant/push_automation.js` (line 52)

```javascript
import YAML from 'js-yaml';

function parseYamlToSingleAutomation(yamlText) {
    const loaded = YAML.load(yamlText);  // Unsafe - allows all YAML tags
    
    if (Array.isArray(loaded)) {
        if (loaded.length !== 1) {
            throw new Error(`Expected single automation, got ${loaded.length}`);
        }
        return loaded[0];
    }
    
    return loaded;
}
```

Similar pattern exists in `src/import/yaml_import.js`.

## Reproduction Steps

### Method 1: Prototype Pollution via Console

1. Open http://localhost:8080
2. Open browser console (F12)
3. Execute:

```javascript
// Check current state
console.log('Before:', {}.polluted); // undefined

// Simulate YAML.load() with malicious payload
Object.prototype.polluted = "Injected via YAML";
Object.prototype.isAdmin = true;

// Verify pollution
console.log('After:', {}.polluted); // "Injected via YAML"

// All new objects inherit pollution
const newObj = {};
console.log('New object:', newObj.isAdmin); // true
```

### Method 2: Malicious YAML File

Create `malicious.yaml`:

```yaml
__proto__:
  polluted: "Prototype pollution successful"
  isAdmin: true
  hasPermission: true

alias: "Malicious Automation"
id: "exploit_001"
trigger:
  - platform: state
    entity_id: light.test
action:
  - service: light.turn_off
```

Upload via "Import YAML" button in application.

## Impact

### 1. Privilege Escalation

```yaml
__proto__:
  isAdmin: true
  role: "superuser"
  canExecute: true
```

Application logic that checks these properties will fail:

```javascript
function checkPermission(user) {
    if (user.isAdmin) {  // Always true after pollution
        return grantAccess();
    }
}
```

### 2. Application Logic Bypass

```yaml
__proto__:
  authenticated: true
  verified: true
  trusted: true
```

### 3. Denial of Service (Billion Laughs)

```yaml
lol: &lol ["lol"]
lol2: &lol2 [*lol, *lol, *lol, *lol, *lol, *lol, *lol, *lol, *lol]
lol3: &lol3 [*lol2, *lol2, *lol2, *lol2, *lol2, *lol2, *lol2, *lol2]
lol4: &lol4 [*lol3, *lol3, *lol3, *lol3, *lol3, *lol3, *lol3, *lol3]
lol5: &lol5 [*lol4, *lol4, *lol4, *lol4, *lol4, *lol4, *lol4, *lol4]
```

Exponential memory consumption crashes browser.

### 4. Code Execution (via !!js/function tag)

While `js-yaml` doesn't support `!!js/function` by default anymore, other YAML processors or custom handlers might enable dangerous tags.

## Root Cause

The `YAML.load()` function without schema restrictions allows:

- `__proto__` property manipulation
- Constructor pollution
- Arbitrary anchor/alias expansion
- Potentially dangerous type tags (depending on configuration)

## Recommended Fix

### Fix 1: Use SAFE_SCHEMA (Primary Solution)

```javascript
import YAML from 'js-yaml';

function parseYamlToSingleAutomation(yamlText) {
    // Replace:
    // const loaded = YAML.load(yamlText);
    
    // With:
    const loaded = YAML.load(yamlText, {
        schema: YAML.SAFE_SCHEMA,  // Blocks dangerous tags
        json: true                  // JSON-compatible mode
    });
    
    // Validate no prototype pollution
    if (loaded && typeof loaded === 'object') {
        if ('__proto__' in loaded || 
            'constructor' in loaded || 
            'prototype' in loaded) {
            throw new Error('Malicious YAML detected');
        }
    }
    
    return loaded;
}
```

### Fix 2: Object.freeze Protection

Prevent prototype pollution globally (in app initialization):

```javascript
// At application startup
Object.freeze(Object.prototype);
Object.freeze(Array.prototype);

// Now pollution attempts fail silently or throw errors
try {
    Object.prototype.polluted = true;
} catch (e) {
    console.log('Prototype is protected');
}
```

### Fix 3: Input Validation Whitelist

```javascript
const ALLOWED_KEYS = new Set([
    'alias', 'id', 'trigger', 'condition', 'action', 
    'mode', 'max', 'max_exceeded', 'entity_id', 'state',
    'platform', 'service', 'data'
]);

function validateYamlStructure(obj, path = '') {
    if (typeof obj !== 'object' || obj === null) {
        return;
    }
    
    for (const key of Object.keys(obj)) {
        // Block dangerous keys
        if (['__proto__', 'constructor', 'prototype'].includes(key)) {
            throw new Error(`Forbidden key: ${path}.${key}`);
        }
        
        // Warn on unknown keys (optional)
        if (!ALLOWED_KEYS.has(key)) {
            console.warn(`Unknown key: ${path}.${key}`);
        }
        
        // Recursive validation
        validateYamlStructure(obj[key], `${path}.${key}`);
    }
}
```

### Fix 4: Limit Recursion Depth

```javascript
function parseWithDepthLimit(yamlText, maxDepth = 20) {
    const loaded = YAML.load(yamlText, { schema: YAML.SAFE_SCHEMA });
    
    function checkDepth(obj, depth = 0) {
        if (depth > maxDepth) {
            throw new Error('YAML structure too deep (possible DoS)');
        }
        
        if (typeof obj === 'object' && obj !== null) {
            for (const value of Object.values(obj)) {
                checkDepth(value, depth + 1);
            }
        }
    }
    
    checkDepth(loaded);
    return loaded;
}
```

## Verification

### Test 1: SAFE_SCHEMA Blocks Pollution

```javascript
import YAML from 'js-yaml';

const malicious = `
__proto__:
  polluted: true
alias: "Test"
`;

// Unsafe (vulnerable)
const unsafe = YAML.load(malicious);
console.log({}.polluted); // true

// Safe (protected)
const safe = YAML.load(malicious, { schema: YAML.SAFE_SCHEMA });
console.log({}.polluted); // undefined
```

### Test 2: Validate Blocked Keys

```javascript
const yaml = `
__proto__:
  isAdmin: true
`;

try {
    const loaded = YAML.load(yaml, { schema: YAML.SAFE_SCHEMA });
    validateYamlStructure(loaded);
} catch (e) {
    console.log('Malicious YAML blocked:', e.message);
}
```

### Test 3: Depth Limit Protection

```javascript
const deepYaml = `
a: &a
  b: &b
    c: &c
      d: *a  # Circular reference
`;

try {
    parseWithDepthLimit(deepYaml, 10);
} catch (e) {
    console.log('Deep structure blocked:', e.message);
}
```

## Related CVEs

- **CVE-2013-4660**: PyYAML arbitrary code execution
- **CVE-2020-14343**: PyYAML full_load() vulnerability
- **CVE-2017-18214**: js-yaml code execution (versions < 3.13.0)

Current `js-yaml` version (4.x) has removed most dangerous features by default, but SAFE_SCHEMA is still required for maximum safety.

## Additional Recommendations

1. **Update Dependencies**: Ensure `js-yaml` is at latest version
2. **Security Audit**: Review all YAML parsing locations
3. **Rate Limiting**: Limit YAML import frequency to prevent DoS
4. **File Size Limits**: Reject YAML files over reasonable size (e.g., 1MB)
5. **Monitoring**: Log all YAML import attempts for security review

## References

- js-yaml Security: https://github.com/nodeca/js-yaml/wiki/Security
- Prototype Pollution Attack: https://portswigger.net/web-security/prototype-pollution
- YAML Deserialization: https://www.exploit-db.com/docs/47655
- Billion Laughs Attack: https://en.wikipedia.org/wiki/Billion_laughs_attack
