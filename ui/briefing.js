// Turns a level briefing (a small markup in data/levels.json) into scannable cards.
//   "## Title"  starts a new card
//   "- item"    lines make a bullet list
//   "> text"    lines make a monospace example box
//   "**bold**"  is bold; anything else is a paragraph.
// Blocks are separated by blank lines. Everything is escaped first, so data cannot inject HTML.

function inline(text, esc) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function blockHtml(block, esc) {
  const lines = block.split('\n');
  if (lines.every((l) => l.startsWith('- '))) {
    return `<ul>${lines.map((l) => `<li>${inline(l.slice(2), esc)}</li>`).join('')}</ul>`;
  }
  if (lines.every((l) => l.startsWith('> '))) {
    return `<div class="example">${lines.map((l) => `<code>${esc(l.slice(2))}</code>`).join('')}</div>`;
  }
  return `<p>${inline(lines.join(' '), esc)}</p>`;
}

export function briefingToHtml(text, esc) {
  const blocks = String(text ?? '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  let out = '';
  let open = false;
  for (const block of blocks) {
    if (block.startsWith('## ')) {
      if (open) out += '</section>';
      out += `<section class="card"><h3>${inline(block.slice(3), esc)}</h3>`;
      open = true;
    } else {
      out += blockHtml(block, esc);
    }
  }
  if (open) out += '</section>';
  return out;
}

/** Number of words a reader sees (markup characters are not counted). */
export function wordCount(text) {
  return String(text ?? '')
    .replace(/^(##|-|>) /gm, '')
    .replace(/\*\*/g, '')
    .split(/\s+/)
    .filter(Boolean).length;
}
