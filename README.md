# Reviewcap Landing Page — GitHub + Deploy

`index.html` is a single, self-contained static page (no build step, no framework). This is what you push to GitHub and deploy.

## 1. Push to GitHub
```bash
cd github-deploy
git init
git add .
git commit -m "Reviewcap landing page"
gh repo create reviewcap-landing --public --source=. --remote=origin --push
```
(No `gh` CLI? Create an empty repo on github.com, then `git remote add origin <url>` and `git push -u origin main`.)

## 2. Deploy (pick one)
- **GitHub Pages** (free, simplest): repo Settings → Pages → Deploy from branch → `main` / root. Live at `https://<user>.github.io/reviewcap-landing`.
- **Vercel / Netlify**: import the GitHub repo, no build command needed, output = root. Gives you a custom domain easily.

## 3. Keep editing with Claude Code
Once the repo is cloned locally, Claude Code can edit `index.html` directly like any other code file — it's plain HTML/CSS/JS, no special runtime required. Just point Claude Code at the repo folder.

## Notes
- All animation/interaction (FAQ accordion, hero "Customers say" demo) is now plain vanilla JS at the bottom of `index.html` — no external dependencies besides the Google Fonts link.
- Colors live in `assets/brand.css` as CSS variables (`--primary`, `--accent`, `--ink`, …) and are used by every page; change the palette there. Values come from `brand/logo/README.md` in the reviewcap-growth repo. Fonts: Plus Jakarta Sans (headings), Manrope (body).
- Logo, favicon and touch icon are in `assets/`. `og-image.png` is rendered from `marketing/og-image/` in the reviewcap-growth repo.
