const { app, BrowserWindow, BrowserView } = require('electron');
const path = require('path');

let mainWindow;
let tabs = new Map(); // tabId -> BrowserView
let activeTabId = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#202124'
  });

  mainWindow.loadFile('src/browser.html');

  // IPC handlers for tab management
  const { ipcMain } = require('electron');

  ipcMain.on('create-tab', (event, data) => {
    const tabId = data.tabId;
    const url = data.url;

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    tabs.set(tabId, view);

    // Load URL
    view.webContents.loadURL(url);

    // Send navigation events back to renderer
    view.webContents.on('did-navigate', (event, url) => {
      mainWindow.webContents.send('tab-navigated', { tabId, url });
    });

    view.webContents.on('did-navigate-in-page', (event, url) => {
      mainWindow.webContents.send('tab-navigated', { tabId, url });
    });

    view.webContents.on('page-title-updated', (event, title) => {
      mainWindow.webContents.send('tab-title-updated', { tabId, title });
    });

    view.webContents.on('did-start-loading', () => {
      mainWindow.webContents.send('tab-loading', { tabId, loading: true });
    });

    view.webContents.on('did-stop-loading', () => {
      const title = view.webContents.getTitle();
      mainWindow.webContents.send('tab-loading', { tabId, loading: false });
      mainWindow.webContents.send('tab-title-updated', { tabId, title });
    });
  });

  ipcMain.on('switch-tab', (event, data) => {
    const tabId = data.tabId;

    // Hide all views
    tabs.forEach((view) => {
      mainWindow.removeBrowserView(view);
    });

    // Show selected view
    const view = tabs.get(tabId);
    if (view) {
      mainWindow.addBrowserView(view);
      updateBrowserViewBounds(view);
      activeTabId = tabId;
    }
  });

  ipcMain.on('close-tab', (event, data) => {
    const tabId = data.tabId;
    const view = tabs.get(tabId);
    if (view) {
      mainWindow.removeBrowserView(view);
      view.webContents.destroy();
      tabs.delete(tabId);
    }
  });

  ipcMain.on('navigate', (event, data) => {
    const tabId = data.tabId;
    const url = data.url;
    const view = tabs.get(tabId);
    if (view) {
      view.webContents.loadURL(url);
    }
  });

  ipcMain.on('go-back', (event, data) => {
    const view = tabs.get(data.tabId);
    if (view && view.webContents.canGoBack()) {
      view.webContents.goBack();
    }
  });

  ipcMain.on('go-forward', (event, data) => {
    const view = tabs.get(data.tabId);
    if (view && view.webContents.canGoForward()) {
      view.webContents.goForward();
    }
  });

  ipcMain.on('reload', (event, data) => {
    const view = tabs.get(data.tabId);
    if (view) {
      view.webContents.reload();
    }
  });

  ipcMain.on('get-navigation-state', (event, data) => {
    const view = tabs.get(data.tabId);
    if (view) {
      event.returnValue = {
        canGoBack: view.webContents.canGoBack(),
        canGoForward: view.webContents.canGoForward()
      };
    } else {
      event.returnValue = { canGoBack: false, canGoForward: false };
    }
  });

  // Update view bounds when window is resized
  mainWindow.on('resize', () => {
    if (activeTabId !== null) {
      const view = tabs.get(activeTabId);
      if (view) {
        updateBrowserViewBounds(view);
      }
    }
  });
}

function updateBrowserViewBounds(view) {
  const bounds = mainWindow.getContentBounds();
  // 100px for toolbar + tabs
  view.setBounds({ x: 0, y: 100, width: bounds.width, height: bounds.height - 100 });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
