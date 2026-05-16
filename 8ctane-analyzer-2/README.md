# 8ctane Baseball — Pitch Intelligence

A client-facing pitch analytics tool that generates full arsenal reports from Baseball Savant Statcast CSV exports.

## Features

- **Arsenal breakdown** — usage, avg velo, whiff%, CSW%, ball%, avg EV, xwOBA — color-coded by performance tier
- **Handedness splits** — pitch mix and performance vs. RHH and vs. LHH side-by-side
- **Count-by-count usage** — per-count pitch mix cards + stacked bar heatmap across all 12 counts
- **Movement plot** — pfx_x vs pfx_z scatter plot with per-pitch type coloring
- **Hard contact log** — EV-sorted table with severity pills, hard hit % by pitch
- **Automated insights** — data-driven findings (overuse flags, elite pitch detection, contact quality alerts)
- **Sequencing recommendations** — count-by-count and vs. RHH/LHH strategy
- **Multi-start comparison** — upload two CSVs to compare pitch mix shifts and trends
- **Print / PDF export** — browser print dialog generates a clean PDF report

## How to Use

1. Go to [Baseball Savant → Statcast Search](https://baseballsavant.mlb.com/statcast_search)
2. Filter by pitcher name, select pitch-by-pitch data, export as CSV
3. Upload CSV to the tool — report generates instantly in the browser
4. Share the URL with your athlete

## Deployment (GitHub Pages)

### First time setup

1. Create a new GitHub repository (e.g. `8ctane-pitch-intelligence`)
2. Make it **Public** (required for free GitHub Pages)
3. Upload all files in this folder:
   - `index.html`
   - `style.css`
   - `app.js`
   - `logo.png`
   - `README.md`

### Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under "Source", select **Deploy from a branch**
3. Select branch: `main`, folder: `/ (root)`
4. Click **Save**
5. Your site will be live at: `https://yourusername.github.io/8ctane-pitch-intelligence`

### Updating the site

Just upload new versions of any file directly through GitHub's web interface, or use Git:

```bash
git add .
git commit -m "Update pitch intelligence tool"
git push
```

GitHub Pages auto-deploys on every push — changes are live in ~60 seconds.

## File Structure

```
8ctane-analyzer/
├── index.html     # App shell and layout
├── style.css      # All styles and theming
├── app.js         # Data parsing, chart rendering, insights engine
├── logo.png       # 8ctane Baseball logo
└── README.md      # This file
```

## Pitch Type Reference

The tool reads Statcast pitch_type codes directly from the CSV:

| Code | Pitch         |
|------|---------------|
| FF   | 4-Seam Fastball |
| FA   | 4-Seam Fastball |
| SI   | Sinker        |
| FC   | Cutter        |
| SL   | Slider        |
| ST   | Sweeper       |
| CU   | Curveball     |
| KC   | Knuckle-Curve |
| FS   | Split-Finger  |
| CH   | Changeup      |

If pitch_type is missing, the tool infers type from release_speed + pfx_x + pfx_z movement clusters.

---

8ctane Baseball · Pitch Analytics & Development
