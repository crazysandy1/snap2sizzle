const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

let genAI;
if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
} else {
    console.warn("Warning: GEMINI_API_KEY is not set. AI functionalities will not work.");
}

function extractJsonFromString(text) {
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```|(\{[\s\S]*?\})/);
    if (jsonMatch) {
        return jsonMatch[1] || jsonMatch[2];
    }
    return null;
}

async function searchIngredientImage(ingredientName) {
    try {
        // Using the free Wikipedia Action API for images, but using the generic SEARCH endpoint instead of exact title match.
        const query = encodeURIComponent(ingredientName);
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrlimit=1&prop=pageimages&format=json&pithumbsize=400&origin=*`;
        
        const response = await fetch(searchUrl);
        if (!response.ok) return null;

        const data = await response.json();
        
        if (data.query && data.query.pages) {
            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];
            
            // If the page has a thumbnail, return its URL
            if (pageId && pageId !== "-1" && pages[pageId].thumbnail && pages[pageId].thumbnail.source) {
                return pages[pageId].thumbnail.source;
            }
        }
        
        // Absolute fallback using Pollinations AI for guaranteed food image generation (No more placeholders!)
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(ingredientName + ' realistic food dish culinary')}?width=500&height=400&nologo=true`;
    } catch (error) {
        console.error(`DEBUG: Error during Wikipedia Image Search for "${ingredientName}":`, error.message);
        return null;
    }
}

app.post('/api/analyze-dish', upload.single('image'), async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded.' });
    }

    if (!GEMINI_API_KEY || !genAI) {
        return res.status(500).json({ error: 'Server configuration error: Gemini API Key is missing or AI not initialized.' });
    }

    try {
        const base64Image = req.file.buffer.toString('base64');
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const targetLanguage = req.body.language || 'English';
        const numAdults = req.body.adults || 1;
        const numKids = req.body.kids || 0;

        const prompt = `Analyze this food image and provide a detailed recipe in JSON format. The response must be in ${targetLanguage}.
        CRITICAL RULE: If the uploaded image does NOT depict food, meals, beverages, or culinary ingredients, you MUST reject it immediately. Return exactly this JSON: {"error": "Please upload a clear image of food or a dish."} and nothing else.
        
        The user wants to prepare this dish for exactly ${numAdults} Adult(s) and ${numKids} Kid(s).
        
        The JSON MUST strictly adhere to the following structure. Do NOT include any other text or markdown outside this JSON object.
        {
            "dishName": "string",
            "cuisineOrigin": "string (which side or region this food is famous)",
            "cuisineSpecialty": "string (short description about the speciality of the cuisine)",
            "prepTime": "string (e.g., '20 minutes', '1 hour')",
            "cookTime": "string (e.g., '45 minutes', '2 hours')",
            "serves": "string (Always output exactly: '${numAdults} Adults, ${numKids} Kids')",
            "ingredients": [
                {
                    "name": "string (Raw base ingredient name ONLY, e.g. 'sea salt', 'ramen noodles'. NO parentheses, NO cooking methods like 'chopped')", 
                    "quantity": "string (Total combined amount needed to serve EXACTLY ${numAdults} adults and ${numKids} kids combined)",
                    "substitute": {"name": "string", "reason": "short reason"} /* ONLY for minor, less impactful items! DO NOT substitute core ingredients that change the dish entirely. If no suitable minor substitute exists, output null here. */
                }
            ],
            "instructions": [
                "string (step 1 description)",
                "string (step 2 description)"
            ],
            "similarRecipes": [
                {"name": "string", "description": "string", "imageUrlSearchTerm": "string (brief english search term for this food)"}
            ]
        }
        If you cannot confidently identify the dish, return a JSON object with an 'error' field like: {"error": "Cannot confidently identify the dish. Please try another image."}.`;

        const imageParts = [
            {
                inlineData: {
                    mimeType: req.file.mimetype,
                    data: base64Image,
                },
            },
        ];

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }, ...imageParts] }],
            generationConfig: {
                responseMimeType: "text/plain",
            }
        };

        const MAX_RETRIES = 3;
        let responseData;
        
        for (let i = 0; i <= MAX_RETRIES; i++) {
            const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            responseData = await aiResponse.json();

            if (responseData.error && responseData.error.code === 429) {
                if (i === MAX_RETRIES) {
                    return res.status(429).json({ error: 'AI Rate limit exceeded. Please wait a moment and try again.' });
                }
                const waitTime = Math.pow(2, i) * 3000 + 2000;
                console.warn(`[Gemini] Rate limit hit (429). Retrying in ${waitTime}ms... (Attempt ${i+1}/${MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }
            break;
        }

        if (responseData.candidates && responseData.candidates.length > 0 && responseData.candidates[0].content && responseData.candidates[0].content.parts && responseData.candidates[0].content.parts.length > 0) {
            const rawAiText = responseData.candidates[0].content.parts[0].text;
            const jsonString = extractJsonFromString(rawAiText);

            if (!jsonString) {
                console.error('No valid JSON found in AI response:', rawAiText);
                return res.status(500).json({ error: 'AI did not return a valid JSON recipe. Please try again or with a clearer image.' });
            }

            let recipe;
            try {
                recipe = JSON.parse(jsonString);
            } catch (parseError) {
                console.error('Failed to parse extracted JSON:', jsonString, parseError);
                return res.status(500).json({ error: 'Failed to parse AI response into recipe. Please try again.' });
            }

            if (recipe.error) {
                return res.status(400).json({ error: recipe.error });
            }

            recipe.dishName = typeof recipe.dishName === 'string' ? recipe.dishName : 'Unknown Dish';
            recipe.prepTime = typeof recipe.prepTime === 'string' ? recipe.prepTime : 'N/A';
            recipe.cookTime = typeof recipe.cookTime === 'string' ? recipe.cookTime : 'N/A';
            recipe.ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
            recipe.instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];

            const ingredientImagePromises = recipe.ingredients.map(async (ingredient) => {
                if (!ingredient.name || typeof ingredient.name !== 'string') {
                    return { ...ingredient, image: `https://placehold.co/80x80/e2e8f0/94a3b8?text=No+Name` };
                }
                
                // Clean ingredient name for Spoonacular CDN
                let cleanName = ingredient.name.toLowerCase().replace(/\([^)]*\)/g, '').split(',')[0].trim();
                const stopwords = ['fresh ', 'dried ', 'chopped ', 'sliced ', 'diced ', 'minced ', 'ground ', 'raw ', 'cooked ', 'boiled '];
                for (const word of stopwords) {
                    if (cleanName.startsWith(word)) cleanName = cleanName.replace(word, '').trim();
                }
                
                const formattedName = cleanName.replace(/[^a-z0-9]+/g, '-');
                const imageUrl = formattedName ? `https://spoonacular.com/cdn/ingredients_100x100/${formattedName}.jpg` : `https://loremflickr.com/100/100/food,ingredient/all`;
                
                return { ...ingredient, image: imageUrl };
            });

            recipe.ingredients = await Promise.all(ingredientImagePromises);

            if (recipe.similarRecipes && Array.isArray(recipe.similarRecipes)) {
                const similarRecipeImagePromises = recipe.similarRecipes.map(async (simRecipe) => {
                    const searchTerm = simRecipe.imageUrlSearchTerm || simRecipe.name;
                    const imageUrl = await searchIngredientImage(searchTerm);
                    return { ...simRecipe, image: imageUrl || `https://loremflickr.com/300/200/food,${encodeURIComponent(simRecipe.name.split(' ')[0])}/all` };
                });
                recipe.similarRecipes = await Promise.all(similarRecipeImagePromises);
            }

            res.json(recipe);

        } else {
            console.error('Unexpected AI response structure (no candidates):', responseData);
            res.status(500).json({ error: 'Could not generate recipe. Unexpected AI response structure.' });
        }

    } catch (error) {
        console.error('Backend Error in /api/analyze-dish:', error);
        next(error);
    }
});

app.post('/api/translate-recipe', async (req, res, next) => {
    if (!GEMINI_API_KEY || !genAI) {
        return res.status(500).json({ error: 'Server configuration error: Gemini API Key is missing.' });
    }
    try {
        const { recipe, language } = req.body;
        if (!recipe || !language) return res.status(400).json({ error: 'Missing recipe or language data.' });

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Translate this entire JSON recipe object into ${language}. Keep the exact same JSON structure, keys, image URLs, and formatting. Only translate the string values (e.g., dishName, cuisineOrigin, cuisineSpecialty, prepTime, cookTime, serves, the "name" and "substitute.reason" in ingredients, instructions, and the "name" and "description" in similarRecipes). Do NOT translate "imageUrlSearchTerm" or ANY image URLs.
        
        Recipe JSON:
        ${JSON.stringify(recipe)}`;
        
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonString = extractJsonFromString(text);
        
        if (!jsonString) return res.status(500).json({ error: 'Failed to parse AI translation.' });
        res.json(JSON.parse(jsonString));
    } catch (error) {
        console.error('Translation Error:', error);
        res.status(500).json({ error: 'Failed to translate recipe.' });
    }
});

app.post('/api/generate-recipe-from-text', async (req, res, next) => {
    if (!GEMINI_API_KEY || !genAI) {
        return res.status(500).json({ error: 'Server configuration error: Gemini API Key is missing.' });
    }
    try {
        const dishName = req.body.dishName;
        const targetLanguage = req.body.language || 'English';
        const numAdults = req.body.adults || 1;
        const numKids = req.body.kids || 0;
        
        if (!dishName) {
            return res.status(400).json({ error: 'Missing dishName in request body.' });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Generate a detailed recipe for the dish "${dishName}" in JSON format. The response must be in ${targetLanguage}.
        The user wants to prepare this dish for exactly ${numAdults} Adult(s) and ${numKids} Kid(s).

        The JSON MUST strictly adhere to the following structure. Do NOT include any other text or markdown outside this JSON object.
        {
            "dishName": "string",
            "cuisineOrigin": "string (which side or region this food is famous)",
            "cuisineSpecialty": "string (short description about the speciality of the cuisine)",
            "prepTime": "string (e.g., '20 minutes', '1 hour')",
            "cookTime": "string (e.g., '45 minutes', '2 hours')",
            "serves": "string (Always output exactly: '${numAdults} Adults, ${numKids} Kids')",
            "ingredients": [
                {
                    "name": "string (Raw base ingredient name ONLY, e.g. 'sea salt', 'ramen noodles'. NO parentheses, NO cooking methods like 'chopped')", 
                    "quantity": "string (Total combined amount needed to serve EXACTLY ${numAdults} adults and ${numKids} kids combined)",
                    "substitute": {"name": "string", "reason": "short reason"} /* ONLY for minor, less impactful items! DO NOT substitute core ingredients that change the dish entirely. If no suitable minor substitute exists, output null here. */
                }
            ],
            "instructions": [
                "string (step 1 description)",
                "string (step 2 description)"
            ],
            "similarRecipes": [
                {"name": "string", "description": "string", "imageUrlSearchTerm": "string (brief english search term for this food)"}
            ]
        }`;

        const MAX_RETRIES = 3;
        let rawAiText;
        
        for (let i = 0; i <= MAX_RETRIES; i++) {
            try {
                const aiResponse = await model.generateContent(prompt);
                rawAiText = aiResponse.response.text();
                break;
            } catch (err) {
                if (err.status === 429 || (err.message && err.message.includes('429'))) {
                    if (i === MAX_RETRIES) return res.status(429).json({ error: 'AI Rate limit exceeded. Please wait a moment and try again.' });
                    const waitTime = Math.pow(2, i) * 3000 + 2000;
                    console.warn(`[Gemini] Rate limit hit (429). Retrying in ${waitTime}ms... (Attempt ${i+1}/${MAX_RETRIES})`);
                    await new Promise(r => setTimeout(r, waitTime));
                    continue;
                }
                throw err;
            }
        }

        const jsonString = extractJsonFromString(rawAiText);

        if (!jsonString) {
            return res.status(500).json({ error: 'AI did not return a valid JSON recipe.' });
        }

        const recipe = JSON.parse(jsonString);

        if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
            const ingredientImagePromises = recipe.ingredients.map(async (ingredient) => {
                if (!ingredient.name || typeof ingredient.name !== 'string') return ingredient;
                
                let cleanName = ingredient.name.toLowerCase().replace(/\([^)]*\)/g, '').split(',')[0].trim();
                const stopwords = ['fresh ', 'dried ', 'chopped ', 'sliced ', 'diced ', 'minced ', 'ground ', 'raw ', 'cooked ', 'boiled '];
                for (const word of stopwords) {
                    if (cleanName.startsWith(word)) cleanName = cleanName.replace(word, '').trim();
                }
                
                const formattedName = cleanName.replace(/[^a-z0-9]+/g, '-');
                const imageUrl = formattedName ? `https://spoonacular.com/cdn/ingredients_100x100/${formattedName}.jpg` : ingredient.image;
                
                return { ...ingredient, image: imageUrl };
            });
            recipe.ingredients = await Promise.all(ingredientImagePromises);
        }

        if (recipe.similarRecipes && Array.isArray(recipe.similarRecipes)) {
            const similarImagePromises = recipe.similarRecipes.map(async (simRecipe) => {
                const searchTerm = simRecipe.imageUrlSearchTerm || simRecipe.name;
                const imageUrl = await searchIngredientImage(searchTerm);
                return { ...simRecipe, image: imageUrl || `https://image.pollinations.ai/prompt/${encodeURIComponent(simRecipe.name + ' delicious food plate')}?width=300&height=200&nologo=true` };
            });
            recipe.similarRecipes = await Promise.all(similarImagePromises);
        }

        res.json(recipe);

    } catch (error) {
        console.error('Backend Error in /api/generate-recipe-from-text:', error);
        next(error);
    }
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'Image file is too large. Max 10MB allowed.' });
        }
        return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err.message === 'Only image files are allowed!') {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

app.use((err, req, res, next) => {
    console.error('Unhandled Backend Error:', err);
    res.status(500).json({ error: `An internal server error occurred: ${err.message || 'Unknown error'}.` });
});

// Explicit 404 handler for unmapped routes
app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server listening on http://localhost:${port}`);
    });
}

// Export for Vercel serverless deployment
module.exports = app;
