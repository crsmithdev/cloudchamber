/** The comparison page: the current UI and every direction, screen by screen, side by side. */
import { esc } from "./model.ts";
import { TABS } from "./page.ts";

type Dir = { slug: string; name: string; line: string };

export function index(dirs: Dir[]) {
  const cols = [{ slug: "current", name: "Current UI", line: "The app today (the Tide Table in DESIGN.md), captured from a local server on a copy of the store." }, ...dirs];
  const head = cols
    .map(
      (c, i) => `<th><div class="k">${i ? `direction ${i}` : "baseline"}</div><div class="nm">${i ? `<a href="${c.slug}/ideate.html">${esc(c.name)}</a>` : esc(c.name)}</div><p>${esc(c.line)}</p></th>`,
    )
    .join("");
  const rows = TABS.map(
    (t) => `<tr><th class="tab">${t}</th>${cols
      .map((c) => {
        const img = `<img src="shots/${c.slug}-${t}.png" alt="${esc(c.name)}, ${t} screen" loading="lazy">`;
        return `<td><a href="${c.slug === "current" ? `shots/current-${t}.png` : `${c.slug}/${t}.html`}">${img}</a></td>`;
      })
      .join("")}</tr>`,
  ).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cloud Chamber redesign directions</title>
<link rel="stylesheet" href="fonts/fonts.css">
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 14px/1.5 "Public Sans", system-ui, sans-serif; background: #f4f4f2; color: #1c1c1c; }
  header { padding: 28px 32px 8px; max-width: 900px; }
  h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: -0.01em; }
  header p { margin: 0 0 6px; color: #555; }
  .wrap { overflow-x: auto; padding: 16px 32px 48px; }
  table { border-collapse: separate; border-spacing: 14px 0; margin-left: -14px; }
  th, td { vertical-align: top; text-align: left; }
  thead th { width: 340px; padding-bottom: 12px; font-weight: 400; }
  .k { font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: #636363; font-weight: 600; }
  .nm { font-size: 16px; font-weight: 700; margin: 2px 0 4px; }
  .nm a { color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
  thead p { margin: 0; color: #555; font-size: 13px; }
  th.tab { width: 64px; padding-top: 6px; font-weight: 700; }
  td { padding-bottom: 14px; }
  td img { display: block; width: 340px; height: auto; border: 1px solid #d0d0cc; }
  td a:hover img, td a:focus-visible img { outline: 2px solid #1c1c1c; outline-offset: 2px; }
</style>
</head>
<body>
<header>
  <h1>Cloud Chamber: redesign directions</h1>
  <p>Four directions for the four tabs, set beside the current UI. Every mockup uses real store content; the README names the trade-off of each. Click a thumbnail to open the static mockup.</p>
  <p><a href="README.md">README</a> · screenshots at 1600 × 1000</p>
</header>
<div class="wrap">
<table>
  <thead><tr><th></th>${head}</tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
</body>
</html>
`;
}
