exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const body = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    // Mode 1: OCR from image
    if (body.mode === 'ocr') {
      const { imageBase64, imageMime } = body;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: imageMime, data: imageBase64 } },
              { text: 'Extract the release note text from this image. Return ONLY the raw plain text exactly as shown, preserving line breaks and bullet characters (• or *). No explanation, no markdown. Just the plain text.' }
            ]
          }]
        })
      });
      const data = await response.json();
      if (!response.ok) return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: data.error?.message || 'API error' }) };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) };
    }

    // Mode 2: Extract app info from Play Store URL
    if (body.mode === 'playstore') {
      const { storeUrl } = body;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Go to this Google Play Store URL and extract the following information:
URL: ${storeUrl}

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "appName": "full app name as shown on Play Store",
  "publisher": "developer/publisher name as shown on Play Store",
  "packageName": "package name from URL parameter id="
}

For packageName, extract it directly from the URL (the value after id=).
For appName and publisher, read from the Play Store page.`
            }]
          }],
          tools: [{ url_context: {} }]
        })
      });
      const data = await response.json();
      if (!response.ok) return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: data.error?.message || 'API error' }) };

      const text = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || '';
      // Extract package name from URL directly as fallback
      const pkgMatch = storeUrl.match(/[?&]id=([^&]+)/);
      const packageName = pkgMatch ? pkgMatch[1] : '';

      try {
        const clean = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        if (!parsed.packageName) parsed.packageName = packageName;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) };
      } catch {
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appName: '', publisher: '', packageName }) };
      }
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid mode' }) };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
