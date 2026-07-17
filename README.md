# 🦫 CAPYBARA CHAOS: Zoo Shutdown

A 3D browser game about **Munch**, the grumpiest capybara alive. Cause enough chaos and the zoo **SHUTS DOWN for the day**. Get grabbed by keepers 3 times and you're **CAUGHT**.

Built with **Three.js + React 19 + TypeScript + Vite**. All 3D models are procedural low-poly (zero external assets), all audio is synthesized WebAudio (zero audio files).

## 🎮 Controls

| Input | Action |
|---|---|
| **WASD / Arrows** | Move |
| **J / Z** | Bite (wrecks selfie sticks) |
| **K / X** | Headbutt (knockback — shove tourists into the pond!) |
| **Shift (hold)** | Charge (drains stamina, bowls through crowds) |
| **L / C** | Hide in bushes / roll in mud (mud = speed boost) |
| **Space** | Splash attack (near the pond) |
| **Esc / P** | Pause |

## 🔥 The Loop

Spot tourist → bite / headbutt / charge / splash → chain panic & stampedes → keepers respond → hide or roll in mud → repeat. Chaos escalates through 6 stages: **Peaceful → Suspicious → Alarmed → Code Brown → Full Alert → ZOO SWAT** (keepers, tranq darts, drone spotlight, elite response).

Score combos, 8 random events (school trip, rain, VIP tour, gate left open…), and a roguelite **Chaos Points upgrade shop** between runs (saved in localStorage).

## 🚀 Deploy (Netlify)

This repo is Netlify-ready — `netlify.toml` is included:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node:** 20

Just connect the repo in Netlify (or let your bot pick it up) and deploy. No environment variables needed.

## 🛠 Local dev

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build → dist/
```

## 🌐 Multiplayer foundations

The sim runs through a single authoritative `World.step(dt, inputs)` with plain-data entity state, an `InputSource` interface (keyboard now, `NetInput` later) and a `NetAdapter` seam (`LocalLoopback` now, WebRTC/WebSocket later) — ready for a future co-op chaos phase.
