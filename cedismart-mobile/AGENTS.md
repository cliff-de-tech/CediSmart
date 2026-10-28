# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

# Git Workflow

After every completed development task, always commit the changes with a clear conventional commit message (e.g. `feat:`, `fix:`, `chore:`) and push to `origin main`.

- Run the relevant checks first (e.g. `npx tsc --noEmit` for mobile; `black`, `ruff`, `mypy --strict`, `pytest` for the API) and only commit if they pass.
- Never commit `cedismart-web/UI_UX_RECOMMENDATIONS.md` — it is a local guide for web UI polish only.
