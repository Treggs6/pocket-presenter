// pocket-presenter runtime. present.py adds this to the deck page; the laptop shell and the phone each load the deck
// in a frame and drive it through postMessage. It turns the deck into steps: one per slide, plus one per fragment
// build, each with the speaker notes to say there.
//   Slides: top-level <section> elements (or reveal.js slides, if the deck uses reveal.js).
//   Notes:  <aside class="notes"> inside a slide. An aside inside a .fragment belongs to that build.
//   Builds: elements with class="fragment", in DOM order; the same data-fragment-index appears together.
(function () {
  if (window.top === window) return;                     // opened directly: leave the deck alone
  const mode = new URLSearchParams(location.search).get('pp_mode') || 'audience';   // audience | preview
  const preview = mode === 'preview';
  let steps = [], cur = -1, pending = 0, reveal = null, slides = [];

  const css = document.createElement('style');
  css.textContent = 'aside.notes{display:none!important}' +
    'html.pp-plain,html.pp-plain body{overflow:hidden!important}' +
    'html.pp-plain section.pp-off{display:none!important}' +
    'html.pp-plain .fragment{opacity:0;visibility:hidden;transition:opacity .35s,visibility .35s}' +
    'html.pp-plain .fragment.pp-shown{opacity:1;visibility:visible}' +
    (preview ? '*,*::before,*::after{transition:none!important}' : '');
  document.head.appendChild(css);

  const clean = t => t.replace(/\s+/g, ' ').trim();
  function paragraphs(el) {                              // notes as a list of paragraphs
    if (!el) return [];
    const blocks = el.querySelectorAll('p,li');
    if (blocks.length) return [...blocks].map(b => clean(b.textContent)).filter(Boolean);
    return el.textContent.split(/\n\s*\n/).map(clean).filter(Boolean);
  }
  const own = (sec, sel) => [...sec.querySelectorAll(sel)].filter(e => e.closest('section') === sec);

  function builds(sec) {                                 // fragments grouped into click-by-click builds
    const map = new Map(); let auto = 0;
    own(sec, '.fragment').forEach(f => {
      const k = f.hasAttribute('data-fragment-index') ? +f.dataset.fragmentIndex : 1e6 + auto++;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(f);
    });
    return [...map.keys()].sort((a, b) => a - b).map(k => map.get(k));
  }

  function stepsFor(sec, k, extraNotes) {
    const groups = builds(sec), notes = own(sec, 'aside.notes');
    const scoped = g => notes.filter(n => g.some(f => f.contains(n)));
    const base = notes.filter(n => !n.closest('.fragment')).flatMap(paragraphs).concat(extraNotes || []);
    const anyScoped = groups.some(g => scoped(g).length);
    const out = [];
    for (let f = 0; f <= groups.length; f++) {
      const say = !anyScoped || f === 0 ? base : scoped(groups[f - 1]).flatMap(paragraphs);
      out.push({ slide: k, build: f, builds: groups.length, say, same: f > 0 && !anyScoped });
    }
    return { groups, out };
  }

  function pauseAll(root) { root.querySelectorAll('video,audio').forEach(m => { try { m.pause(); } catch (e) {} }); }
  function startMedia(sec) {
    if (preview) return;
    sec.querySelectorAll('video[autoplay],audio[autoplay]').forEach(m => { try { m.currentTime = 0; const p = m.play(); if (p) p.catch(() => {}); } catch (e) {} });
  }

  // ---- plain HTML decks: show one <section> at a time
  function initPlain() {
    document.documentElement.classList.add('pp-plain');
    slides = [...document.querySelectorAll('section')].filter(s => !s.parentElement.closest('section'));
    if (!slides.length) slides = [document.body];
    slides.forEach((sec, k) => {
      const { groups, out } = stepsFor(sec, k);
      sec._ppGroups = groups; steps.push(...out);
    });
    if (preview) document.querySelectorAll('video,audio').forEach(m => { m.muted = true; m.removeAttribute('autoplay'); });
    pauseAll(document);
  }
  function showPlain(s) {
    const st = steps[s], prev = steps[cur];
    slides.forEach((sec, k) => { if (sec !== document.body) sec.classList.toggle('pp-off', k !== st.slide); });
    slides[st.slide]._ppGroups.forEach((g, n) => g.forEach(f => f.classList.toggle('pp-shown', n < st.build)));
    if (!prev || prev.slide !== st.slide) {
      slides.forEach((sec, k) => { if (k !== st.slide) pauseAll(sec); });
      startMedia(slides[st.slide]);
      window.scrollTo(0, 0);
    }
  }

  // ---- reveal.js decks: drive Reveal instead
  function initReveal() {
    reveal = window.Reveal;
    reveal.configure({ controls: false, progress: false, keyboard: false, touch: false, hash: false, history: false,
                       overview: false, help: false, ...(preview ? { transition: 'none', backgroundTransition: 'none' } : {}) });
    slides = reveal.getSlides();
    slides.forEach((sec, k) => {
      const extra = sec.hasAttribute('data-notes') ? [clean(sec.getAttribute('data-notes'))] : [];
      const { out } = stepsFor(sec, k, extra);
      const { h, v } = reveal.getIndices(sec);
      out.forEach(o => { o.h = h; o.v = v || 0; });
      steps.push(...out);
    });
    if (preview) document.querySelectorAll('video,audio').forEach(m => { m.muted = true; });
  }
  function showReveal(s) { const st = steps[s]; reveal.slide(st.h, st.v, st.build - 1); }

  function go(s) {
    if (!steps.length) { pending = s; return; }
    s = Math.max(0, Math.min(steps.length - 1, s));
    (reveal ? showReveal : showPlain)(s); cur = s;
  }

  addEventListener('message', ev => {
    const d = ev.data || {};
    if (d.pp === 'goto') go(d.step);
  });
  addEventListener('keydown', e => {                     // keys pressed while the deck has focus go to the shell
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' ', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) e.preventDefault();
    parent.postMessage({ pp: 'key', key: e.key }, '*');
  }, true);

  function ready() {
    if (window.Reveal && typeof window.Reveal.getSlides === 'function') {
      if (window.Reveal.isReady && !window.Reveal.isReady()) { window.Reveal.on('ready', ready); return; }
      initReveal();
    } else initPlain();
    parent.postMessage({ pp: 'ready', title: document.title,
      steps: steps.map(({ slide, build, builds, say, same }) => ({ slide, build, builds, say, same })) }, '*');
    go(pending);
  }
  if (document.readyState === 'complete') setTimeout(ready, 0); else addEventListener('load', () => setTimeout(ready, 0));
})();
