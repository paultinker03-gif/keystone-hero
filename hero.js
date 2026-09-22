(function () {
  'use strict';

  function boot() {
    // ---- where the screenshots live --------------------------------------
    // One absolute URL, used everywhere: local preview, Carrd, anywhere else.
    // There was a "use the sibling shots/ folder on localhost" shortcut here;
    // it meant the embed took a different code path in preview than in
    // production, and it resolved to nothing inside a sandboxed preview, which
    // silently hid every card. One path is worth the loss of offline preview.
    //
    // jsDelivr mirrors the public GitHub repo as a real CDN. It caches @main
    // hard, so after re-running scripts/build-hero-shots.mjs and re-uploading,
    // either purge each changed file via https://purge.jsdelivr.net/gh/... or
    // tag a release and point this at @v2.
    var KS_BASE = 'https://cdn.jsdelivr.net/gh/paultinker03-gif/keystone-hero@main';

    // ---- the composition --------------------------------------------------
    // Two layouts of the same six screens. x / y / w are design-space pixels
    // inside the stage and become percentages, so the fan scales with the
    // column but never reflows. Cards are meant to run off the edges — that
    // bleed is the composition. z is depth: it stacks them, it scales them
    // through the perspective, and it sets how far each one travels under the
    // pointer, so the fan opens and closes rather than sliding as a block.
    //
    // At rest the stage is square on to the viewer and simply tilted 10 degrees
    // in the plane of the page, so every screen stays legible when nobody is
    // touching it. Moving over it swings the stage into perspective — the tilt
    // into 3D IS the interaction. Flip the sign of rz to tilt the other way.
    //
    // At phone widths the wide fan would be six illegible slivers, so the
    // narrow layout drops to four screens, much larger, in a taller frame.
    var LAYOUTS = {
      wide: {
        // 2000 x 700 to match the reference composition one for one, so these
        // numbers can be read straight off it.
        w: 2000, h: 700,
        camera: { rx: 0, ry: 0, rz: -10 },
        motion: 1,
        pos: {
          'smart-dashboard':  { x:  775, y:   65, w: 960, z: -150 },
          'zurich-ar':        { x:  175, y:  150, w: 320, z:  -80 },
          'niac-invest':      { x:  553, y:  410, w: 380, z:  -20 },
          'zurich-balance':   { x: 1295, y:  450, w: 700, z:   60 },
          // The two dark screens are the foreground, pushed out to either edge.
          'smart-dark-phone': { x: -150, y:  330, w: 420, z:  150 },
          'smart-dark':       { x: 1660, y:  130, w: 900, z:  220 }
        }
      },
      narrow: {
        w: 900, h: 980,
        camera: { rx: 0, ry: 0, rz: -10 },
        // A phone-sized fan needs proportionally more travel to read as motion.
        motion: 1.35,
        // Its own stacking: at this size the dark dashboard works better behind,
        // where it frames the top rather than burying the light one.
        pos: {
          'smart-dark':       { x: 280, y: -170, w: 720, z: -150 },
          'smart-dashboard':  { x:  55, y:  120, w: 830, z:  -30 },
          'zurich-ar':        { x: -70, y:  505, w: 340, z:   30 },
          'zurich-balance':   { x: 300, y:  595, w: 720, z:  150 }
        }
      }
    };

    // The screens themselves. Which one sits in front, and how far it travels
    // under the pointer, is a property of each layout above — inside a
    // preserve-3d stage the browser orders by 3D position and z-index is
    // ignored, and z also scales a card through the perspective, so z and the
    // widths have to be tuned together per layout.
    var CARDS = [
      { id: 'smart-dashboard',  device: 'desktop', alt: 'Member dashboard, Smart Pension, light theme' },
      { id: 'zurich-ar',        device: 'mobile',  alt: 'Member dashboard on mobile, Zurich, dark theme, in Arabic, right to left' },
      { id: 'niac-invest',      device: 'tablet',  alt: 'Investments, step one of three, New Ireland, light theme' },
      { id: 'zurich-balance',   device: 'desktop', alt: 'Pension balance, Zurich, light theme' },
      { id: 'smart-dark-phone', device: 'mobile',  alt: 'Member dashboard on mobile, Smart Pension, dark theme' },
      { id: 'smart-dark',       device: 'desktop', alt: 'Member dashboard, Smart Pension, dark theme' }
    ];

    var NARROW_BELOW = 640;   // px of scene width
    var PERSPECTIVE = 2600;   // design px, scaled with the stage below
    // Degrees the pointer swings the camera. Kept in step with the bleed
    // margins below: the stage rotates about its own centre, so a card far out
    // to the side swings much further than its own drift, and too much here
    // drags a bleeding card's edge back into frame.
    // How far the page's scroll moves the fan, on top of the pointer. The
    // hero sits in a cross-origin iframe and cannot read the parent's scroll
    // itself, so the page posts a 0..1 progress value in (see carrd-iframe.html).
    var SWING = { rx: 5, ry: 9 };
    var DRIFT = 46;                   // design px a z=0 card slides
    var EASE = 0.09;                  // how hard cur chases target per frame
    var EASE_DRAG = 0.28;             // tighter while a finger is actually down

    var root = document.querySelector('[data-ks-hero]');
    if (!root) return;

    var scene = root.querySelector('.ks-hero__scene');
    var stage = root.querySelector('.ks-hero__stage');
    var hint  = root.querySelector('[data-ks-hint]');
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var touchy = window.matchMedia('(pointer: coarse)');

    // The wording is the only thing that keys off the pointer type, and it
    // follows the media query rather than latching at load, so it stays right
    // when a device changes mode — or when someone resizes a responsive preview.
    function setHint() {
      if (hint) hint.textContent = touchy.matches
        ? 'Swipe to move through the screens'
        : 'Move your cursor to explore';
    }
    setHint();
    if (touchy.addEventListener) touchy.addEventListener('change', setHint);

    // ---- build ------------------------------------------------------------
    var els = CARDS.map(function (c) {
      var el = document.createElement('div');
      el.className = 'ks-card ks-card--' + c.device;

      var img = document.createElement('img');
      img.src = KS_BASE + '/' + c.id + '.webp';
      img.alt = '';                 // the scene as a whole carries the label
      img.draggable = false;
      el.appendChild(img);
      el.title = c.alt;

      stage.appendChild(el);
      return { card: c, el: el };
    });

    // Reveal only once every shot is decoded, so no card can flash white. A
    // shot that fails outright must not hold the rest back (hence the catch),
    // and nor must a slow connection (hence the timeout). A card whose shot
    // never arrives — a wrong KS_BASE, say — drops out rather than sitting
    // there as an empty white rectangle.
    // Two things have to be true before the hero is shown: every shot has
    // decoded, and we know where the page has it scrolled to. Revealing on
    // decode alone means it appears centred and then snaps into position the
    // moment the first scroll reading lands.
    var revealed = false;
    function reveal() {
      if (revealed) return;
      revealed = true;
      scene.classList.add('is-ready');
    }
    var decoded = els.map(function (e) {
      var img = e.el.firstChild;
      var done = img.decode ? img.decode() :
        new Promise(function (res, rej) { img.onload = res; img.onerror = rej; });
      return done.catch(function () {
        e.failed = true;
        e.el.hidden = true;
        // Say which URL failed. A silent card is very hard to diagnose once
        // this is pasted into somebody else's page.
        if (window.console && window.console.warn) {
          window.console.warn('[ks-hero] could not load ' + img.src + ' — check KS_BASE');
        }
      });
    });
    Promise.all(decoded).then(reveal);
    setTimeout(reveal, 3000);

    // ---- layout -----------------------------------------------------------
    var L = null;

    function layout() {
      var next = LAYOUTS[(scene.clientWidth || 1600) < NARROW_BELOW ? 'narrow' : 'wide'];
      if (next === L) return false;
      L = next;
      scene.style.aspectRatio = L.w + ' / ' + L.h;
      els.forEach(function (e) {
        var p = L.pos[e.card.id];
        e.el.hidden = !p || !!e.failed;
        if (!p) return;
        e.el.style.left = (p.x / L.w * 100) + '%';
        e.el.style.top = (p.y / L.h * 100) + '%';
        e.el.style.width = (p.w / L.w * 100) + '%';
      });
      return true;
    }

    // ---- motion ------------------------------------------------------------
    // One target vector in [-1,1]. The pointer writes it directly; a swipe
    // pushes it and it springs back. A single rAF lerps towards it, so mouse
    // and touch share exactly the same rendering path.
    var target = { x: 0, y: 0 };
    var cur = { x: 0, y: 0 };
    var vel = { x: 0, y: 0 };
    var dragging = false;
    var pointerIn = false;
    var frame = 0;
    // Which input last drove the motion. Behaviour keys off this rather than off
    // a device guess: a touchscreen laptop reports a coarse pointer AND has a
    // mouse, so deciding once at load which of the two to listen for would leave
    // one of them dead for the whole session.
    var mode = 'none';   // 'none' | 'cursor' | 'drag'

    // Depth and perspective are pixel distances, so both have to scale with
    // the rendered stage — left fixed, the camera would foreshorten far harder
    // in a wide column than a narrow one. Neither changes while scrolling, so
    // this is called on resize rather than per frame.
    var scale = 1;
    function measure() {
      scale = (scene.clientWidth || L.w) / L.w;
      scene.style.perspective = (PERSPECTIVE * scale).toFixed(1) + 'px';
    }

    function paint() {
      var s = scale;
      var m = L.motion;
      stage.style.transform =
        'rotateX(' + (L.camera.rx - cur.y * SWING.rx * m).toFixed(3) + 'deg) ' +
        'rotateY(' + (L.camera.ry + cur.x * SWING.ry * m).toFixed(3) + 'deg) ' +
        'rotateZ(' + L.camera.rz + 'deg)';
      for (var i = 0; i < els.length; i++) {
        if (els[i].el.hidden) continue;
        var z = (L.pos[els[i].card.id] || {}).z || 0;
        var depth = 1 + z / 460;                    // nearer cards travel further
        els[i].el.style.transform =
          'translate3d(' + (-cur.x * DRIFT * m * depth * s).toFixed(2) + 'px,' +
          (-cur.y * DRIFT * 0.55 * m * depth * s).toFixed(2) + 'px,' +
          (z * s).toFixed(2) + 'px)';
      }
    }

    function render() {
      frame = 0;
      if (!dragging && mode === 'drag') {
        // Let the throw run on, then drift home slowly enough to watch.
        target.x += vel.x; target.y += vel.y;
        vel.x *= 0.95; vel.y *= 0.95;
        target.x *= 0.965; target.y *= 0.965;
        if (Math.abs(vel.x) < 1e-4) vel.x = 0;
        if (Math.abs(vel.y) < 1e-4) vel.y = 0;
      }
      if (mode === 'cursor' && !pointerIn) { target.x *= 0.9; target.y *= 0.9; }

      var ease = dragging ? EASE_DRAG : EASE;
      cur.x += (target.x - cur.x) * ease;
      cur.y += (target.y - cur.y) * ease;
      paint();

      var settled = Math.abs(target.x - cur.x) < 0.0006 &&
                    Math.abs(target.y - cur.y) < 0.0006 && !vel.x && !vel.y;
      if (!settled) frame = requestAnimationFrame(render);
    }
    function kick() { if (!frame) frame = requestAnimationFrame(render); }

    layout();
    measure();
    paint();

    var onResize = function () { layout(); measure(); paint(); };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(scene);
    else window.addEventListener('resize', onResize);

    if (still) return;   // reduced motion: no pointer, no swipe, no scroll

    // The host page reports where this hero sits in its viewport, once per
    // frame (the sender is at the bottom of carrd-iframe.html). A cross-origin
    // iframe cannot read the parent's scroll itself, and an IntersectionObserver
    // — which can see the top-level viewport — only changes while the hero is
    // crossing an edge, so it goes dead exactly when the hero is fully on
    // screen and reports in coarse steps besides. A posted number is
    // continuous and frame-accurate.
    //
    // Treated strictly as data: one finite number from the expected field,
    // clamped, whoever sent it. All it can do is move the fan.
    // Nothing happens on scroll, deliberately. A scroll-linked version of
    // this existed and was dropped: six large screens re-projected in 3D on
    // every frame made scrolling feel heavy, and no amount of coalescing fixed
    // it. The page now scrolls at native speed and the hero costs nothing
    // while it does. The pointer is where the motion lives.

    // Mouse / trackpad — always attached, tracked across the page and measured
    // against the scene. Touch pointers are ignored here; they go through the
    // drag path below.
    var lastX = null, lastY = null;
    window.addEventListener('pointermove', function (ev) {
      if (ev.pointerType === 'touch' || dragging) return;
      // Scrolling with the cursor resting over the page fires pointermove even
      // though the pointer has not moved — the element beneath it has. Without
      // this the hero repaints on every scroll frame, which is exactly the
      // cost dropping the scroll effect was meant to remove.
      if (ev.clientX === lastX && ev.clientY === lastY) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      var r = scene.getBoundingClientRect();
      if (!r.width) return;
      var nx = ((ev.clientX - r.left) / r.width - 0.5) * 2;
      var ny = ((ev.clientY - r.top) / r.height - 0.5) * 2;
      mode = 'cursor';
      vel.x = vel.y = 0;
      pointerIn = nx > -1.6 && nx < 1.6 && ny > -1.9 && ny < 1.9;
      if (!pointerIn) { kick(); return; }
      target.x = Math.max(-1, Math.min(1, nx));
      target.y = Math.max(-1, Math.min(1, ny));
      kick();
    }, { passive: true });

    // Touch — a swipe drags the fan and throws it, then it settles back.
    var start = null;
    scene.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType !== 'touch') return;   // a mouse uses cursor tracking
      dragging = true;
      mode = 'drag';
      vel.x = vel.y = 0;
      start = { x: ev.clientX, y: ev.clientY, tx: target.x, ty: target.y, t: performance.now() };
      scene.classList.add('is-dragging');
      if (scene.setPointerCapture) { try { scene.setPointerCapture(ev.pointerId); } catch (e) {} }
    });

    scene.addEventListener('pointermove', function (ev) {
      if (!dragging || !start) return;
      var r = scene.getBoundingClientRect();
      var dx = (ev.clientX - start.x) / (r.width * 0.5);
      var dy = (ev.clientY - start.y) / (r.height * 0.5);
      // Horizontal swipes drive the fan; vertical is damped, so a scroll that
      // happens to start on the hero still reads as a scroll.
      var nx = Math.max(-1, Math.min(1, start.tx - dx * 1.1));
      var ny = Math.max(-1, Math.min(1, start.ty - dy * 0.35));
      var now = performance.now();
      var dt = Math.max(16, now - start.t);
      vel.x = (nx - target.x) / dt * 16;
      vel.y = (ny - target.y) / dt * 16;
      start.t = now;
      target.x = nx;
      target.y = ny;
      kick();
    });

    function release() {
      if (!dragging) return;
      dragging = false;
      start = null;
      scene.classList.remove('is-dragging');
      // Cap the throw, so a hard flick cannot fling the fan out of frame.
      vel.x = Math.max(-0.06, Math.min(0.06, vel.x));
      vel.y = Math.max(-0.06, Math.min(0.06, vel.y));
      kick();
    }
    scene.addEventListener('pointerup', release);
    scene.addEventListener('pointercancel', release);
    scene.addEventListener('pointerleave', release);

    // Handy while tuning the composition; harmless to leave in.
    window.__ksHero = { LAYOUTS: LAYOUTS, CARDS: CARDS, els: els, layout: layout, paint: paint };
  }

  // A host page may inject an embed's markup and its script separately, and
  // not always in that order, so the hero may not be in the DOM yet when this
  // runs — wait for the document in that case. And whatever happens, a hero
  // that fails must never take the page around it down with it: everything is
  // behind a catch, and a second attempt on load covers a late injection.
  var started = false;
  function start() {
    if (started) return;
    try {
      if (!document.querySelector('[data-ks-hero]')) return;
      started = true;
      boot();
    } catch (err) {
      started = true;
      if (window.console && window.console.error) window.console.error('[ks-hero]', err);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  window.addEventListener('load', start);
}());
