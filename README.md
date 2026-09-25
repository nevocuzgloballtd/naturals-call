# CallFlow

Standalone calling-app frontend prototype.

## Current phase

This repository contains the complete frontend UI and browser interactions. It does **not** connect to a real calling provider yet.

### Included
- Home dashboard
- Dialer and keypad
- Keyboard dialing
- Saved numbers CRUD
- Search saved numbers
- Local call history
- Demo call state and timer
- Billing placeholder with no hardcoded provider balance
- Settings
- Future API architecture screen
- Responsive laptop/mobile layout
- Local browser persistence

## Run

Open `index.html` in a browser.

## Next phase

Build the backend/API:

`CallFlow UI → CallFlow API → provider adapter → calling provider`

The future wholesaling CRM will call the CallFlow API instead of connecting directly to the provider.

## Security note

Provider API keys, payment credentials, webhooks, and secrets must never be placed in the frontend files. They belong in the backend environment.
