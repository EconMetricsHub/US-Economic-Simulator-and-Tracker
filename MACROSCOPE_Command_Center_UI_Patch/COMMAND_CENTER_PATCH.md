# MACROSCOPE Command Center UI Patch — v8.1

This patch changes only the root frontend `index.html`. It deliberately does **not** include `worker/`, `wrangler.toml`, D1 configuration, or secrets.

## What changes

- Five permanent workspaces: **Home, Scenario Lab, Data, Markets, Library**.
- Universal **Ctrl+K** command bar.
- Home becomes a Command Center with quick actions and recent commands.
- Existing 70+ controls remain intact inside Scenario Lab.
- Existing Data Copilot, official data, release calendar, news, Portfolio Lab, saved scenarios, historical scenarios, charts, comparison tools, and Ask MACROSCOPE remain available.
- The deployed Worker endpoint remains `https://macroscope-ai.johncalepsi1477.workers.dev`.

## Groq safety behavior

The command bar has three lanes:

1. **Navigation and control lookup** are deterministic and do not call Groq.
2. **Current-data requests** route to the existing Data Copilot review gate. Official values come from the Live Data Gateway rather than Groq.
3. **Scenario-changing natural language** routes to the existing AI Counterfactual Studio. Groq may propose controls, but the existing registry/range validation produces a **review-required draft**. The command bar does not auto-apply the scenario.

Ordinary explanatory questions route to Ask MACROSCOPE and are read-only.

## Install

Extract this patch somewhere convenient. Then open PowerShell in your actual MACROSCOPE project root, for example:

```powershell
cd "C:\MACROSCOPE-Command-Center"
```

Run the installer from wherever you extracted this patch. If the patch folder is inside the project root:

```powershell
powershell -ExecutionPolicy Bypass -File ".\MACROSCOPE_Command_Center_UI_Patch\install-command-center.ps1"
```

The installer creates a timestamped backup of your current `index.html` before replacing it.

## Preview locally

From the project root:

```powershell
python -m http.server 8000
```

Then open:

`http://localhost:8000`

Check these before publishing:

- Home loads and shows Command Center quick actions.
- Left navigation shows Home / Scenario Lab / Data / Markets / Library.
- Ctrl+K opens the command palette.
- Searching `oil` finds oil controls.
- `open monetary policy` can be selected through navigation results.
- `raise oil prices 30%` routes to a validated scenario draft and does **not** silently apply it.
- `latest unemployment` routes to Data Copilot and requires review before baseline updates.
- Data status turns live/verified when the Live Data Gateway loads.
- Existing saved scenarios, sliders, charts, portfolio tools, undo/redo, and Taylor Rule still work.

## Roll back

The installer prints the backup name. To restore it:

```powershell
Copy-Item ".\index.pre-command-center.YYYYMMDD-HHMMSS.html" ".\index.html" -Force
```

## Static checks performed

The combined JavaScript in the patched HTML passes `node --check`. The patch does not modify the economic equations, model coefficients, Worker backend, D1 schema, API secrets, or saved-scenario format.
