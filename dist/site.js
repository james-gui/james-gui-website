// Keep these enhancements optional: every page and link works without JavaScript.
const clock = document.querySelector('[data-la-time]');
if (clock) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const updateClock = () => {
    const now = new Date();
    clock.textContent = formatter.format(now).toLowerCase();
    clock.dateTime = now.toISOString();
  };
  updateClock();
  setInterval(updateClock, 60_000);
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
