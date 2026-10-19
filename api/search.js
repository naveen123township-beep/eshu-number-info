export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ success: false, message: 'Query parameter "q" is required.' });
    }

    // Clean phone number (extract 10 digits)
    let cleaned = q.replace(/\+91/g, '').replace(/[\s\-\(\)]/g, '');
    if (cleaned.length > 10) {
        cleaned = cleaned.slice(-10);
    }

    // Correct target API endpoint using your new Cloudflare Worker URL and key
    const targetUrl = `https://devilswillrise.kotakmahindrabank9090.workers.dev/number?key=PROVIDER365&number=${cleaned}`;

    try {
        const apiResponse = await fetch(targetUrl);
        const data = await apiResponse.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('Backend fetch error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch from API server.' });
    }
}
