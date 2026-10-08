# AlertBridge

AlertBridge is a first-stage demonstration of a community safety and emergency navigation app. It lets people record security threats and natural hazards through guided questions or a written description, then demonstrates how a responder might review those reports.

> **Important:** This is a demonstration prototype. Reports are stored only in the current browser and are not sent to emergency services or any agency.

## Run locally

Requirements: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

To make and preview a production build:

```bash
npm run build
npm run preview
```

Run the strict TypeScript check with:

```bash
npm run check
```

Run the focused validation and persistence-parser tests with:

```bash
npm test
```

## Implemented

- Responsive home page with prominent incident reporting and prototype warning
- Guided-question and free-written report modes
- Security threat, flood, landslide, fire, and other categories
- Required-field and coordinate-range validation, including rejection of whitespace-only descriptions
- Browser location requested only after the user selects **Use my location**, with permission, timeout, and unavailable-location handling
- Manual latitude and longitude entry
- Review step before saving
- Local browser persistence through `localStorage`, report IDs, and an initial **Unverified** status
- Defensive parsing ignores malformed locally stored data instead of allowing it to crash the dashboard
- Simulated responder dashboard with report list, detail view, status changes, required verification/rejection reasons, and status history
- Accessible form labels, visible focus states, strong contrast, large touch targets, and text paired with icons
- Precise coordinates kept out of any public-feed concept and limited to report/reviewer screens

## Prototype limitations

- No backend, shared database, accounts, authentication, or real responder access control
- Reports and status changes exist only in one browser's local storage; clearing site data removes them
- Nothing is transmitted to emergency services and no agency partnership is implied
- No location-based warnings, route suggestions, SMS fallback, or audio prompts yet
- Browser geolocation depends on device support, user permission, and a secure browser context (HTTPS or localhost)
- No offline transmission is provided, and the prototype does not claim or calculate guaranteed safe routes

## Technology

React, TypeScript, Vite, Lucide icons, and browser `localStorage`.
