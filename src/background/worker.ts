/**
 * StateGuard Extension Background Service Worker
 * Handles Side Panel toggling and background message dispatching
 */

// Open side panel on extension action click
if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: any) => console.error('Failed to set side panel behavior:', error));
}

// Background message bus
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'PONG', engine: 'gemini-3.8-flash' });
    }
    return true;
  });
}

console.log('StateGuard Background Worker active.');
