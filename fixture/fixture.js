const details = document.querySelector('#event-details');
const panel = document.querySelector('#details-panel');
const info = document.querySelector('#registration-info');
const help = document.querySelector('#registration-help');

details.addEventListener('click', () => {
  panel.hidden = !panel.hidden;
  if (details.hasAttribute('aria-expanded')) {
    details.setAttribute('aria-expanded', String(!panel.hidden));
  }
});

info.addEventListener('click', () => {
  help.hidden = !help.hidden;
});

document.querySelector('#registration').addEventListener('submit', (event) => {
  event.preventDefault();
  document.querySelector('#confirmation').textContent = 'You’re registered. See you at the workshop!';
});
