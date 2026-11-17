import {consentKey} from './consent.mjs';

const agree = document.querySelector('#agree');
const status = document.querySelector('#status');

agree.addEventListener('click', async () => {
  agree.disabled = true;
  status.textContent = '';
  try {
    await chrome.storage.local.set({[consentKey]: true});
    await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true});
    agree.hidden = true;
    status.textContent = 'Setup complete. Open an arXiv HTML paper and click BNITZ in the Chrome toolbar.';
  } catch (error) {
    console.error('BNITZ could not complete setup.', error);
    status.textContent = 'Could not complete setup. Please try again.';
    agree.disabled = false;
  }
});
