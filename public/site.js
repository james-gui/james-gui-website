// Keep these enhancements optional: every page and link works without JavaScript.
const clocks = document.querySelectorAll('[data-la-time]');
if (clocks.length) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const updateClock = () => {
    const now = new Date();
    clocks.forEach((clock) => {
      clock.textContent = formatter.format(now).toLowerCase();
      clock.dateTime = now.toISOString();
    });
  };
  updateClock();
  setInterval(updateClock, 60_000);
}

const portraitToggle = document.querySelector('[data-portrait-toggle]');
const portraitPanel = document.querySelector('#home-portrait');
if (portraitToggle && portraitPanel) {
  const photo = portraitPanel.querySelector('[data-portrait-image]');
  const close = portraitPanel.querySelector('[data-portrait-close]');
  const error = portraitPanel.querySelector('[data-portrait-error]');
  let requested = false;
  let fallback = false;
  portraitToggle.setAttribute('role', 'button');
  portraitToggle.setAttribute('aria-expanded', 'false');

  photo.addEventListener('load', () => photo.classList.add('is-loaded'));
  photo.addEventListener('error', () => {
    if (!fallback && photo.getAttribute('src') !== photo.dataset.fallback) {
      fallback = true;
      photo.removeAttribute('srcset');
      photo.src = photo.dataset.fallback;
    } else {
      error.hidden = false;
    }
  });

  const setPortrait = (open) => {
    if (open && !requested) {
      requested = true;
      if (photo.dataset.sizes) photo.sizes = photo.dataset.sizes;
      if (photo.dataset.srcset) photo.srcset = photo.dataset.srcset;
      photo.src = photo.dataset.src;
    }
    if (!open && portraitPanel.contains(document.activeElement)) portraitToggle.focus({ preventScroll: true });
    portraitToggle.setAttribute('aria-expanded', String(open));
    portraitToggle.title = open ? 'hide photo' : 'show a photo of james';
    portraitPanel.inert = !open;
    portraitPanel.setAttribute('aria-hidden', String(!open));
    portraitPanel.classList.toggle('is-open', open);
  };
  portraitToggle.addEventListener('click', (event) => {
    event.preventDefault();
    setPortrait(portraitToggle.getAttribute('aria-expanded') !== 'true');
  });
  portraitToggle.addEventListener('keydown', (event) => {
    if (event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) portraitToggle.click();
    }
  });
  close.addEventListener('click', () => setPortrait(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && portraitToggle.getAttribute('aria-expanded') === 'true') {
      setPortrait(false);
      portraitToggle.focus({ preventScroll: true });
    }
  });
}

const cityButtons = document.querySelectorAll('[data-city]');
const cityLists = document.querySelectorAll('[data-city-list]');
if (cityButtons.length) {
  document.querySelector('.city-switch').hidden = false;
  document.querySelectorAll('.city-title').forEach((title) => { title.hidden = true; });
  const selectCity = (city) => {
    cityButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.city === city)));
    cityLists.forEach((list) => { list.hidden = list.dataset.cityList !== city; });
  };
  cityButtons.forEach((button) => button.addEventListener('click', () => selectCity(button.dataset.city)));
  selectCity('hk');
}

const copyButton = document.querySelector('[data-copy-email]');
if (copyButton && navigator.clipboard?.writeText) {
  copyButton.hidden = false;
  copyButton.addEventListener('click', async () => {
    const status = document.querySelector('.copy-status');
    try {
      await navigator.clipboard.writeText(document.querySelector('.email-address').textContent.trim());
      status.textContent = 'email copied. talk soon!';
    } catch {
      status.textContent = 'couldn’t copy — select the email address to copy it, or click it to say hello.';
    }
  });
}

const musicGrid = document.querySelector('[data-music-grid]');
if (musicGrid) {
  const musicSection = musicGrid.closest('.spotify-section');
  musicGrid.setAttribute('aria-busy', 'true');
  const renderTrack = (track, index, ranked) => {
    if (!/^[A-Za-z0-9]{22}$/.test(track.id || '')) return null;
    const card = document.createElement('li');
    card.className = 'song-card';
    const link = document.createElement('a');
    link.href = `https://open.spotify.com/track/${track.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${track.title} — listen on spotify`.toLowerCase());
    link.title = `${track.title} — ${track.artist || ''}`.toLowerCase();
    const art = document.createElement('span');
    art.className = 'song-artwork';
    if (track.image?.startsWith('https://i.scdn.co/')) {
      const image = document.createElement('img');
      image.src = track.image;
      image.alt = '';
      image.width = image.height = 300;
      image.loading = 'lazy';
      art.append(image);
    }
    const title = document.createElement('span');
    title.className = 'song-title';
    title.textContent = `${ranked ? `${String(index + 1).padStart(2, '0')}. ` : ''}${track.title}`.toLowerCase();
    const artist = document.createElement('span');
    artist.className = 'song-artist';
    artist.textContent = String(track.artist || '').toLowerCase();
    const service = document.createElement('span');
    service.className = 'song-service';
    service.textContent = 'listen on spotify ↗';
    link.append(art, title, artist, service);
    card.append(link);
    return card;
  };

  fetch('/api/spotify/top', { signal: AbortSignal.timeout(15000) })
    .then((response) => { if (!response.ok) throw new Error('music unavailable'); return response.json(); })
    .then((data) => {
      if (!Array.isArray(data.items) || !['top', 'recent'].includes(data.mode)) throw new Error('music unavailable');
      const ranked = data.mode === 'top';
      const cards = data.items.slice(0, 12).map((track, i) => renderTrack(track, i, ranked)).filter(Boolean);
      if (cards.length) musicGrid.replaceChildren(...cards);
      document.querySelector('[data-music-period]').textContent = ranked ? 'last 4 weeks' : 'recent listens';
      document.querySelector('[data-music-description]').textContent = ranked
        ? 'my top tracks from the last four weeks, via spotify.'
        : 'a few songs from my spotify rotation.';
      const note = document.querySelector('[data-music-note]');
      if (ranked && !cards.length) {
        musicGrid.replaceChildren();
        note.textContent = 'spotify hasn’t collected enough listening history yet. check back soon.';
      } else if (data.updatedAt) {
        const date = new Date(data.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase();
        note.textContent = `${ranked ? 'last synced' : 'saved'} ${date}${data.stale ? ' · spotify is temporarily unavailable' : ''}`;
      }
      const manage = document.querySelector('[data-spotify-manage]');
      if (data.canManage) {
        manage.href = "/spotify/setup";
        manage.hidden = false;
        manage.textContent = data.needsReconnect ? 'reconnect spotify ↗' : data.connected ? 'spotify settings ↗' : 'connect spotify ↗';
      }
      document.querySelector('[data-music-status]').textContent = ranked ? 'spotify top tracks loaded.' : 'recent spotify tracks loaded.';
    })
    .catch(() => {
      document.querySelector('[data-music-note]').textContent = 'spotify is temporarily unavailable. showing saved recent listens.';
      document.querySelector('[data-music-status]').textContent = 'showing saved music while spotify is unavailable.';
    })
    .finally(() => {
      musicGrid.removeAttribute('aria-busy');
      musicSection.classList.remove('music-pending');
    });
}
