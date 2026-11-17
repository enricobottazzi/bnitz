import {consentKey, hasConsent} from './consent.mjs';

const setupUrl = new URL('./setup.html', import.meta.url).href;

async function openSetup() {
  const [setup] = await chrome.runtime.getContexts({contextTypes: ['TAB'], documentUrls: [setupUrl]});
  if (setup) {
    await chrome.tabs.update(setup.tabId, {active: true});
    await chrome.windows.update(setup.windowId, {focused: true});
  } else {
    await chrome.tabs.create({url: setupUrl});
  }
}

chrome.runtime.onInstalled.addListener(async ({reason}) => {
  if (reason !== 'install' && reason !== 'update') return;
  const agreed = await hasConsent();
  await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: agreed});
  if (reason === 'install' && !agreed) await openSetup();
});

chrome.action.onClicked.addListener(async () => {
  if (await hasConsent()) {
    await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true});
  } else {
    await openSetup();
  }
});

chrome.storage.local.onChanged.addListener(changes => {
  if (changes[consentKey]?.oldValue === true && changes[consentKey].newValue !== true) {
    chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: false});
  }
});
