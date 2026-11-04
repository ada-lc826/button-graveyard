// In-page probe. Installed with context.addInitScript before any app code runs.
// It never changes app behaviour except: window.print becomes a recorded no-op.
export const INJECT = String.raw`(() => {
  if (window.__bg) return;
  const bg = (window.__bg = { muts: 0, clip: [], prints: 0, submits: 0, snaps: {} });

  function pathOf(node) {
    let n = node && node.nodeType === 1 ? node : node && node.parentElement;
    const parts = [];
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      let p = n.tagName.toLowerCase();
      if (n.id && /^[A-Za-z][\w-]*$/.test(n.id)) { parts.unshift(p + '#' + n.id); break; }
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
  }
  bg.pathOf = pathOf;

  try {
    new MutationObserver((l) => { bg.muts += l.length; })
      .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  } catch (e) {}

  try {
    const c = navigator.clipboard;
    if (c) for (const k of ['writeText', 'write']) {
      const o = c[k] && c[k].bind(c);
      if (o) c[k] = (...a) => { bg.clip.push(k); return o(...a); };
    }
  } catch (e) {}
  try {
    const ex = document.execCommand.bind(document);
    document.execCommand = (cmd, ...r) => { if (/^(copy|cut)$/i.test(cmd)) bg.clip.push(cmd); return ex(cmd, ...r); };
  } catch (e) {}
  try { window.print = () => { bg.prints++; }; } catch (e) {}
  document.addEventListener('submit', () => { bg.submits++; }, true);

  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, LINK: 1, META: 1 };
  function fingerprint() {
    const out = new Map();
    const walk = (root, prefix) => {
      const els = root.querySelectorAll('*');
      for (const el of els) {
        if (SKIP[el.tagName]) continue;
        let sig = '';
        for (const a of el.attributes) {
          // Browsers/tools sometimes add an empty style or class attribute: not a visible change.
          if ((a.name === 'style' || a.name === 'class') && !a.value.trim()) continue;
          sig += a.name + '=' + a.value + ';';
        }
        let own = '';
        for (const c of el.childNodes) if (c.nodeType === 3) own += c.nodeValue;
        sig += '|' + own.trim().slice(0, 500);
        if ('value' in el && typeof el.value === 'string') sig += '|v=' + el.value;
        if ('checked' in el) sig += '|c=' + el.checked;
        if (el.tagName === 'DIALOG' || el.tagName === 'DETAILS') sig += '|o=' + el.open;
        if (el.scrollTop || el.scrollLeft) sig += '|s=' + el.scrollTop + ',' + el.scrollLeft;
        out.set(prefix + pathOf(el), sig);
        if (el.shadowRoot) walk(el.shadowRoot, prefix + pathOf(el) + ' >>> ');
      }
    };
    if (document.body) walk(document.body, '');
    out.set('::window-scroll', window.scrollX + ',' + window.scrollY);
    return out;
  }
  function diff(a, b) {
    const changed = [];
    for (const [k, v] of b) if (a.get(k) !== v) changed.push(k);
    for (const k of a.keys()) if (!b.has(k)) changed.push(k);
    return changed;
  }
  bg.snap = (name) => { bg.snaps[name] = fingerprint(); return bg.snaps[name].size; };
  bg.diff = (from, to, ignore) => {
    const ig = new Set(ignore || []);
    const b = to ? bg.snaps[to] : fingerprint();
    return diff(bg.snaps[from], b).filter((p) => !ig.has(p));
  };
  bg.explain = (from, paths) => { const now = fingerprint(); return paths.map((p) => [p, bg.snaps[from].get(p), now.get(p)]); };
  bg.storage = () => {
    const dump = (s) => { const o = {}; try { for (let i = 0; i < s.length; i++) { const k = s.key(i); o[k] = s.getItem(k); } } catch (e) {} return o; };
    return JSON.stringify([dump(localStorage), dump(sessionStorage), document.cookie]);
  };
})();`;
