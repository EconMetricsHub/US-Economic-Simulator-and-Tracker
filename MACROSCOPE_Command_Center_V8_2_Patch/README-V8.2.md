# MACROSCOPE Command Center V8.2

This patch is the consolidation/hardening pass after the Live Data Gateway and V8.1 Command Center.

## The two foundational fixes

1. **Unified prompt routing**
   - Navigation commands execute locally.
   - Current/latest-data requests route to Data Copilot.
   - Scenario/mutation instructions route to the validated Counterfactual Studio.
   - Explanatory questions route to Ask MACROSCOPE in read-only mode.
   - Ask MACROSCOPE itself uses the same router, so typing `raise oil prices 30%` there no longer sends it to the analyst endpoint.

2. **True Command Center Home**
   - Four headline model metrics.
   - Current-scenario summary.
   - Latest official observations.
   - Recent command history.
   - Four primary actions.
   - The full legacy dashboard remains available behind `SHOW DETAILED DASHBOARD`.

## Other changes implemented

- Scenario Lab controls grouped into nine conceptual groups instead of a flat list.
- Persistent right rail changes by workspace; Scenario Lab gets Baseline → Scenario summary and staged-draft state.
- Clickable Live Data/System status panel with tracked/fresh series, last sync, Groq configuration, and latest revision.
- System strip separates MODEL, GROQ, and DATA health.
- Ctrl+K searches local controls, live observations, saved scenarios/branches, and navigation before offering an AI route.
- Deterministic commands for save, undo, redo, reset, and navigation do not call Groq.
- AI scenario drafts remain staged and review-gated; the Scenario rail exposes Apply & Run and Undo.
- Home and panel hierarchy is less border-heavy and uses larger headline numbers.
- Worker status response now reports whether the Groq secret is configured.
- Live-data status includes revision count/latest revision.
- Installer safely updates localhost CORS and 30-minute weekday data checks without replacing your D1 UUID.

## Install

Extract this patch somewhere outside the project, then from the project root:

```powershell
cd "C:\MACROSCOPE-Command-Center"
powershell -ExecutionPolicy Bypass -File "C:\PATH\TO\MACROSCOPE_Command_Center_V8_2_Patch\install-v8.2.ps1"
```

Preview:

```powershell
py -m http.server 8000
```

Open `http://localhost:8000`.

Deploy the updated Worker after testing:

```powershell
cd "C:\MACROSCOPE-Command-Center\worker"
npx.cmd wrangler deploy --config .\wrangler.toml
```

## Regression checks

Try these after installation:

- `Ctrl+K` → `oil` should show local controls and live data before the AI action.
- `Ctrl+K` → `open markets` should navigate without Groq.
- `Ctrl+K` → `latest unemployment` should route to Data Copilot.
- `Ctrl+K` → `raise oil prices 30%` should create a staged scenario draft.
- In **Ask MACROSCOPE**, enter `raise oil prices 30%`; it should route to Scenario Lab instead of the analyst endpoint.
- In **Ask MACROSCOPE**, enter `why is inflation rising?`; it should remain in read-only analyst mode.
- Click **DATA LIVE** in the system strip to inspect system/data status.
- Open **Scenario Lab** and verify the right rail shows scenario deltas and changed controls.
- Use `Undo` after applying a staged scenario.

The patch does not contain or overwrite API keys.
