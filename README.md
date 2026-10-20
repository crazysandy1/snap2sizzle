# Snap2Sizzle

Snap a photo of a dish and get the recipe. Upload a food image, choose how many adults and kids you are cooking for, and an AI model returns a full recipe in your language: ingredients scaled to your group, step-by-step instructions, timings, the dish's cuisine origin, ingredient substitutes, and similar recipes.

Built with Node.js, Express and Google Gemini. Deployable to Vercel.

## Features

- **Photo to recipe.** Upload an image (up to 10 MB). Non-food images are rejected.
- **Text to recipe.** Type a dish name instead of uploading a photo.
- **Serving-size scaling.** Quantities are calculated for the number of adults and kids you enter.
- **Translation.** Generate in a chosen language, or translate an existing recipe.
- **Ingredient images** fetched from Wikipedia, and similar-recipe suggestions.
- **Substitutes** suggested for minor ingredients.

## Tech stack

Node.js, Express 4, Multer (in-memory uploads), `@google/generative-ai` (Gemini), vanilla HTML/CSS/JS front end in `public/`.

## API

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/api/analyze-dish` | multipart: `image`, `language`, `adults`, `kids` | Recipe from a photo |
| POST | `/api/generate-recipe-from-text` | JSON: `dishName`, `language`, `adults`, `kids` | Recipe from a dish name |
| POST | `/api/translate-recipe` | JSON: `recipe`, `language` | Translate a recipe JSON |

The recipe JSON contains `dishName`, `cuisineOrigin`, `cuisineSpecialty`, `prepTime`, `cookTime`, `serves`, `ingredients[]` (name, quantity, optional substitute), `instructions[]` and `similarRecipes[]`.

## Getting started

Requirements: Node.js 18+ and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/crazysandy1/snap2sizzle.git
cd snap2sizzle
npm install
cp .env.example .env      # add your keys
npm start                 # http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | yes | Google Gemini API key |
| `GOOGLE_SEARCH_API_KEY`, `GOOGLE_CSE_ID` | no | Optional Google image search |
| `PORT` | no | Server port (default 3000) |

Never commit `.env`.

## Deployment

`vercel.json` rewrites all routes to `api/index.js`, which exports the Express app. Import the repo in Vercel, set `GEMINI_API_KEY`, and deploy.

## Roadmap

- Save and share recipes.
- Nutrition estimates and dietary filters.
- Rate limiting on the API routes.
- Automated tests (`test_api.js` is a manual check).

## License

MIT
