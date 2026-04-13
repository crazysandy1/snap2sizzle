require('dotenv').config();

async function testCurrentKey() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.log("No GEMINI_API_KEY found in .env");
        return;
    }

    console.log("Testing API Key...");
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!res.ok) {
            const err = await res.json();
            console.error("API Error Response:", JSON.stringify(err, null, 2));
        } else {
            const data = await res.json();
            console.log("API Key is working! Available models:");
            const models = data.models.map(m => m.name);
            console.log(models.join(", "));
            
            // Now test a tiny generateContent request to gemini-1.5-flash
            console.log("\nTesting text generation on gemini-1.5-flash...");
            const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: "Hello" }] }]
                })
            });
            
            if (!genRes.ok) {
                const genErr = await genRes.json();
                console.error("Generation Error:", JSON.stringify(genErr, null, 2));
            } else {
                console.log("Generation Success!");
            }
        }
    } catch (e) {
        console.error("Fetch failed:", e.message);
    }
}

testCurrentKey();
