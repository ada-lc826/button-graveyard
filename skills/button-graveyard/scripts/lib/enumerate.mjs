// Runs inside the page (passed to page.evaluate). Must be self-contained.
export function enumerateControls({ max, extraSelectors }) {
  const SEMANTIC = [
    'button', 'a', '[role=button]', '[role=link]', '[role=menuitem]', '[role=tab]',
    '[role=switch]', '[role=option]', 'input[type=button]', 'input[type=submit]',
    'input[type=reset]', 'input[type=image]', 'summary', '[onclick]',
    ...(extraSelectors || []),
  ].join(',');

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return false;
    if (el.closest('[hidden],[aria-hidden=true],[inert]')) return false;
    return true;
  };

  const set = new Set();
  const origin = new Map();
  for (const el of document.querySelectorAll(SEMANTIC)) {
    if (el.tagName === 'A' && !el.hasAttribute('href') && !el.hasAttribute('role') && !el.hasAttribute('onclick')) continue;
    set.add(el); origin.set(el, 'semantic');
  }
  // "Looks clickable": pointer cursor that it does not inherit from its parent.
  const NOT_POINTER = /^(INPUT|TEXTAREA|SELECT|LABEL|OPTION|HTML|BODY|IFRAME|VIDEO|AUDIO|CANVAS)$/;
  for (const el of document.body.querySelectorAll('*')) {
    if (set.has(el) || NOT_POINTER.test(el.tagName)) continue;
    if (el.closest(SEMANTIC)) continue; // inside a real control
    const cs = getComputedStyle(el);
    if (cs.cursor !== 'pointer') continue;
    const p = el.parentElement;
    if (p && getComputedStyle(p).cursor === 'pointer') continue;
    if (el.querySelector(SEMANTIC)) continue; // wrapper around real controls
    set.add(el); origin.set(el, 'looks-clickable');
  }

  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(textOf).join(' ');
      if (t) return t;
    }
    const lines = (el.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const t = lines.length > 1 ? lines[0] : textOf(el);
    if (t) return t.slice(0, 80);
    if (el.value && typeof el.value === 'string') return el.value.slice(0, 80);
    if (el.title) return el.title;
    const img = el.querySelector('img[alt]');
    if (img && img.alt) return img.alt;
    const st = el.querySelector('svg title');
    if (st && st.textContent.trim()) return st.textContent.trim();
    return '';
  };

  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));
  const unique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch (e) { return false; } };
  const selectorOf = (el) => {
    if (el.id && !/\d{3,}|^:r/.test(el.id)) { const s = '#' + cssEsc(el.id); if (unique(s)) return s; }
    for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-qa']) {
      const v = el.getAttribute(attr);
      if (v) { const s = '[' + attr + '="' + v.replace(/"/g, '\\"') + '"]'; if (unique(s)) return s; }
    }
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      let p = n.tagName.toLowerCase();
      if (n !== el && n.id && !/\d{3,}|^:r/.test(n.id) && unique('#' + cssEsc(n.id))) { parts.unshift('#' + cssEsc(n.id)); break; }
      const par = n.parentElement;
      if (par) {
        let i = 1, s = n;
        while ((s = s.previousElementSibling)) if (s.tagName === n.tagName) i++;
        p += ':nth-of-type(' + i + ')';
      }
      parts.unshift(p);
      n = par;
    }
    return parts.join(' > ');
  };

  const out = [];
  for (const el of set) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    const form = el.form || el.closest('form');
    out.push({
      selector: selectorOf(el),
      origin: origin.get(el),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || null,
      name: nameOf(el),
      text: textOf(el).slice(0, 120),
      href,
      absHref: el.tagName === 'A' && el.href ? el.href : null,
      type: el.getAttribute('type'),
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className.slice(0, 200) : null,
      testid: el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy') || null,
      title: el.getAttribute('title'),
      formAction: form ? form.getAttribute('action') : null,
      disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      current: el.getAttribute('aria-selected') === 'true' || (el.hasAttribute('aria-current') && el.getAttribute('aria-current') !== 'false') ||
        el.getAttribute('data-state') === 'active' || el.hasAttribute('data-active') ||
        (typeof el.className === 'string' && /(^|\s)(is-)?(active|selected|current)(\s|$)/.test(el.className)),
      box: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      html: el.outerHTML.slice(0, 400),
    });
    if (out.length >= max) break;
  }
  // Stable, deterministic order: top-to-bottom, left-to-right.
  out.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  return out;
}
