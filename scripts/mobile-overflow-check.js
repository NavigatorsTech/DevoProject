// Manual mobile-responsiveness overflow/wrap detector for qtapp.
//
// This is NOT a Node script and NOT part of any test suite (the repo has
// none - see CLAUDE.md). It's a browser-console snippet, in the same "no new
// dependency, human-invoked" spirit as scripts/validate-data.mjs. Paste the
// whole file into DevTools console on any qtapp page (localhost:3000 or
// production) and it defines the helpers below; nothing runs automatically.
//
// Why this exists: Chrome's window can't be resized below ~400-500px on
// macOS, so you can't just shrink the browser to test a 320/390px phone
// width. This builds three same-origin <iframe>s at real mobile widths
// instead - each gets a true layout viewport, so media queries and Vuetify's
// grid resolve correctly - then scans each for overflow and unintended wraps.
//
// Usage:
//   1. Open DevTools console on http://localhost:3000/ (or prod), paste this
//      whole file, press enter.
//   2. __go('/some/route')                 - navigate all 3 frames
//   3. __scan('label')                     - overflow report (see below)
//   4. __scanW('label')                    - wrap report (see below)
//   5. __click(selector, index)            - click the Nth match in every frame
//   6. __scroll(y)                         - scroll every frame
//
// __scan finds:
//   OFFSCREEN_R/L  - an element's box extends past the viewport edge (the
//                    literal "buttons go off screen" bug this was written for)
//   SPILL          - content wider than its box, overflow:visible (bleeding out)
//   CLIPPED        - content wider than its box, overflow:hidden, no ellipsis
//   TRUNCATED      - text-overflow:ellipsis fired - `full` gives you the text
//                    the user can't see (Vuetify's card-title/list-item-title/
//                    label nowrap+ellipsis, invisible in a screenshot)
//   H_SCROLLER     - a container with overflow-x:auto whose content overflows
//                    (expected for PlanEditor's <v-table>; suspicious elsewhere)
// `docScrollX > 0` in the summary means the WHOLE PAGE scrolls sideways -
// always a bug on mobile.
//
// __scanW finds flex rows that wrapped to multiple lines, flagging `orphan:
// true` when the last line holds exactly one item - the shape of the
// PlanCard chevron bug this pass fixed (a <v-spacer> inside a flex-wrap
// container absorbs space unevenly per line and strands the next item alone
// on the next line). Not every WRAPPED hit is a bug - see the allowlist below.
//
// Known limitation: pages that respond with `X-Frame-Options: DENY` (Nuxt/H3's
// default error-handler header - i.e. any thrown createError(), including
// error.vue's 404) refuse to load in an iframe at all and will show up as a
// cross-origin SecurityError from __go/__scan. Test those by resizing an
// actual top-level tab instead (coarse - can't get below ~500px on macOS) or
// just eyeball them; this tool can't reach them.

window.__buildRig = function () {
  const SIZES = [[320, 700], [390, 700], [600, 700]];
  const ORIGIN = location.origin;
  document.documentElement.innerHTML =
    '<head><style>html,body{margin:0;background:#111;color:#bbb;font:12px system-ui}' +
    '#rig{display:flex;gap:10px;padding:6px;align-items:flex-start;flex-wrap:wrap}' +
    'figure{margin:0}figcaption{padding:2px 0;font-weight:600}' +
    'iframe.vp{border:1px solid #666;background:#000;display:block}</style></head>' +
    '<body><div id="rig"></div></body>';
  const rig = document.getElementById('rig');
  for (const [w, h] of SIZES) {
    const fig = document.createElement('figure');
    fig.innerHTML = '<figcaption>' + w + '×' + h + '</figcaption>';
    const f = document.createElement('iframe');
    f.className = 'vp';
    f.dataset.w = String(w);
    f.width = w;
    f.height = h;
    f.src = ORIGIN + '/';
    fig.appendChild(f);
    rig.appendChild(fig);
  }
  return 'rig ready';
};

window.__frames = () => [...document.querySelectorAll('iframe.vp')];
window.__each = (fn) => __frames().map((f) => {
  try {
    return { w: f.dataset.w, r: fn(f.contentWindow, f.contentWindow.document) };
  } catch (e) {
    return { w: f.dataset.w, r: 'ERR ' + e.message };
  }
});
window.__go = (path) => Promise.all(__frames().map((f) => new Promise((res) => {
  f.onload = () => setTimeout(res, 900);
  f.src = location.origin + path;
}))).then(() => 'navigated ' + path);
window.__click = (sel, i = 0) => __each((w, d) => {
  const el = d.querySelectorAll(sel)[i];
  if (!el) return 'miss';
  el.click();
  return 'ok';
});
window.__scroll = (y) => __each((w) => { w.scrollTo(0, y); return w.scrollY; });

window.__ovf = function (win, tag) {
  const doc = win.document, DOC = doc.documentElement;
  const VW = DOC.clientWidth, TOL = 1;
  const IGNORE = [
    '[id^="nuxt-devtools"]', 'nuxt-devtools-anchor',
    '.v-navigation-drawer:not(.v-navigation-drawer--active)',
    '.v-overlay:not(.v-overlay--active)'
  ].join(',');
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'BR', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE']);
  const FIELD = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  const HTMLNS = 'http://www.w3.org/1999/xhtml';
  const lbl = (el) => {
    const c = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : '');
  };
  const pathOf = (el) => {
    const p = []; let n = el;
    for (let i = 0; i < 3 && n && n !== doc.body; i++) { p.unshift(lbl(n)); n = n.parentElement; }
    return p.join('>');
  };
  const txt = (el, n = 80) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const out = [], seen = new Map(), scrollers = new WeakSet(), inScroll = new WeakMap();
  const hasAnc = (el, k) => {
    let n = el.parentElement;
    while (n) { const s = seen.get(n); if (s && s.has(k)) return true; n = n.parentElement; }
    return false;
  };
  const add = (el, k, ex) => {
    if (hasAnc(el, k)) return;
    let s = seen.get(el); if (!s) { s = new Set(); seen.set(el, s); }
    s.add(k);
    out.push(Object.assign({ k, px: 0, at: pathOf(el), t: txt(el) }, ex));
  };
  for (const el of doc.body.querySelectorAll('*')) {
    if (el.namespaceURI !== HTMLNS) continue;
    if (SKIP.has(el.tagName)) continue;
    if (el.closest(IGNORE)) continue;
    const p = el.parentElement;
    const under = p && p !== doc.body ? (scrollers.has(p) || inScroll.get(p) === true) : false;
    inScroll.set(el, under);
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const ox = cs.overflowX;
    if (ox === 'auto' || ox === 'scroll') scrollers.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (!under) {
      const oR = Math.round(r.right - VW), oL = Math.round(-r.left);
      if (oR > TOL) add(el, 'OFFSCREEN_R', { px: oR, right: Math.round(r.right) });
      if (oL > TOL) add(el, 'OFFSCREEN_L', { px: oL, left: Math.round(r.left) });
    }
    if (!FIELD.has(el.tagName) && el.clientWidth > 0) {
      const over = el.scrollWidth - el.clientWidth;
      if (over > TOL) {
        if (ox === 'auto' || ox === 'scroll') add(el, 'H_SCROLLER', { px: over });
        else if (cs.textOverflow === 'ellipsis') add(el, 'TRUNCATED', { px: over, full: txt(el, 200) });
        else if (ox === 'hidden' || ox === 'clip') add(el, 'CLIPPED', { px: over });
        else add(el, 'SPILL', { px: over });
      }
    }
  }
  out.sort((a, b) => b.px - a.px);
  return {
    tag, vw: VW, docScrollX: Math.max(0, Math.round(DOC.scrollWidth - VW)),
    counts: out.reduce((m, f) => (m[f.k] = (m[f.k] || 0) + 1, m), {}), top: out.slice(0, 25)
  };
};
window.__scan = (tag) => JSON.stringify(__frames().map((f) => __ovf(f.contentWindow, tag + '@' + f.dataset.w)));

window.__wrap = function (win, tag) {
  const doc = win.document, VW = doc.documentElement.clientWidth;
  const IGNORE = '[id^="nuxt-devtools"],nuxt-devtools-anchor,.v-navigation-drawer:not(.v-navigation-drawer--active)';
  const HTMLNS = 'http://www.w3.org/1999/xhtml';
  const lbl = (el) => {
    const c = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : '');
  };
  const pathOf = (el) => {
    const p = []; let n = el;
    for (let i = 0; i < 3 && n && n !== doc.body; i++) { p.unshift(lbl(n)); n = n.parentElement; }
    return p.join('>');
  };
  const nm = (el) => ((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22)) || ('<' + el.tagName.toLowerCase() + '>');
  const out = [];
  for (const el of doc.body.querySelectorAll('*')) {
    if (el.namespaceURI !== HTMLNS) continue;
    if (el.closest(IGNORE)) continue;
    const cs = win.getComputedStyle(el);
    if (cs.display !== 'flex' && cs.display !== 'inline-flex') continue;
    if (cs.flexDirection.startsWith('column')) continue;
    const kids = [...el.children].filter((c) => {
      if (c.namespaceURI !== HTMLNS) return false;
      if (c.classList.contains('v-spacer')) return false;
      const s = win.getComputedStyle(c);
      if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'absolute' || s.position === 'fixed') return false;
      const r = c.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    });
    if (kids.length < 2) continue;
    const rects = kids.map((c) => ({ c, r: c.getBoundingClientRect() }));
    const inner = el.clientWidth;
    if (cs.flexWrap === 'nowrap') {
      // Can't wrap at all - flag it only if children are already forced past
      // the container edge (e.g. by `.v-btn { flex-shrink: 0 }`).
      const span = Math.max(...rects.map((x) => x.r.right)) - Math.min(...rects.map((x) => x.r.left));
      if (span - inner > 2) {
        out.push({ k: 'NOWRAP_OVERFLOW', px: Math.round(span - inner), at: pathOf(el), w: Math.round(inner), items: kids.map(nm) });
      }
      continue;
    }
    // Group by VERTICAL OVERLAP, not top-equality - `align-items:center` (the
    // Vuetify default) shifts a shorter sibling's `top` relative to a taller
    // one even on the same flex line, which top-equality misreads as a wrap.
    const rows = [];
    for (const { c, r } of rects) {
      const row = rows.find((x) => r.top < x.bottom - 1 && r.bottom > x.top + 1);
      if (row) { row.items.push(c); row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); }
      else rows.push({ top: r.top, bottom: r.bottom, items: [c] });
    }
    rows.sort((a, b) => a.top - b.top);
    if (rows.length > 1) {
      out.push({
        k: 'WRAPPED', lines: rows.length, orphan: rows[rows.length - 1].items.length === 1,
        at: pathOf(el), w: Math.round(inner), rows: rows.map((r) => r.items.map(nm))
      });
    }
  }
  out.sort((a, b) => (b.k === 'NOWRAP_OVERFLOW') - (a.k === 'NOWRAP_OVERFLOW')
    || (b.orphan ? 1 : 0) - (a.orphan ? 1 : 0) || (b.lines || 0) - (a.lines || 0));
  return { tag, vw: VW, count: out.length, top: out.slice(0, 20) };
};
window.__scanW = (tag) => JSON.stringify(__frames().map((f) => __wrap(f.contentWindow, tag + '@' + f.dataset.w)));

__buildRig();

// --- Stop checklist (2026-07-26 mobile-responsiveness pass) ---------------
// Widths: 320 (bug-finding floor), 390 (the modal device - bugs here are
// ship-blockers), 600 (exact xs/sm boundary - two controls, PlanEditor's
// Month/Year selects, get NARROWER here, and StreakCard's stacking drops out).
// Auth-gated routes need a logged-in dev-Firebase test account first (see
// the project memory file / CLAUDE.md) - log in once in one frame, cookies
// are shared across all three since they're same-origin.
//
//   /                                    - logged out: CTA row, no gutter bug
//   /journalList (login-check bounce)    - X-Frame-Options blocks the iframe;
//                                           check via a real tab instead
//   /auth                                 - default, then a failed-login snackbar
//   / (authenticated)                     - StreakCard both branches
//   /journalList                          - JournalCard subtitle (passage ref
//                                           truncation), infinite scroll
//   /journalList/createEntry              - 3-button row, draft-restored snackbar
//   /journalList/[jid]                    - 4-button row, Update/Delete dialogs
//   /plansList                            - PlanCard: both chip states, expanded,
//                                           notOwner (disabled buttons)
//   /plansList/createPlan                 - Month/Year selects at "September",
//                                           PassagePicker all 3 steps (use a
//                                           long book like "Song of Songs" and
//                                           check multiple chapters to get the
//                                           longest possible verse labels),
//                                           its own snackbar
//   /plansList/[pid]                      - same PlanEditor, Update dialog
//   nav drawer (hamburger icon)           - v-list-item-title wrap
//
// --- Allowlist: WRAPPED/TRUNCATED hits that are INTENTIONAL, not bugs -----
// (docScrollX > 0, any OFFSCREEN_*, or NOWRAP_OVERFLOW are never allowlisted
// - those are always real bugs.)
//
//  - StreakCard's v-card-title (".v-card-title.text-wrap"): wraps to 2-3
//    lines below 600px by design (current-streak line, message, "Best: N
//    days" chip each get their own line via flex-1-1-100/ms-auto). The chip
//    never orphans onto a line by itself in a way that looks broken - verify
//    visually if in doubt, don't just trust the WRAPPED flag.
//  - PlanCard's inner button group (".v-card-actions.flex-nowrap > .d-flex.
//    flex-wrap"): the Update/Delete/chip group may drop the chip to its own
//    line at 320-360px on a long chip label. This is fine BECAUSE the outer
//    v-card-actions is flex-nowrap - the expand chevron is structurally
//    pinned right and never wraps, at any width, regardless of what the
//    inner group does.
//  - Any "div>form.v-form>div.v-row" WRAPPED with 2 lines at 320/390 in
//    PlanEditor: that's the Month/Year <v-col cols="12" sm="4"> pair stacking
//    on purpose below the sm breakpoint.
//  - "SPILL" of exactly ~12px on "main.v-main>div.v-container...>div" on
//    every PlanEditor/QTJournalEditor page, at every width: a pre-existing
//    Vuetify grid artifact (a nested <v-row>'s -12px margins vs. a parent
//    that isn't itself a <v-container>). Confirmed harmless - docScrollX is 0
//    on every one of these pages, i.e. it never produces a real visible
//    scrollbar. If this number changes or a real scrollbar appears, that's a
//    regression; the flat 12px by itself is not.
