# RSI Signal Engine + Dhan Backend — Deployment Package

This repository contains both the static frontend for Netlify and the Node.js backend intended for Render.

## Files at repository root
- `index.html` — frontend.
- `netlify.toml` — Netlify static publish configuration.
- `server.js` — Node.js backend.
- `package.json` — backend dependencies and `npm start`.
- `.env.example` — environment-variable template only; do not put real credentials here.
- `.gitignore` — excludes `.env` and `node_modules`.

## A. Upload to GitHub
1. Extract this ZIP.
2. Upload every file in this folder to the root of one GitHub repository.
3. Commit the files.

## B. Deploy the backend on Render
1. In Render, create a **New Web Service** and connect the GitHub repository.
2. Runtime: **Node**.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add these environment variables in Render's Environment settings:
   - `DHAN_API_KEY` = your Dhan API key
   - `DHAN_USER_ID` = your Dhan user ID
   - `DHAN_TOTP_SECRET` = your TOTP secret
   - `PORT` is normally provided by Render; do not hardcode it.
6. Deploy and copy the service hostname, e.g. `https://your-service-name.onrender.com`.

Never commit your real `.env` file or Dhan credentials to GitHub.

## C. Set the frontend's Render WebSocket URL
1. In GitHub, open `index.html` and tap Edit.
2. Find:
   `const BACKEND_URL = "wss://REPLACE-WITH-YOUR-RENDER-SERVICE.onrender.com";`
3. Replace it with your actual Render hostname, changing `https://` to `wss://`.
   Example only:
   `const BACKEND_URL = "wss://your-service-name.onrender.com";`
4. Commit the change. Netlify should rebuild automatically if the repository is connected.

## D. Deploy the frontend on Netlify
1. In Netlify, choose **Add new site / Add new project → Import an existing project**.
2. Select the same GitHub repository.
3. Build command: leave blank (static site).
4. Publish directory: `.`
5. Deploy.

If Netlify was already connected, a new GitHub commit should trigger a redeploy.

## Testing
- Open `https://YOUR-RENDER-HOST.onrender.com/api/health` to check whether the Node server responds.
- Open the Netlify site and check whether the status changes to CONNECTED.

## Important limitations
This package prepares the deployment files but does not deploy services or know your actual Render hostname. The supplied Dhan login/WebSocket protocol, instrument IDs, subscription format, and live-data payload are not verified. The frontend also contains placeholder DEMA/volume filters. A successful `/api/health` response proves only that the server is running, not that live Dhan market data is flowing or that signals are trading-ready.
