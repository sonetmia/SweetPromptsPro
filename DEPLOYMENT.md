# SweetPrompts Pro - Netlify, Vercel & GitHub Deployment Guide

SweetPrompts Pro is configured with **Dual-Mode Execution (Serverless Proxy + 100% Direct Client Browser Execution)**.
It will work seamlessly when pushed to GitHub and deployed on **Netlify**, **Vercel**, or **GitHub Pages**.

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
2. **100% Client-Side Direct Execution:**
   - When users enter ANY single API key (Google Gemini, Groq, Mistral, OpenRouter, Cerebras, or Hugging Face) in the website's **Settings**, all AI features (PNG Creator, Vector Studio, JPG Creator, Image Scan, Metadata Studio) run **100% directly from their browser**.
   - No backend server required for user operations.
