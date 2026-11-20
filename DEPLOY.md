# Deploy Cubic — Vercel (frontend + API)

Both the SPA and the API run on Vercel.

| | URL |
|--|-----|
| Frontend | your client Vercel URL |
| API | `https://project-management-backend-nine-tau.vercel.app` |

> **Note:** Vercel is serverless. **Socket.io / live realtime will not work.** Uploads are ephemeral (`/tmp`).

---

## 1. API project (already set up)

- **Root Directory:** `server`
- **URL:** `https://project-management-backend-nine-tau.vercel.app`
- Env vars: `MONGODB_URI`, `JWT_*`, `CLIENT_URL` (frontend URL), tenant settings, etc.
- Health: `https://project-management-backend-nine-tau.vercel.app/api/health`

`CLIENT_URL` must be your frontend origin, e.g.:
```
https://clyro.editcomedia.com
```

---

## 2. Frontend project

1. Vercel → frontend project → **Settings**
2. **Root Directory:** `client`
3. Env:

| Key | Value |
|-----|--------|
| `VITE_API_URL` | `/api` |

`/api` is proxied to the Vercel API via `client/vercel.json`.

Alternative (no proxy):  
`VITE_API_URL=https://project-management-backend-nine-tau.vercel.app/api`

4. Redeploy the frontend after changing `vercel.json` or env.

---

## 3. Atlas

Network Access → allow `0.0.0.0/0` (or Vercel IPs).

---

## 4. Smoke test

- [ ] `/api/health` on the API project returns `{ "ok": true, "runtime": "vercel" }`
- [ ] Login from the frontend
- [ ] Create a project / task

## Local vs production

| | Local | Production |
|--|--------|------------|
| App | `http://localhost:5173` | `https://clyro.editcomedia.com` |
| API | `http://localhost:5000/api` | `https://project-management-backend-nine-tau.vercel.app/api` |
| Socket.io | yes | **no** |
