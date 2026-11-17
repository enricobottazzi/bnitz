export const consentKey = 'paperDataConsentV1';

export async function hasConsent() {
  const stored = await chrome.storage.local.get(consentKey);
  return stored[consentKey] === true;
}
