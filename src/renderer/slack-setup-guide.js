/** 轻量 Markdown → HTML，仅供配置指南使用 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMarkdown(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );
  return s;
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(escapeHtml(lines[i]));
        i += 1;
      }
      out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      out.push('<hr />');
      i += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      out.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      out.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (line.startsWith('# ')) {
      out.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
      i += 1;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && /^\|?[\s:-|]+\|?$/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) {
        if (!/^\|?[\s:-|]+\|?$/.test(lines[i])) {
          const cells = lines[i]
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());
          rows.push(cells);
        }
        i += 1;
      }
      if (rows.length) {
        const [head, ...body] = rows;
        out.push('<table><thead><tr>');
        for (const cell of head) {
          out.push(`<th>${inlineMarkdown(cell)}</th>`);
        }
        out.push('</tr></thead><tbody>');
        for (const row of body) {
          out.push('<tr>');
          for (const cell of row) {
            out.push(`<td>${inlineMarkdown(cell)}</td>`);
          }
          out.push('</tr>');
        }
        out.push('</tbody></table>');
      }
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      out.push('<ol>');
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        out.push(`<li>${inlineMarkdown(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
        i += 1;
      }
      out.push('</ol>');
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      out.push('<ul>');
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        out.push(`<li>${inlineMarkdown(lines[i].replace(/^[-*]\s/, ''))}</li>`);
        i += 1;
      }
      out.push('</ul>');
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    out.push(`<p>${inlineMarkdown(line)}</p>`);
    i += 1;
  }

  return out.join('\n');
}

function guideLocale(raw) {
  if (raw === 'zh') return 'zh-CN';
  if (raw === 'ja') return 'ja';
  return 'en';
}

async function loadGuide() {
  const params = new URLSearchParams(location.search);
  const locale = guideLocale(params.get('locale') ?? 'en');
  const contentEl = document.getElementById('content');
  const titleEl = document.getElementById('windowTitle');

  let windowTitle = 'Slack setup guide';
  const closeBtn = document.getElementById('closeBtn');
  if (window.combrief) {
    try {
      const m = await window.combrief.getMessages();
      windowTitle = m.settings.slackSetupGuideTitle;
      document.documentElement.lang =
        locale === 'zh-CN' ? 'zh-CN' : locale === 'ja' ? 'ja' : 'en';
      if (closeBtn) closeBtn.textContent = m.about.ok;
    } catch {
      /* fallback */
    }
  }
  document.title = windowTitle;
  if (titleEl) titleEl.textContent = windowTitle;

  try {
    const res = await fetch(`guides/slack-setup.${locale}.md`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    if (contentEl) contentEl.innerHTML = renderMarkdown(md);
  } catch (err) {
    if (contentEl) {
      contentEl.innerHTML = `<p class="error">${escapeHtml(
        err instanceof Error ? err.message : String(err),
      )}</p>`;
    }
  }
}

void loadGuide();
