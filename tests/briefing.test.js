import { test, assert, assertEqual } from './harness.js';
import { briefingToHtml, wordCount } from '../ui/briefing.js';

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Briefing markup (see contracts/levels-data.md): blocks are separated by blank lines.
//   "## Title"  starts a new card
//   "- item"    lines make a bullet list
//   "> text"    lines make a monospace example box
//   "**bold**"  is bold; anything else is a paragraph.

test('briefing/each ## heading starts a card with a heading', () => {
  const html = briefingToHtml('## One\n\nHello\n\n## Two\n\nWorld', esc);
  assertEqual((html.match(/<section class="card">/g) ?? []).length, 2);
  assert(html.includes('<h3>One</h3>') && html.includes('<h3>Two</h3>'), html);
});

test('briefing/bullet lines become one list', () => {
  const html = briefingToHtml('## T\n\n- first\n- second\n- third', esc);
  assertEqual((html.match(/<li>/g) ?? []).length, 3);
  assertEqual((html.match(/<ul>/g) ?? []).length, 1);
});

test('briefing/quote lines become a monospace example box, one line per row', () => {
  const html = briefingToHtml('## T\n\n> 10 deny tcp any any eq 25\n> 20 permit ip any any', esc);
  assert(html.includes('<div class="example">'), html);
  assert(html.includes('10 deny tcp any any eq 25') && html.includes('20 permit ip any any'), html);
  assertEqual((html.match(/<code>/g) ?? []).length, 2);
});

test('briefing/**bold** becomes strong text', () => {
  assert(briefingToHtml('## T\n\nShoot the **denied** ones', esc).includes('<strong>denied</strong>'));
});

test('briefing/text before the first heading is shown as plain paragraphs', () => {
  const html = briefingToHtml('Intro line\n\n## T\n\nBody', esc);
  assert(html.indexOf('Intro line') < html.indexOf('<section'), html);
});

test('briefing/markup in the data cannot inject HTML', () => {
  const html = briefingToHtml('## <img src=x onerror=alert(1)>\n\n- <script>alert(1)</script>\n\n> <b>x</b>\n\n**<i>y</i>**', esc);
  assert(!/<img|<script|<b>|<i>/.test(html), html);
  assert(html.includes('&lt;script&gt;'), html);
});

test('briefing/an empty briefing gives no HTML and does not throw', () => {
  assertEqual(briefingToHtml('', esc), '');
});

test('briefing/wordCount ignores markup characters', () => {
  assertEqual(wordCount('## Your job\n\n- Shoot the **denied** ones'), 6);
});
