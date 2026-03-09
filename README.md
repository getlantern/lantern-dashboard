# Lantern Impact Dashboard

Real-time monitoring dashboard for the [Lantern](https://lantern.io) censorship circumvention network. Visualizes global proxy traffic, volunteer contributions, protocol performance, and per-ISP blocking patterns powered by the EXP3.S bandit system.

## Features

**Interactive World Map** — Animated traffic arcs flow from censored regions to volunteer proxies. Click any country to drill into ISP-level metrics: arm counts, block rates, entropy, and traffic distribution. 13 censored countries are highlighted with per-city scatter nodes weighted by population.

**Live Network Stats** — Active volunteers, users reached, blocks evaded, and bandwidth consumed. Stats update every 30 seconds from the Lantern API, with animated number transitions and country/ISP filtering.

**Proxy Volunteering** — Share your connection directly from the dashboard. Integrates the [unbounded](https://github.com/getlantern/unbounded) WASM proxy via a headless API. Tracks session history across browser restarts and shows live connection count, throughput, and lifetime stats.

**"My Proxy" View** — Toggle to see only your proxy's impact: your geo-located position, connected peers, and traffic arcs flowing through you. Peer IPs are resolved via WebRTC ICE candidates.

**Protocol Feed** — Streaming event log of protocol generation, deployment, blocking, and evasion across the network.

**Impact Card** — Personal volunteer stats with a rank progression system (Ember through Lighthouse), streak tracking, and countries helped.

**Demo Mode** — Click "LIVE DATA" to toggle synthetic data with realistic jitter for development and demos when the API is unavailable.

## Quick Start

```bash
# Clone
git clone https://github.com/getlantern/lantern-dashboard.git
cd lantern-dashboard

# Install
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API URL and Google OAuth client ID

# Dev server (http://localhost:5173)
npm run dev
```

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Lantern API base URL | `https://api.staging.iantem.io` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID | `123.apps.googleusercontent.com` |

Create the OAuth client at GCP Console > APIs & Services > Credentials. Set authorized JavaScript origins to include `http://localhost:5173` and your deploy domain.

## Scripts

```bash
npm run dev      # Vite dev server with HMR
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build locally
npm run lint     # ESLint
```

## Architecture

```
src/
├── components/
│   ├── Dashboard.tsx       Main layout: map, stats, right panel
│   ├── WorldMap.tsx        SVG map with arcs, scatter, ISP panel
│   ├── ProxyWidget.tsx     Volunteer proxy toggle + live stats
│   ├── StatsRow.tsx        Animated stat cards with filtering
│   ├── ImpactCard.tsx      Personal volunteer rank & stats
│   ├── ProtocolFeed.tsx    Real-time protocol event stream
│   └── LoginScreen.tsx     Google OAuth login
├── hooks/
│   ├── useLiveData.ts      API polling, demo mode, mock fallback
│   ├── useProxy.ts         WASM proxy lifecycle & session tracking
│   ├── useAuth.tsx         OAuth flow, token refresh, domain check
│   └── useGeoLookup.ts    IP geolocation with caching
├── api/
│   └── client.ts           Typed API client (v1/dashboard/*)
├── data/
│   └── mock.ts             Synthetic data generation
├── App.tsx                 Root with auth routing
├── App.css                 Component styles
└── index.css               CSS variables, keyframes, layout
```

### Data Flow

1. **`useLiveData`** polls `/v1/dashboard/global` every 30s, returning per-country bandit stats (ASN counts, block rates, entropy). Falls back to mock data if the API is unreachable. Demo mode generates synthetic data with jitter.

2. **`WorldMap`** renders countries colored by block rate. Clicking a country fetches `/v1/dashboard/asns?country=XX` for ISP drill-down. Arcs animate from censored cities to proxy regions using hash-based stable timing.

3. **`useProxy`** loads the unbounded WASM embed script, initializes `window.LanternProxy`, and subscribes to connection/throughput events. Session time persists to localStorage with crash recovery via `beforeunload`.

4. **`useGeoLookup`** resolves proxy peer IPs to lat/lng via `geo.getiantem.org/lookup`. Lookups are deferred until the proxy is running and cached per-IP with in-flight deduplication.

### API Endpoints

| Endpoint | Returns |
|---|---|
| `GET /v1/dashboard/global` | Countries with ASN count, avg block rate, avg entropy |
| `GET /v1/dashboard/asns?country=XX` | Per-ISP metrics: arms, blocks, pulls, entropy, top arms |
| `GET /v1/dashboard/asn-history?asn=AS123` | Historical snapshots for one ASN |
| `GET /v1/dashboard/blocked-routes` | Currently blocked route IDs |

### Authentication

Google OAuth 2.0 restricted to `@getlantern.org` domain. Tokens are silently refreshed via Google One Tap on 401 responses. User info persists in localStorage.

## Deployment

### Cloudflare Pages

The `_redirects` file handles SPA routing. Connect the repo to Cloudflare Pages with:

- **Build command:** `npm run build`
- **Build output:** `dist`
- **Environment variables:** `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`

### Firebase

A `firebase.json` is included for Firebase Hosting as an alternative.

## Tech Stack

| | |
|---|---|
| **Framework** | React 19, TypeScript 5.9 |
| **Build** | Vite 7.3 |
| **Map** | react-simple-maps (D3-geo) |
| **Charts** | Recharts |
| **Auth** | @react-oauth/google |
| **Animation** | Framer Motion, CSS keyframes |
| **Fonts** | IBM Plex Mono, Outfit |
| **Proxy** | unbounded WASM headless API |

## Design

Dark theme with cyan (`#00e5c8`) primary accent and amber (`#f0a030`) secondary. CSS custom properties for theming, no CSS-in-JS. Responsive layout: side-by-side on desktop, stacked on mobile.
