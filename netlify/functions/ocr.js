exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = { 'Content-Type': 'application/json' };

  try {
    const body = JSON.parse(event.body);
    const geminiKey = process.env.GEMINI_API_KEY;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;

    // Mode: OCR from image
    if (body.mode === 'ocr') {
      const { imageBase64, imageMime } = body;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: imageMime, data: imageBase64 } },
            { text: 'Extract the release note text from this image. Return ONLY the raw plain text exactly as shown, preserving line breaks and bullet characters. No explanation, no markdown.' }
          ]}]
        })
      });
      const data = await response.json();
      if (!response.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: data.error?.message || 'API error' }) };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { statusCode: 200, headers, body: JSON.stringify({ text }) };
    }

    // Mode: Extract app info from Play Store
    if (body.mode === 'playstore') {
      const { storeUrl } = body;

      // Extract packageName directly from URL
      const pkgMatch = storeUrl.match(/[?&]id=([^&]+)/);
      const packageName = pkgMatch ? pkgMatch[1] : '';

      // Fetch Play Store page HTML
      let appName = '';
      let publisher = '';
      try {
        const pageResp = await fetch(storeUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
        const html = await pageResp.text();

        // Extract app name from <title> tag: "App Name - Apps on Google Play"
        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        if (titleMatch) {
          appName = titleMatch[1].replace(/\s*-\s*Apps on Google Play.*$/i, '').trim();
        }

        // Extract publisher — look for itemprop="name" near author
        const publisherMatch = html.match(/itemprop="author"[^>]*>[\s\S]*?itemprop="name"[^>]*content="([^"]+)"/);
        if (publisherMatch) {
          publisher = publisherMatch[1].trim();
        } else {
          // Fallback: use Gemini to extract from HTML snippet
          const snippet = html.substring(0, 8000);
          const gemResp = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `From this Google Play Store HTML, extract the app name and publisher/developer name. Return ONLY JSON: {"appName":"...","publisher":"..."}\n\nHTML:\n${snippet}` }] }]
            })
          });
          const gemData = await gemResp.json();
          const gemText = gemData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const clean = gemText.replace(/```json|```/g, '').trim();
          try {
            const parsed = JSON.parse(clean);
            if (!appName) appName = parsed.appName || '';
            if (!publisher) publisher = parsed.publisher || '';
          } catch {}
        }
      } catch (fetchErr) {
        // If fetch fails, return what we have
      }

      return { statusCode: 200, headers, body: JSON.stringify({ appName, publisher, packageName }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid mode' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
