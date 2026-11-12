// A small Markdown renderer for the studio's own docs (docs/language.md): headings,
// paragraphs, lists, tables, code blocks (highlighted as OctoLang), inline code, bold,
// italics and links. Only for text we ship; it escapes everything it does not know.
import { CodeView } from './code.js?v=e2bbaab254';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  // code spans become placeholders first, so bold and italics can wrap them
  const codes = [];
  const t = esc(s.replace(/`([^`]+)`/g, (m, c) => `\u0000${codes.push(c) - 1}\u0000`))
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => /^(https?:|#)/.test(u) ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : t);
  return t.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${esc(codes[+i])}</code>`);
}

// returns { html, toc: [{ id, text, level }] }
export function markdown(src, octo = null) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [], toc = [];
  const hl = octo ? CodeView.prototype.highlightLine.bind({ octo, names: new Set(), params: new Set() }) : esc;
  let k = 0;
  const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  while (k < lines.length) {
    const l = lines[k];
    if (/^```/.test(l)) {
      const body = [];
      for (k++; k < lines.length && !/^```/.test(lines[k]); k++) body.push(lines[k]);
      k++;
      out.push(`<pre class="md-code">${body.map(b => `<div>${hl(b) || ' '}</div>`).join('')}</pre>`);
      continue;
    }
    const hm = /^(#{1,4})\s+(.*)$/.exec(l);
    if (hm) {
      const level = hm[1].length, id = 'md-' + slug(hm[2]);
      toc.push({ id, text: hm[2].replace(/`/g, ''), level });
      out.push(`<h${level} id="${id}">${inline(hm[2])}</h${level}>`);
      k++;
      continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      for (; k < lines.length && /^\|/.test(lines[k]); k++) rows.push(lines[k]);
      const cells = r => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(/^\|[\s:|-]+\|?$/.test(rows[1] || '') ? 2 : 1);
      out.push(`<table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      for (; k < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[k]) || (/^\s{2,}\S/.test(lines[k]) && items.length)); k++) {
        if (/^\s*([-*]|\d+\.)\s+/.test(lines[k])) items.push(lines[k].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        else items[items.length - 1] += ' ' + lines[k].trim();
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map(i => `<li>${inline(i)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (!l.trim()) { k++; continue; }
    const para = [];
    for (; k < lines.length && lines[k].trim() && !/^(```|#{1,4}\s|\||\s*([-*]|\d+\.)\s)/.test(lines[k]); k++) para.push(lines[k].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { html: out.join('\n'), toc };
}
