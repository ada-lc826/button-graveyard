// Pure functions: safety classification and verdicts. No browser here, so they are unit-testable.

export const DANGER_RE = new RegExp(
  [
    String.raw`\b(delete|remove|destroy|erase|purge|wipe|truncate|drop\s+(table|database|db))\b`,
    String.raw`\breset\s+(all|data|account|password|everything)\b`,
    String.raw`\b(deactivate|terminate|revoke|ban|kick)\b`,
    String.raw`\b(pay|payment|checkout|check\s+out|purchase|buy|order\s+now|place\s+order|charge|refund|transfer|withdraw|billing)\b`,
    String.raw`\b(subscribe|unsubscribe|upgrade\s+plan|cancel\s+(plan|subscription))\b`,
    String.raw`\b(send|invite|publish|deploy)\b`,
    String.raw`\b(log\s?out|sign\s?out|close\s+account)\b`,
    '删除|移除|清空|注销|退出登录|登出|支付|付款|购买|下单|结算|订阅|发送|发布|部署|转账|提现',
  ].join('|'),
  'i'
);

export function classifySafety(c, { targetOrigin, allowDanger = false, skipRe = null, onlyRe = null }) {
  const hay = [c.name, c.text, c.id, c.className, c.testid, c.title, c.href, c.formAction]
    .filter(Boolean).join(' ');
  if (onlyRe && !onlyRe.test(hay) && !onlyRe.test(c.selector)) return { skip: 'not matched by --only' };
  if (skipRe && (skipRe.test(hay) || skipRe.test(c.selector))) return { skip: 'excluded by --skip' };
  if (c.disabled) return { skip: 'disabled (intentionally inert)' };
  if (!allowDanger && DANGER_RE.test([c.name, c.text, c.title, c.testid, c.id].filter(Boolean).join(' ')))
    return { skip: 'looks destructive / irreversible (use --allow-danger to include)' };
  if (c.tag === 'a' && c.href) {
    if (/^(mailto|tel|sms):/i.test(c.href)) return { skip: 'mailto/tel link (has a real destination)' };
    if (c.absHref) {
      try {
        const u = new URL(c.absHref);
        if (/^https?:$/.test(u.protocol) && u.origin !== targetOrigin)
          return { skip: 'external link (not followed)' };
      } catch {}
    }
  }
  return { skip: null };
}

export function isEmptyHref(href) {
  return href != null && /^(#!?|javascript:\s*(void\s*\(?0\)?;?)?;?|)$/i.test(href.trim());
}

/**
 * evidence = {
 *   actionability: { ok, kind: 'covered'|'not-visible'|'detached'|'timeout'|..., message },
 *   interrupted: string|null,
 *   signals: { navigation, popup, download, dialog, filechooser, requests[], writesIntercepted[],
 *              domChanges[], storage, scroll, clipboard, print, submit, visual, transientDom },
 *   pageErrors[], console[], visualNoisy, domNoise
 * }
 */
export function decide(ev) {
  if (!ev.actionability.ok) {
    if (ev.actionability.kind === 'covered')
      return { verdict: 'blocked', reason: ev.actionability.message || 'another element intercepts the click' };
    return { verdict: 'unknown', reason: 'not clickable: ' + (ev.actionability.message || ev.actionability.kind) };
  }
  if (ev.interrupted) return { verdict: 'unknown', reason: ev.interrupted };

  const s = ev.signals;
  const effects = [];
  if (s.navigation) effects.push('navigation → ' + s.navigation);
  if (s.popup) effects.push('opened a new tab → ' + s.popup);
  if (s.download) effects.push('download → ' + s.download);
  if (s.dialog) effects.push('dialog → ' + s.dialog);
  if (s.filechooser) effects.push('file chooser opened');
  if (s.writesIntercepted.length) effects.push('write request intercepted (not sent) → ' + s.writesIntercepted[0]);
  if (s.requests.length) effects.push('network request → ' + s.requests[0]);
  if (s.clipboard) effects.push('clipboard write');
  if (s.print) effects.push('print dialog');
  if (s.submit) effects.push('form submitted');
  if (s.domChanges.length) effects.push('DOM changed (' + s.domChanges.length + ' node' + (s.domChanges.length > 1 ? 's' : '') + ')');
  if (s.storage) effects.push('storage changed');
  if (s.scroll) effects.push('page scrolled');
  if (!effects.length && s.visual) effects.push('canvas pixels changed');
  const netErr = ev.pageErrors.find((e) => /Failed to fetch|NetworkError|Load failed|ERR_/i.test(e));
  if (!effects.length && netErr) effects.push('network request attempted (failed: ' + netErr + ')');

  if (effects.length) return { verdict: 'alive', reason: effects.join('; '), effects };

  if (ev.current && !ev.pageErrors.length && !ev.console.length)
    return { verdict: 'unknown', reason: 'already the current/selected item: clicking it again is expected to do nothing' };

  const notes = [];
  if (ev.pageErrors.length) notes.push('threw ' + ev.pageErrors[0]);
  if (ev.console.length) notes.push('only logged: ' + ev.console[0]);
  if (s.transientDom) notes.push('only transient DOM flicker (e.g. ripple/press state)');
  const confidence = ev.domNoise > 0 || ev.visualNoisy ? 'medium' : 'high';
  return {
    verdict: 'dead',
    reason: notes.length ? notes.join('; ') : 'no observable effect: no request, navigation, DOM, storage, dialog or pixel change',
    cause: ev.pageErrors.length ? 'crashed' : ev.console.length ? 'stub' : 'no-op',
    confidence,
  };
}

export function epitaph(r) {
  if (r.cause === 'crashed') return 'Died throwing ' + (r.pageErrors[0] || 'an error');
  if (r.cause === 'stub') return 'Last words: ' + r.console[0];
  if (r.verdict === 'blocked') return 'Buried alive under ' + (r.blocker || 'an invisible layer');
  return 'Was clicked. Nothing happened.';
}

export function keyOf(r) {
  return (r.page || '') + '::' + (r.testid || r.id || r.selector) + '::' + (r.name || '');
}

export function compareRuns(prev, curr) {
  const before = new Map(prev.results.map((r) => [keyOf(r), r]));
  const out = { resurrected: [], newlyDead: [], stillDead: [] };
  const DEADISH = new Set(['dead', 'blocked']);
  for (const r of curr.results) {
    const p = before.get(keyOf(r));
    if (!p) continue;
    if (DEADISH.has(p.verdict) && r.verdict === 'alive') out.resurrected.push({ ...r, was: p.verdict });
    else if (p.verdict === 'alive' && DEADISH.has(r.verdict)) out.newlyDead.push({ ...r, was: p.verdict });
    else if (DEADISH.has(p.verdict) && DEADISH.has(r.verdict)) out.stillDead.push(r);
  }
  return out;
}
