// Vercel Serverless Function — 네이버 캘린더 iCal(.ics) CORS 프록시
// GET /api/naver-ics?url=<iCal URL>
module.exports = async function handler(req, res) {
    const url = req.query && req.query.url;
    if (!url) {
        res.status(400).json({ error: 'missing url parameter' });
        return;
    }
    if (!/^https?:\/\//i.test(url)) {
        res.status(400).json({ error: 'url must start with http(s)://' });
        return;
    }
    try {
        const upstream = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (KLP Dashboard Calendar Sync)' },
            redirect: 'follow'
        });
        if (!upstream.ok) {
            res.status(upstream.status).json({ error: 'upstream status ' + upstream.status });
            return;
        }
        const text = await upstream.text();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.status(200).send(text);
    } catch (e) {
        res.status(500).json({ error: e.message || 'fetch failed' });
    }
};
