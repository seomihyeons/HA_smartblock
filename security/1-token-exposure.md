# Vulnerability #1: Client-Side API Token Exposure

**Severity**: Critical  
**CVSS Score**: 9.1 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)  
**CWE**: CWE-200 (Exposure of Sensitive Information)

## Description

Home Assistant Long-Lived Access Token is embedded directly into the client-side JavaScript bundle through webpack DefinePlugin. Anyone with access to the web application can extract this token using browser developer tools.

## Affected Code

**File**: `webpack.config.js` (lines 41-44)

```javascript
new webpack.DefinePlugin({
  __HA_BASE_URL__: JSON.stringify(process.env.HA_BASE_URL),
  __HA_TOKEN__: JSON.stringify(process.env.HA_TOKEN),  // Vulnerability
})
```

**Runtime**: Token is accessible as global variable `__HA_TOKEN__`

## Reproduction Steps

1. Start development server:
```bash
cd HA_smartblock
npm run start
```

2. Open browser to http://localhost:8080

3. Open developer console (F12)

4. Execute:
```javascript
console.log(__HA_TOKEN__);
```

**Result**: Full Home Assistant API token is displayed.

## Production Build Verification

```bash
npm run build
grep -o "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[^\"]*" dist/bundle.js
```

Token appears in minified production bundle.

## Impact

With the extracted token, an attacker can:

- Query all Home Assistant entities and their states
- Control all connected devices (lights, locks, cameras, thermostats)
- Modify or delete automation rules
- Access camera feeds and sensor data
- Unlock doors or disable security systems

**Physical Security Risk**: Direct control over door locks, garage doors, and security cameras.

## Exploitation Example

```bash
TOKEN="[extracted_token]"
HA_URL="http://192.168.1.100:8123"

# List all devices
curl -H "Authorization: Bearer $TOKEN" \
     "$HA_URL/api/states"

# Unlock front door
curl -X POST \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"entity_id": "lock.front_door"}' \
     "$HA_URL/api/services/lock/unlock"
```

## Root Cause

Webpack DefinePlugin performs string replacement at build time, replacing `__HA_TOKEN__` with the actual token value throughout the codebase. This is fundamentally insecure for secrets.

## Recommended Fix

**Backend Proxy Implementation** (Express.js example):

```javascript
// server.js
const express = require('express');
const fetch = require('node-fetch');

const app = express();
const HA_TOKEN = process.env.HA_TOKEN; // Server-side only
const HA_URL = process.env.HA_BASE_URL;

app.use(express.json());

// Proxy all /api/ha/* requests
app.use('/api/ha', async (req, res) => {
  const path = req.originalUrl.replace('/api/ha', '');
  
  const response = await fetch(`${HA_URL}${path}`, {
    method: req.method,
    headers: {
      'Authorization': `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
  });
  
  const data = await response.json();
  res.json(data);
});

app.listen(3000);
```

**Client-side changes**:

Remove from `webpack.config.js`:
```javascript
// DELETE THIS:
new webpack.DefinePlugin({
  __HA_TOKEN__: JSON.stringify(process.env.HA_TOKEN),
})
```

Update API calls:
```javascript
// Before (insecure):
fetch('http://192.168.1.100:8123/api/states', {
  headers: { 'Authorization': `Bearer ${__HA_TOKEN__}` }
});

// After (secure):
fetch('/api/ha/states', {
  credentials: 'include' // Use session cookies
});
```

## Verification

After fix, verify:

1. Browser console: `typeof __HA_TOKEN__` returns `"undefined"`
2. Source code search: No token strings in `dist/bundle.js`
3. Network tab: All requests go through `/api/ha/*` proxy

## References

- OWASP: Hardcoded Secrets in Source Code
- CWE-798: Use of Hard-coded Credentials
- NIST SP 800-53: Credential Management
