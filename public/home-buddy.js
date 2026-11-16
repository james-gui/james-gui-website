// A homepage-only companion. Text supplies the platforms; the page stays untouched.
(() => {
  const main = document.querySelector('main .home-heading')?.closest('main');
  if (!main) return;
  const allowed = matchMedia('(prefers-reduced-motion: no-preference)');
  const compact = matchMedia('(max-width: 680px), (hover: none), (pointer: coarse)');
  document.body.classList.add('has-home-buddy');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const buddy = document.createElement('div');
  buddy.className = 'home-buddy';
  buddy.setAttribute('aria-hidden', 'true');
  buddy.innerHTML = `<svg viewBox="0 0 52 64" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
    <ellipse data-shadow cx="26" cy="63" rx="13" ry="2" fill="currentColor" stroke="none" opacity=".12"/>
    <g data-body>
      <path data-back-arm opacity=".65"/><path data-back-leg opacity=".65"/>
      <path data-torso/><path data-front-leg/><path data-front-arm/>
      <circle data-head cx="26" cy="12" r="7.5" fill="var(--paper)"/>
      <circle data-eye cx="29" cy="11" r="1.1" fill="currentColor" stroke="none"/>
      <circle data-other-eye r="0" fill="currentColor" stroke="none"/>
      <path data-expression stroke-width="1.3"/><path data-hands stroke-width="1.6"/>
    </g>
    <path data-sparkles d="M7 7v8M3 11h8M43 0v6M40 3h6" stroke-width="1.5" opacity="0"/>
  </svg><span class="buddy-plea">pls hire me</span>`;
  const button = document.createElement('button');
  button.className = 'buddy-control';
  button.type = 'button';
  button.title = 'a little company — follows your cursor';
  const parts = Object.fromEntries([...buddy.querySelectorAll('[data-body], [data-shadow], path, circle')].map(el => [Object.keys(el.dataset)[0], el]));
  let enabled = true;
  try { enabled = localStorage.getItem('home-buddy') !== 'off'; } catch { /* Storage is optional. */ }
  let platforms = [];
  let bounds = { left: 240, right: innerWidth - 24 };
  let pointer = null;
  let current = null;
  let flight = null;
  let x = 0, y = 0, facing = 1, stride = 0;
  let lastFrame = 0, frame = 0, landedAt = 0, settledAt = 0;
  let dirty = true, measuredAt = -Infinity, previousScroll = scrollY;
  let initialized = false;
  let hoveredLink = null, focusedLink = null, reaction = null;
  const reactionLinks = [...main.querySelectorAll('.home-prose a.text-link')];
  const basketballs = [...main.querySelectorAll('[data-buddy-dunk]')];
  const mobilePanel = document.createElement('section');
  mobilePanel.className = 'buddy-mobile-panel';
  mobilePanel.id = 'buddy-play';
  mobilePanel.setAttribute('aria-label', 'play with little guy');
  mobilePanel.hidden = true;
  mobilePanel.innerHTML = `<div class="buddy-mobile-stage" aria-hidden="true"></div><div class="buddy-mobile-actions">
    <button type="button" data-mobile-mood="beg" aria-label="make little guy beg for an internship">beg</button>
    <button type="button" data-mobile-mood="proud" aria-label="make little guy show off">show off</button>
    <button type="button" data-mobile-dunk>dunk</button>
    <button type="button" data-mobile-pause aria-label="pause little guy">pause</button>
  </div>`;
  const launcher = document.createElement('button');
  launcher.className = 'buddy-launcher';
  launcher.type = 'button';
  launcher.setAttribute('aria-controls', 'buddy-play');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.innerHTML = '<svg viewBox="0 0 20 26" aria-hidden="true"><circle cx="10" cy="5" r="3"/><path d="M10 8v8m0-5-6 4m6-4 6-2m-6 7-5 7m5-7 5 7"/></svg><span class="buddy-launcher-label">little guy</span><span class="buddy-chevron" aria-hidden="true">⌃</span>';
  document.body.append(launcher, mobilePanel);
  let panelOpen = false, mobileStage = null, mobileMood = null, mobileReactionTimer = 0;

  function setPanel(open) {
    panelOpen = open;
    mobileMood = null;
    clearTimeout(mobileReactionTimer);
    pointer = null;
    hoveredLink = focusedLink = null;
    flight = null;
    initialized = false;
    if (!open && mobilePanel.contains(document.activeElement)) launcher.focus({ preventScroll: true });
    sync();
    if (open) measure(performance.now());
  }
  const hint = document.createElement('span');
  hint.className = 'buddy-hint';
  hint.textContent = 'psst… hover blue links or the basketball ↓';
  main.querySelector('.page-index').append(hint);
  let discovered = false;
  try { discovered = sessionStorage.getItem('home-buddy-discovered') === 'yes'; } catch { /* Optional. */ }
  function discover() {
    if (discovered) return;
    discovered = true;
    hint.classList.add('is-discovered');
    hint.setAttribute('aria-hidden', 'true');
    try { sessionStorage.setItem('home-buddy-discovered', 'yes'); } catch { /* Optional. */ }
  }

  const court = document.createElement('div');
  court.className = 'buddy-court';
  court.hidden = true;
  court.setAttribute('aria-hidden', 'true');
  court.innerHTML = `<svg viewBox="0 0 150 145" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 124h119" stroke="var(--line)" stroke-width="1.5"/>
    <path d="M116 17v107m-10 0h20" stroke="var(--underline)" stroke-width="2"/>
    <rect x="81" y="2" width="43" height="40" rx="3" fill="var(--paper)" stroke="var(--underline)" stroke-width="1.5"/>
    <path d="M94 32V18h17v14" stroke="var(--accent)" stroke-width="1.3"/>
    <g data-net stroke="var(--underline)" stroke-width="1.1"><path d="m68 36 6 20h20l6-20M73 37l17 19M83 37l13 13M95 37 77 56M85 37 72 50M72 46h24M74 53h20"/></g>
    <ellipse cx="84" cy="36" rx="17" ry="3" stroke="#c98558" stroke-width="2.5"/>
  </svg><span class="dunk-score">still got it.</span>`;
  // A separate ball lets the original icon return to its exact spot after the dunk.
  const ball = document.createElement('div');
  ball.className = 'buddy-ball';
  ball.hidden = true;
  ball.setAttribute('aria-hidden', 'true');
  ball.innerHTML = `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#c98558" stroke="#8c4c2f" stroke-width="1.5"/><path d="M2 16h28M16 2v28M6 6c11 5 11 15 0 20M26 6c-11 5-11 15 0 20" fill="none" stroke="#8c4c2f" stroke-width="1.5"/></svg>`;
  document.body.append(court, ball);
  let dunk = null, dunkHover = null, dunkTimer = 0;

  function finishDunk(cancelPending = true) {
    if (cancelPending) {
      clearTimeout(dunkTimer);
      dunkTimer = 0;
    }
    if (!dunk) return;
    dunk.trigger.classList.remove('is-playing');
    dunk = null;
    court.hidden = true;
    court.querySelector('[data-net]').style.transform = '';
    ball.hidden = true;
    delete buddy.dataset.dunkPhase;
    current = { id: 'court-floor', left: x - 15, right: x + 15, y };
    landedAt = performance.now();
    settledAt = landedAt;
    refreshReaction();
    wake();
  }

  function startDunk(trigger) {
    if (dunk || !enabled || !allowed.matches || document.hidden) return;
    if (compact.matches && !panelOpen) setPanel(true);
    clearTimeout(mobileReactionTimer);
    mobileMood = null;
    const triggerRect = trigger.getBoundingClientRect();
    if (!compact.matches && (triggerRect.bottom < 60 || triggerRect.top > innerHeight - 40)) return;
    const icon = main.querySelector('.basketball-trigger');
    const iconRect = icon.getBoundingClientRect();
    const sourceTrigger = !compact.matches && iconRect.top > 60 && iconRect.bottom < innerHeight - 40 ? icon : trigger;
    const rect = sourceTrigger.getBoundingClientRect();
    const floorY = compact.matches ? mobileStage.bottom - 24 : clamp(rect.bottom + 112, 190, innerHeight - 70);
    const source = compact.matches ? { x: mobileStage.left + 38, y: floorY - 24 } : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const rimX = compact.matches ? mobileStage.right - 68 : clamp(rect.right + 112, bounds.left + 110, bounds.right - 45);
    const rimY = floorY - 88;
    const pickup = { x: source.x - 13, y: source.y + 24 };
    dunk = { trigger: sourceTrigger, from: { x, y }, pickup, source, rimX, rimY, floorY, start: performance.now(), approach: clamp(distance({ x, y }, pickup) * 1.1 + 280, 440, 850) };
    flight = null;
    reaction = null;
    court.style.transform = `translate3d(${rimX - 84}px, ${rimY - 36}px, 0)`;
    court.classList.remove('is-scored');
    court.hidden = false;
    discover();
    wake();
  }

  function drawBall(bx, by, rotation = 0) {
    ball.hidden = false;
    ball.style.transform = `translate3d(${bx - 7.5}px, ${by - 7.5}px, 0) rotate(${rotation}deg)`;
  }

  function tickDunk(now) {
    const game = dunk;
    const elapsed = now - game.start;
    const time = elapsed - game.approach;
    const launch = { x: game.rimX - 70, y: game.floorY };
    const hang = { x: game.rimX - 14, y: game.rimY + 43 };
    const interpolate = (from, to, t, arc = 0) => {
      x = from.x + (to.x - from.x) * t;
      y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arc;
    };
    facing = 1;
    if (time < 0) {
      buddy.dataset.dunkPhase = 'approach';
      facing = game.pickup.x >= game.from.x ? 1 : -1;
      interpolate(game.from, game.pickup, elapsed / game.approach, 55);
      pose(now, false, true);
    } else if (time < 180) {
      buddy.dataset.dunkPhase = 'gather';
      game.trigger.classList.add('is-playing');
      x = game.pickup.x; y = game.pickup.y;
      pose(now, false, false, Math.sin(time / 180 * Math.PI) * .7);
      drawBall(game.source.x, game.source.y);
    } else if (time < 700) {
      buddy.dataset.dunkPhase = 'run-up';
      const t = (time - 180) / 520;
      interpolate(game.pickup, launch, t, 12);
      stride = t * 18;
      pose(now, true);
      drawBall(x + 13, y - 9 - Math.abs(Math.cos(t * Math.PI * 3)) * 19, t * 240);
    } else if (time < 1330) {
      buddy.dataset.dunkPhase = 'jump';
      const t = (time - 700) / 630;
      interpolate(launch, hang, t, 50);
      pose(now, false, true, 0, 'dunk');
      drawBall(x + 14, y - 51, 45);
    } else if (time < 1570) {
      buddy.dataset.dunkPhase = 'slam';
      const t = (time - 1330) / 240;
      x = hang.x; y = hang.y + Math.sin(t * Math.PI) * 2;
      pose(now, false, true, 0, 'hang');
      drawBall(game.rimX, game.rimY - 8 + t * 31, 45 + t * 90);
      court.classList.add('is-scored');
      court.querySelector('[data-net]').style.transform = `translateY(${Math.sin(t * Math.PI) * 4}px)`;
    } else if (time < 2090) {
      buddy.dataset.dunkPhase = 'land';
      const t = (time - 1570) / 520;
      interpolate(hang, { x: game.rimX - 35, y: game.floorY }, t * t);
      pose(now, false, true);
      const ballY = t < .65 ? game.rimY + 23 + (game.floorY - 30 - game.rimY) * (t / .65) ** 2 : game.floorY - 7 - Math.sin((t - .65) / .35 * Math.PI) * 18;
      drawBall(game.rimX + t * 18, ballY, 135 + t * 160);
      court.querySelector('[data-net]').style.transform = '';
    } else if (time < 2820) {
      buddy.dataset.dunkPhase = 'celebrate';
      x = game.rimX - 35; y = game.floorY;
      pose(now, false, false, 0, 'celebrate');
      drawBall(game.rimX + 18, game.floorY - 7);
    } else {
      finishDunk();
      return;
    }
    wake();
  }

  function refreshReaction() {
    if (dunk) { reaction = null; return; }
    if (compact.matches) {
      if (!mobileMood || !mobileStage || !panelOpen) { reaction = null; return; }
      const footX = mobileStage.left + 55, footY = mobileStage.bottom - 24;
      reaction = {
        mode: mobileMood,
        point: { x: mobileStage.right - 28, y: footY - 32 },
        destination: { x: footX, y: footY, platform: { id: 'play-stage', left: bounds.left, right: bounds.right, y: footY } },
      };
      buddy.dataset.captionSide = 'above';
      buddy.querySelector('.buddy-plea').textContent = 'pls hire me';
      return;
    }
    const link = hoveredLink || focusedLink;
    if (!link) { reaction = null; return; }
    const rects = [...link.getClientRects()].filter(rect => rect.bottom > 55 && rect.top < innerHeight - 40);
    if (!rects.length) { reaction = null; return; }
    // Inline links may wrap: react beside the line the pointer is actually over.
    const rect = pointer && hoveredLink ? rects.reduce((best, rect) => Math.abs(rect.top + rect.height / 2 - pointer.y) < Math.abs(best.top + best.height / 2 - pointer.y) ? rect : best) : rects[0];
    const proseLeft = main.querySelector('.home-prose').getBoundingClientRect().left;
    const footX = Math.max(bounds.left, proseLeft - 27);
    const footY = clamp(rect.bottom + 5, 55, innerHeight - 40);
    reaction = {
      mode: link.dataset.buddyReaction === 'beg' ? 'beg' : 'proud',
      point: { x: rect.left + Math.min(rect.width / 2, 50), y: rect.top + rect.height / 2 },
      destination: { x: footX, y: footY, platform: { id: `link:${reactionLinks.indexOf(link)}`, left: footX - 10, right: footX + 10, y: footY } },
    };
    const roomForCaption = footX - bounds.left > 110;
    buddy.dataset.captionSide = roomForCaption ? 'left' : 'below';
    const plea = buddy.querySelector('.buddy-plea');
    const caption = roomForCaption ? 'pls hire me' : 'pls';
    if (plea.textContent !== caption) plea.textContent = caption;
  }

  function platformById(id) {
    return reaction?.destination.platform.id === id ? reaction.destination.platform : platforms.find(p => p.id === id);
  }

  function measure(now) {
    dirty = false;
    measuredAt = now;
    if (compact.matches) {
      if (!panelOpen) return;
      mobileStage = mobilePanel.querySelector('.buddy-mobile-stage').getBoundingClientRect();
      bounds = { left: mobileStage.left + 20, right: mobileStage.right - 20 };
      current = { id: 'play-stage', left: bounds.left, right: bounds.right, y: mobileStage.bottom - 24 };
      platforms = [current];
      if (!initialized) { x = mobileStage.left + 55; y = current.y; initialized = true; settledAt = now; }
      else if (!dunk) { x = clamp(x, bounds.left, bounds.right); y = current.y; }
      refreshReaction();
      return;
    }
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
    bounds = { left: sidebar.right + 25, right: innerWidth - 25 };
    platforms = [];
    const blocks = main.querySelectorAll('.home-heading, .home-prose > p, .home-achievements h2, .home-achievements li, .social-links');
    blocks.forEach((block, index) => {
      const range = document.createRange();
      range.selectNodeContents(block);
      const lines = [];
      for (const rect of range.getClientRects()) {
        if (rect.width < 4 || rect.height < 4) continue;
        const line = lines.find(line => Math.abs(line.top - rect.top) < 7);
        if (line) { line.left = Math.min(line.left, rect.left); line.right = Math.max(line.right, rect.right); }
        else lines.push({ top: rect.top, left: rect.left, right: rect.right });
      }
      lines.forEach((line, row) => {
        const top = line.top - 3;
        if (top < 55 || top > innerHeight - 60) return;
        platforms.push({ id: `${index}:${row}`, left: Math.max(bounds.left, line.left - 6), right: Math.min(bounds.right, line.right + 6), y: top });
      });
    });
    const portrait = main.querySelector('.portrait-reveal.is-open .portrait-frame');
    if (portrait) {
      const rect = portrait.getBoundingClientRect();
      if (rect.top > 55 && rect.top < innerHeight - 60) platforms.push({ id: 'photo', left: rect.left + 5, right: rect.right - 5, y: rect.top - 3 });
    }
    platforms.push({ id: 'floor', left: bounds.left, right: bounds.right, y: innerHeight - 40 });
    if (pointer) hoveredLink = document.elementFromPoint(pointer.x, pointer.y)?.closest('.home-prose a.text-link') || null;
    refreshReaction();
    if (!initialized) {
      current = platforms[0];
      x = Math.min(current.right - 10, current.left + 210);
      y = current.y;
      initialized = true;
      settledAt = now;
    } else if (!flight) {
      current = platformById(current?.id) || nearest({ x, y });
      x = clamp(x, current.left + 5, current.right - 5);
      y = current.y;
    }
  }

  function pointOn(platform, aim) {
    return { x: clamp(aim.x, platform.left + 8, platform.right - 8), y: platform.y, platform };
  }
  function nearest(aim) {
    return platforms.reduce((best, p) => distance(pointOn(p, aim), aim) < distance(pointOn(best, aim), aim) ? p : best, platforms[0]);
  }
  function target() {
    if (reaction) return reaction.destination;
    if (compact.matches) return { x: mobileStage.left + 55, y: mobileStage.bottom - 24, platform: platforms[0] };
    if (!pointer) return { x, y, platform: current };
    const aim = { x: clamp(pointer.x - 28, bounds.left, bounds.right), y: clamp(pointer.y + 35, 55, innerHeight - 40) };
    const destination = pointOn(nearest(aim), aim);
    // Take intermediate steps for tall climbs instead of one enormous leap.
    if (y - destination.y > 180) {
      const steps = platforms.filter(p => p.y < y - 12 && p.y >= y - 180)
        .map(p => pointOn(p, aim)).filter(p => Math.abs(p.x - x) < 340);
      if (steps.length) return steps.reduce((best, p) => distance(p, destination) < distance(best, destination) ? p : best);
    }
    return destination;
  }

  function pose(now, running = false, airborne = false, crouch = 0, override = null) {
    const mood = override || (!running && !airborne && !crouch && reaction && distance({ x, y }, reaction.destination) < 8 ? reaction.mode : 'follow');
    if (buddy.dataset.mood !== mood) buddy.dataset.mood = mood;
    if (mood === 'beg' || mood === 'proud') discover();
    const bob = running ? Math.abs(Math.sin(stride)) * 2 : 0;
    const hipY = 39 + crouch * 5 - bob;
    const headY = 11 + crouch * 5 - bob;
    const lean = running ? 4 : airborne ? 2 : 0;
    const hip = [26, hipY], shoulder = [26 + lean, hipY - 16];
    const leg = (phase, tucked) => {
      const swing = running ? Math.sin(phase) : 0;
      return tucked ? [hip, [34, 46], [20, 51]] : [hip, [26 + swing * 8, 50], [26 + swing * 13, 61 - Math.max(0, -swing) * 7]];
    };
    const path = (key, points) => parts[key].setAttribute('d', points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' '));
    path('torso', [shoulder, hip]);
    path('backLeg', airborne ? [hip, [19, 46], [13, 55]] : running ? leg(stride + Math.PI, false) : [hip, [21, 51], [17, 61]]);
    path('frontLeg', airborne || running ? leg(stride, airborne) : [hip, [31, 51], [35, 61]]);
    const swing = running ? Math.sin(stride) * 10 : 0;
    path('backArm', [shoulder, [20 - swing / 2, hipY - 6], [18 - swing, hipY - 1]]);
    const waving = !running && !airborne && now - settledAt > 450 && now - settledAt < 2100;
    path('frontArm', airborne ? [shoulder, [35, hipY - 23], [37, hipY - 33]] : waving
      ? [shoulder, [39, hipY - 20], [40 + Math.sin(now / 85) * 4, hipY - 32]]
      : [shoulder, [32 + swing / 2, hipY - 7], [36 + swing, hipY - 4]]);
    parts.head.setAttribute('cx', 26 + lean);
    parts.head.setAttribute('cy', headY);
    parts.eye.setAttribute('cx', 29 + lean);
    parts.eye.setAttribute('cy', headY - 1);
    parts.eye.setAttribute('r', '1.1');
    parts.otherEye.setAttribute('r', '0');
    parts.expression.setAttribute('d', '');
    parts.hands.setAttribute('d', '');
    parts.sparkles.setAttribute('opacity', '0');
    if (mood === 'beg') {
      // Knees down, palms together, little hopeful nods.
      const nod = Math.sin(now / 190) * 1.4;
      const palms = [40, 34 + nod];
      path('torso', [[27, 38 + nod], [22, 48]]);
      path('backLeg', [[22, 48], [30, 60], [13, 61]]);
      path('frontLeg', [[22, 48], [37, 59], [20, 61]]);
      path('backArm', [[25, 39 + nod], [30, 46], [39, 35 + nod]]);
      path('frontArm', [[28, 39 + nod], [34, 44], palms]);
      path('hands', [[39, 37 + nod], [41, 30 + nod], [43, 36 + nod]]);
      parts.head.setAttribute('cx', '28');
      parts.head.setAttribute('cy', 27 + nod);
      parts.eye.setAttribute('cx', '31');
      parts.eye.setAttribute('cy', 26 + nod);
      parts.eye.setAttribute('r', '1.6');
      parts.otherEye.setAttribute('cx', '26');
      parts.otherEye.setAttribute('cy', 26 + nod);
      parts.otherEye.setAttribute('r', '1.4');
      parts.expression.setAttribute('d', `M28 ${32 + nod}q2 -2 4 0`);
    } else if (mood === 'proud') {
      // Chest out, one hand on the hip, the other pointing at the hovered link.
      const lift = Math.sin(now / 300) * .6;
      path('torso', [[28, 21 - lift], [25, 39]]);
      path('backArm', [[28, 23 - lift], [16, 30], [24, 38]]);
      const angle = clamp(Math.atan2(reaction.point.y - (y - 28), Math.abs(reaction.point.x - x)), -.65, .65);
      const hand = [29 + Math.cos(angle) * 26, 23 + Math.sin(angle) * 26];
      path('frontArm', [[28, 24 - lift], [40, 24 + Math.sin(angle) * 12], hand]);
      path('hands', [hand, [hand[0] + 5, hand[1] + Math.sin(angle) * 5]]);
      parts.head.setAttribute('cx', '29');
      parts.head.setAttribute('cy', 10 - lift);
      parts.eye.setAttribute('cx', '32');
      parts.eye.setAttribute('cy', 9 - lift);
      parts.expression.setAttribute('d', `M29 ${13 - lift}q2 3 5 0`);
      parts.sparkles.setAttribute('opacity', String(.45 + Math.sin(now / 240) * .25));
    } else if (mood === 'dunk' || mood === 'hang') {
      const gripY = mood === 'hang' ? 3 : -4;
      path('backArm', [[26, 23], [24, 6], [42, gripY]]);
      path('frontArm', [[28, 24], [41, 12], [45, gripY]]);
      path('hands', [[42, gripY], [47, gripY]]);
      parts.expression.setAttribute('d', 'M27 14q2 2 4 0');
    } else if (mood === 'celebrate') {
      const wave = Math.sin(now / 100) * 2;
      path('backArm', [[26, 23], [15, 16], [12, 4 + wave]]);
      path('frontArm', [[28, 23], [40, 16], [43, 4 - wave]]);
      parts.expression.setAttribute('d', 'M26 14q3 4 6 0');
      parts.sparkles.setAttribute('opacity', '.7');
    }
    parts.body.setAttribute('transform', facing < 0 ? 'translate(52 0) scale(-1 1)' : '');
    parts.shadow.setAttribute('opacity', airborne ? '.035' : '.12');
    buddy.style.transform = `translate3d(${(x - 19).toFixed(2)}px, ${(y - 45).toFixed(2)}px, 0)`;
  }

  function tick(now) {
    frame = 0;
    // Stop and restore the scene even if the preference changes mid-frame.
    if (!allowed.matches) { sync(); return; }
    if (!enabled || document.hidden || (compact.matches && !panelOpen)) return;
    const dt = Math.min((now - (lastFrame || now)) / 1000, .035);
    lastFrame = now;
    if (dirty && now - measuredAt > 90) measure(now);
    if (dunk) { tickDunk(now); return; }
    let moving = false;
    if (flight) {
      const elapsed = now - flight.start;
      if (elapsed < 90) {
        pose(now, false, false, elapsed / 90);
      } else {
        const t = clamp((elapsed - 90) / flight.duration, 0, 1);
        x = flight.from.x + (flight.to.x - flight.from.x) * t;
        y = flight.from.y + (flight.to.y - flight.from.y) * t - Math.sin(Math.PI * t) * flight.height;
        pose(now, false, true);
        if (t === 1) {
          current = platformById(flight.to.platform.id) || flight.to.platform;
          y = current.y;
          flight = null;
          landedAt = now;
          settledAt = now;
        }
      }
      moving = true;
    } else {
      const goal = target();
      const dx = goal.x - x;
      if (reaction) facing = reaction.point.x > x ? 1 : -1;
      else if (pointer && Math.abs(pointer.x - x) > 12) facing = pointer.x > x ? 1 : -1;
      if (now - landedAt < 130) {
        pose(now, false, false, Math.sin((now - landedAt) / 130 * Math.PI) * .7);
        moving = true;
      } else if (goal.platform.id !== current.id && distance({ x, y }, goal) > 14) {
        facing = dx >= 0 ? 1 : -1;
        flight = { from: { x, y }, to: goal, start: now, duration: clamp(distance({ x, y }, goal) * 1.25 + 360, 460, 850), height: clamp(48 + Math.max(0, y - goal.y) * .24, 48, 110) };
        moving = true;
      } else if (Math.abs(dx) > 4) {
        const step = Math.sign(dx) * Math.min(Math.abs(dx), dt * 190);
        x += step;
        stride += Math.abs(step) * .2;
        settledAt = now;
        pose(now, true);
        moving = true;
      } else {
        pose(now);
      }
    }
    if (moving || dirty || reaction || now - settledAt < 2200) wake();
  }

  function wake() {
    if (!frame && enabled && allowed.matches && !document.hidden && (!compact.matches || panelOpen)) frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    finishDunk();
    buddy.hidden = !enabled || !allowed.matches || (compact.matches && !panelOpen);
    button.hidden = !allowed.matches || compact.matches;
    mobilePanel.hidden = !allowed.matches || !compact.matches || !panelOpen;
    launcher.hidden = !allowed.matches || !compact.matches;
    launcher.setAttribute('aria-expanded', String(panelOpen));
    launcher.setAttribute('aria-label', panelOpen ? 'close little guy controls' : 'play with little guy');
    launcher.querySelector('.buddy-launcher-label').textContent = innerWidth <= 680 ? (panelOpen ? 'close' : 'play') : 'little guy';
    launcher.querySelector('.buddy-chevron').textContent = panelOpen ? '×' : '⌃';
    hint.textContent = compact.matches ? (innerWidth <= 680 ? 'tap play for little guy ↓' : 'tap little guy to play ↓') : 'psst… hover blue links or the basketball ↓';
    hint.hidden = !enabled || !allowed.matches || discovered;
    for (const trigger of basketballs) {
      trigger.disabled = !enabled || !allowed.matches;
      trigger.title = trigger.disabled ? 'basketball' : compact.matches ? 'tap for a dunk' : 'hover or click for a dunk';
    }
    mobilePanel.querySelectorAll('[data-mobile-mood], [data-mobile-dunk]').forEach(control => { control.disabled = !enabled; });
    const pause = mobilePanel.querySelector('[data-mobile-pause]');
    pause.textContent = enabled ? 'pause' : 'resume';
    pause.setAttribute('aria-label', enabled ? 'pause little guy' : 'resume little guy');
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'pause little guy' : 'resume little guy');
    button.innerHTML = `${enabled ? '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z"/></svg>' : '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 2 7 4-7 4z"/></svg>'}<span>little guy</span>`;
    dirty = true;
    wake();
  }
  document.body.append(buddy, button);
  basketballs.forEach(trigger => trigger.addEventListener('click', () => {
    clearTimeout(dunkTimer);
    startDunk(trigger);
  }));
  const toggleEnabled = () => {
    enabled = !enabled;
    mobileMood = null;
    clearTimeout(mobileReactionTimer);
    try { localStorage.setItem('home-buddy', enabled ? 'on' : 'off'); } catch { /* Storage is optional. */ }
    sync();
  };
  button.addEventListener('click', toggleEnabled);
  mobilePanel.querySelector('[data-mobile-pause]').addEventListener('click', toggleEnabled);
  launcher.addEventListener('click', () => setPanel(!panelOpen));
  mobilePanel.querySelectorAll('[data-mobile-mood]').forEach(control => control.addEventListener('click', () => {
    finishDunk();
    clearTimeout(mobileReactionTimer);
    mobileMood = control.dataset.mobileMood;
    refreshReaction();
    settledAt = performance.now();
    discover();
    wake();
    mobileReactionTimer = setTimeout(() => { mobileMood = null; refreshReaction(); wake(); }, 3200);
  }));
  mobilePanel.querySelector('[data-mobile-dunk]').addEventListener('click', event => startDunk(event.currentTarget));
  document.addEventListener('pointerdown', event => {
    if (compact.matches && panelOpen && !event.target.closest('.buddy-mobile-panel, .buddy-launcher, [data-buddy-dunk]')) setPanel(false);
  }, { passive: true });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && compact.matches && panelOpen) setPanel(false);
  });
  document.addEventListener('pointermove', event => {
    if (compact.matches || event.pointerType !== 'mouse' || !enabled || !allowed.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    const basketball = event.target.closest('[data-buddy-dunk]');
    if (basketball !== dunkHover) {
      dunkHover = basketball;
      clearTimeout(dunkTimer);
      if (basketball) dunkTimer = setTimeout(() => startDunk(basketball), 220);
    }
    const link = event.target.closest('.home-prose a.text-link');
    if (hoveredLink !== link) { hoveredLink = link; refreshReaction(); }
    else if (link) refreshReaction();
    wake();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; hoveredLink = null; dunkHover = null; clearTimeout(dunkTimer); refreshReaction(); wake(); });
  main.addEventListener('focusin', event => {
    if (compact.matches) return;
    focusedLink = event.target.matches(':focus-visible') ? event.target.closest('.home-prose a.text-link') : null;
    refreshReaction();
    wake();
  });
  main.addEventListener('focusout', () => { focusedLink = null; refreshReaction(); wake(); });
  addEventListener('scroll', () => {
    if (compact.matches) { previousScroll = scrollY; return; }
    finishDunk(false);
    const delta = scrollY - previousScroll;
    previousScroll = scrollY;
    y -= delta;
    if (flight) { flight.from.y -= delta; flight.to.y -= delta; }
    dirty = true;
    wake();
  }, { passive: true });
  const observer = new ResizeObserver(() => { dirty = true; wake(); });
  observer.observe(main);
  addEventListener('resize', () => { finishDunk(false); dirty = true; if (compact.matches) sync(); else wake(); });
  window.visualViewport?.addEventListener('resize', () => { if (compact.matches) { finishDunk(false); dirty = true; wake(); } });
  document.fonts.ready.then(() => { dirty = true; wake(); });
  document.addEventListener('visibilitychange', sync);
  allowed.addEventListener('change', sync);
  compact.addEventListener('change', () => { panelOpen = false; initialized = false; pointer = null; flight = null; hoveredLink = focusedLink = null; sync(); });
  sync();
})();
