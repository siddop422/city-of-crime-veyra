# City of Crime — Veyra

Open-world browser crime game with WebGL2, missions, police AI, phone OS, and **Netlify multiplayer server browser**.

## Multiplayer (no codes)

1. Open the game on the **Netlify URL** (required so `/api/rooms` works).
2. Main menu → **Multiplayer**.
3. **Create Server** — your server appears in the public list.
4. Friend hits **Refresh**, then **JOIN** on your server.
5. No room codes, no offer/answer paste.

Backend: Netlify Functions + Blobs room registry. Peer connection: PeerJS + WebRTC.

## Deploy

```bash
cd veyra-deploy
npm install
npx netlify deploy --prod --site <site-id>
```
