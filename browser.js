const { ipcRenderer } = require('electron');

// Browser State
let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;

// Default home page
const HOME_PAGE = 'https://www.google.com';

// DOM Elements
const tabsContainer = document.getElementById('tabs-container');
const webviewsContainer = document.getElementById('webviews-container');
const addressBar = document.getElementById('address-bar');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const homeBtn = document.getElementById('home-btn');
const goBtn = document.getElementById('go-btn');
const newTabBtn = document.getElementById('new-tab-btn');

// Initialize browser with first tab
window.addEventListener('DOMContentLoaded', () => {
  createTab(HOME_PAGE);
  setupEventListeners();
  setupIpcListeners();
});

// IPC Listeners
function setupIpcListeners() {
  ipcRenderer.on('tab-navigated', (event, data) => {
    if (data.tabId === activeTabId) {
      addressBar.value = data.url;
    }
    updateNavigationButtons();
  });

  ipcRenderer.on('tab-title-updated', (event, data) => {
    updateTabTitle(data.tabId, data.title);
  });

  ipcRenderer.on('tab-loading', (event, data) => {
    if (data.tabId === activeTabId) {
      updateNavigationButtons();
    }
  });
}

// Create new tab
function createTab(url = HOME_PAGE) {
  const tabId = tabIdCounter++;

  // Create tab object
  const tab = {
    id: tabId,
    url: url,
    title: 'New Tab'
  };

  tabs.push(tab);

  // Create tab element
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  tabElement.dataset.tabId = tabId;
  tabElement.innerHTML = `
    <span class="tab-title">${tab.title}</span>
    <button class="tab-close" data-tab-id="${tabId}">×</button>
  `;

  tabElement.addEventListener('click', (e) => {
    if (!e.target.classList.contains('tab-close')) {
      switchTab(tabId);
    }
  });

  tabElement.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(tabId);
  });

  tabsContainer.appendChild(tabElement);

  // Tell main process to create BrowserView
  ipcRenderer.send('create-tab', { tabId, url });

  // Switch to new tab
  switchTab(tabId);
}

// Switch to tab
function switchTab(tabId) {
  activeTabId = tabId;

  // Update tab styles
  document.querySelectorAll('.tab').forEach(tab => {
    if (parseInt(tab.dataset.tabId) === tabId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Tell main process to switch BrowserView
  ipcRenderer.send('switch-tab', { tabId });

  // Get current URL and update address bar
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    addressBar.value = tab.url;
  }

  updateNavigationButtons();
}

// Close tab
function closeTab(tabId) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;

  tabs.splice(tabIndex, 1);

  // Remove tab element
  const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (tabElement) tabElement.remove();

  // Tell main process to close BrowserView
  ipcRenderer.send('close-tab', { tabId });

  // If closing active tab, switch to another
  if (tabId === activeTabId) {
    if (tabs.length > 0) {
      const newActiveTab = tabs[Math.max(0, tabIndex - 1)];
      switchTab(newActiveTab.id);
    } else {
      // No tabs left, create new one
      createTab();
    }
  }
}

// Update tab title
function updateTabTitle(tabId, title) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.title = title;
    const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"] .tab-title`);
    if (tabElement) {
      tabElement.textContent = title;
    }
  }
}

// Navigate to URL
function navigateToUrl(input) {
  if (activeTabId === null) return;

  let url = input.trim();

  // If it looks like a URL
  if (url.match(/^https?:\/\//)) {
    // Already has protocol
  } else if (url.includes('.') && !url.includes(' ')) {
    url = 'https://' + url;
  } else {
    // Search query
    url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
  }

  // Update local state
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) {
    tab.url = url;
  }

  // Tell main process to navigate
  ipcRenderer.send('navigate', { tabId: activeTabId, url });
}

// Update navigation buttons
function updateNavigationButtons() {
  if (activeTabId === null) return;

  const state = ipcRenderer.sendSync('get-navigation-state', { tabId: activeTabId });
  backBtn.disabled = !state.canGoBack;
  forwardBtn.disabled = !state.canGoForward;
}

// Setup event listeners
function setupEventListeners() {
  // Back button
  backBtn.addEventListener('click', () => {
    if (activeTabId !== null) {
      ipcRenderer.send('go-back', { tabId: activeTabId });
    }
  });

  // Forward button
  forwardBtn.addEventListener('click', () => {
    if (activeTabId !== null) {
      ipcRenderer.send('go-forward', { tabId: activeTabId });
    }
  });

  // Reload button
  reloadBtn.addEventListener('click', () => {
    if (activeTabId !== null) {
      ipcRenderer.send('reload', { tabId: activeTabId });
    }
  });

  // Home button
  homeBtn.addEventListener('click', () => {
    navigateToUrl(HOME_PAGE);
  });

  // Go button
  goBtn.addEventListener('click', () => {
    navigateToUrl(addressBar.value);
  });

  // Address bar - Enter key
  addressBar.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      navigateToUrl(addressBar.value);
    }
  });

  // Address bar - Focus selects all
  addressBar.addEventListener('focus', () => {
    addressBar.select();
  });

  // New tab button
  newTabBtn.addEventListener('click', () => {
    createTab();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + T - New tab
    if ((e.metaKey || e.ctrlKey) && e.key === 't') {
      e.preventDefault();
      createTab();
    }

    // Cmd/Ctrl + W - Close tab
    if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
      e.preventDefault();
      if (activeTabId !== null) {
        closeTab(activeTabId);
      }
    }

    // Cmd/Ctrl + R - Reload
    if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
      e.preventDefault();
      if (activeTabId !== null) {
        ipcRenderer.send('reload', { tabId: activeTabId });
      }
    }

    // Cmd/Ctrl + L - Focus address bar
    if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
      e.preventDefault();
      addressBar.focus();
    }
  });
}
