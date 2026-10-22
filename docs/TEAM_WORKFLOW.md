# Team Workflow & Conventions

## Git branching (keeps merges painless)
- `main` — always demo-able; only the Scrum Master merges `develop` into it at the end of a sprint.
- `develop` — integration branch. **Nobody commits directly to `main` or `develop`.**
- Feature branches off `develop`, named `m<N>/<short-feature>` — e.g. `m5/item-create`, `m8/household-requests`.
- Commit small and often, message style `feat(items): add create-item endpoint (Req 13)`. Every member MUST have commits (course rule).
- Before opening a PR: `git fetch && git rebase origin/develop` (or merge develop into your branch), run the app, then open a PR **into `develop`**.
- PRs need 1 approval (the CODEOWNER / a teammate). Merge with **Squash and merge**. Delete the branch afterwards.
- Pull `develop` at least every morning.

## The 6 rules that prevent merge conflicts
1. **Only edit files you own** (`docs/OWNERSHIP.md`). New files inside your feature folders are always OK.
2. **Never edit shared/foundation files** without telling Member 1 (`middleware`, `utils`, `routes/index.js`, `routeConfig.jsx`, `global.css`, `components/common`).
3. **Never edit someone else's model.** Need a field? Ask the model's owner or open a 5-line PR and tag them.
4. **Routes are auto-mounted** and **pages are pre-registered** — you never touch `app.js`, `App.jsx`, or `routeConfig.jsx`.
5. **Page-specific CSS** goes in your own `.css` file next to your page. Don't append to `global.css`.
6. **`package.json`**: if you add a dependency, announce it in the team chat and commit `package.json` + `package-lock.json` in their own tiny PR *first*.

## Code conventions
- Controllers: `asyncHandler(async (req, res) => {...})`, `throw ApiError.xxx()` for failures, return JSON objects (not bare arrays).
- Validate on the server (`express-validator` + `validate`) — the UI check is only for UX.
- Passwords: `user.setPassword()` / `user.checkPassword()`, and `passwordRule()` from `utils/validators.js` for the strength rule.
- Components call functions in `src/api/*.api.js`, never `axios` directly. Show errors with `getErrorMessage(err)` + `<Alert variant="error">`.
- Lists from the server use the `{ items, total, page, limit, pages }` shape (`utils/pagination.js`).
- Mobile first: test your pages at ~375px width (NFR 1). Use the classes in `global.css`.

## Working before your teammates finish
- `npm run seed` gives you users, categories and items. Use the **DEV** button (bottom-right of the page) to be logged in as admin / member / lender / applicant instantly.
- Need an endpoint another member hasn't finished? Code against the shape in `docs/API_CONTRACT.md`, and mock the response locally until it lands.
