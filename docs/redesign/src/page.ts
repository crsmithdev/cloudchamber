import { esc, type Tab } from "./model.ts";

export const TABS: Tab[] = ["ideate", "check", "write", "sources"];

/** A standalone mockup page: the shared fonts, the direction's stylesheet, the body. */
export const page = (title: string, tab: Tab, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${tab} · Cloud Chamber mockup</title>
<link rel="stylesheet" href="../fonts/fonts.css">
<link rel="stylesheet" href="style.css">
</head>
<body class="tab-${tab}">
${body}
</body>
</html>
`;

/** A square-cornered verdict mark drawn in SVG: filled holds, hollow waits, a stroke passes. */
export const svgMark = (kind: string, size = 10) => {
  const r = size / 2;
  const c = `cx="${r}" cy="${r}"`;
  const body =
    kind === "done" || kind === "keep"
      ? `<circle ${c} r="${r - 1}" fill="currentColor"/>`
      : kind === "run"
        ? `<circle ${c} r="${r - 1.5}" fill="none" stroke="currentColor" stroke-width="1.5"/><circle ${c} r="${r - 3.5}" fill="currentColor"/>`
        : kind === "fail" || kind === "pass"
          ? `<path d="M1.5 ${size - 1.5} L${size - 1.5} 1.5" stroke="currentColor" stroke-width="1.6"/>`
          : kind === "todo"
            ? `<circle ${c} r="${r - 1.5}" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1.6 1.6"/>`
            : `<circle ${c} r="${r - 1.5}" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
  return `<svg class="mk mk-${kind}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${body}</svg>`;
};
