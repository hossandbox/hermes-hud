# Hermes HUD

A heads-up task and schedule display for **Meta Ray-Ban Display** glasses, as a
[Web App](https://wearables.developer.meta.com/docs/develop/webapps/) — plain
HTML/CSS/JavaScript, no native SDK.

## What it does

- Live clock and date in the header
- An items list you add to by dictation, handwriting, or the on-screen keyboard
- Tap to complete, tap the ✕ to delete
- Optional JSON feed merged into your items (your local items are never touched)
- Persists to `localStorage`; a service worker gives an offline cold start

## Add it to your glasses

1. **Enable Developer Mode** — Meta AI app → Settings → App Info → tap the app
   version number five times → Enable.
2. Open the Meta AI app → **App Settings → Apps → Web Apps → Connect Web App**.
3. Paste this site's HTTPS URL — **with a trailing slash**.
4. Save. The app appears at the bottom of the app grid on the glasses.

Requirements: glasses software **v125+**, Meta AI app **v272+**.

## Feed format

Point the app at any URL returning either a bare array or an object with an
`items` key. Entries may be strings or objects:

```json
{
  "items": [
    { "text": "UPS route 4471 — 9:30am", "done": false },
    "Renew retatrutide Rx"
  ]
}
```

Set it in the app's Settings pane. Leave it blank to stay fully local.
Feed rows are replaced on each sync; rows you added by hand are kept.

## Layout constraints this targets

Meta Ray-Ban Display is a **600×600 additive-light** display driven by
directional input:

- **Black is transparent.** Unlit pixels add no light, so the wearer's
  surroundings stay visible. The canvas is black and surfaces are bounded and
  low-luminance — never a bright full-screen background.
- **Focus is the cursor.** There is no pointer and no hover. Every control is a
  native `<button>`/`<input>`; arrow-key traversal is left to the WebView's
  spatial navigation, and Enter activates the focused element natively. The app
  never builds a manual focus index and never synthesizes a click from a key
  event (that causes double activation).
- Base type is 17px against a 16px floor; the layout derives from the real
  viewport rather than hardcoding 600px.

## Deployment notes

This repo is served as a **project site**, so the launch URL is
`https://<user>.github.io/<repo>/` and the icon manifest must resolve at
`https://<user>.github.io/<repo>/.well-known/meta-wearables-manifest.json`.

**`.nojekyll` is required.** GitHub Pages runs Jekyll by default, and Jekyll
skips directories beginning with a dot — which would silently drop
`.well-known/` and leave the glasses with a generic icon. The empty
`.nojekyll` file at the repo root disables Jekyll entirely.

Serve it from the repo root (`main` branch, `/` folder) in
Settings → Pages.

## License

MIT