# SweetPrompts Pro - Netlify, Vercel & GitHub Deployment Guide

SweetPrompts Pro is configured with **Dual-Mode Execution (Serverless Proxy + 100% Direct Client Browser Execution)**.
It will work seamlessly when pushed to GitHub and deployed on **Netlify**, **Vercel**, or **GitHub Pages**.

---

## Which mode runs where? (read this first)

- **Vercel:** Serverless proxy works — the functions in `api/` (`generate.ts`, `vision.ts`, `test-connection.ts`) run on Vercel and proxy AI requests. The browser-direct mode is the fallback.
- **Local dev (`npm run dev`):** `server.ts` (Express) serves the API routes.
- **Netlify / GitHub Pages:** there is **no backend**. The `api/*.ts` files are Vercel-style functions and do not run on Netlify. `netlify.toml` and `public/_redirects` deliberately return a clean 404 for `/api/*` (instead of the SPA rewrite) so the app detects the missing backend and runs **100% directly from the browser**. On these hosts you must enter your own API key in Settings.

---

## Deploy to Netlify (Recommended - 2 Minutes)

### Step 1: Push Code to GitHub
1. Create a new repository on GitHub (e.g. `sweetprompts-pro`).
2. Run the following commands in your local terminal:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - SweetPrompts Pro"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/sweetprompts-pro.git
   git push -u origin main
   ```

### Step 2: Deploy on Netlify
1. Log in to [netlify.com](https://app.netlify.com/).
2. Click **Add new site** -> **Import an existing project**.
3. Choose **GitHub** and select your repository (`sweetprompts-pro`).
4. Netlify will automatically detect:
   - **Build Command:** `npm run build`
   - **Publish directory:** `dist`
5. Click **Deploy sweetprompts-pro**.

---

## How It Works on Netlify & Browser Mode
1. **SPA Routing Configured:**
   - `public/_redirects` and `netlify.toml` are included, ensuring all page reloads work smoothly without 404 errors.
   - `/api/*` is excluded from the SPA rewrite so API calls get a clean 404 (no backend on Netlify) instead of `index.html`.
2. **100% Client-Side Direct Execution:**
   - When users enter ANY single API key (Google Gemini, Groq, Mistral, OpenRouter, Cerebras, or Hugging Face) in the website's **Settings**, all AI features (PNG Creator, Vector Studio, JPG Creator, Image Scan, Metadata Studio) run **100% directly from their browser**.
   - No backend server required for user operations.

---

## Deploy to Vercel (for the serverless proxy)

1. Import the repository in [vercel.com](https://vercel.com/).
2. Keep the default Vite settings; `vercel.json` already excludes `/api/*` from the SPA rewrite so the functions in `api/` stay reachable.
3. Optional: set server-side API keys (e.g. `GEMINI_API_KEY`) in Vercel Project Settings to let the proxy use them. **Never use `VITE_`-prefixed names for secrets** — Vite bakes those into the public JS bundle.

## Production
- Live site: https://sweetpromptspro.netlify.app/
- Netlify auto-deploys from `main`; a push triggers a fresh production build.
