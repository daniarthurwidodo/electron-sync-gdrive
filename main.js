const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

let oauth2Client;
let drive;

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadURL('http://localhost:8080');
}

async function initializeGoogleAuth() {
  oauth2Client = new OAuth2Client(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback'
  );

  drive = google.drive({ version: 'v3', auth: oauth2Client });
}

ipcMain.handle('google-auth', async () => {
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    await shell.openExternal(authUrl);

    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 500,
        height: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      authWindow.loadURL(authUrl);
      authWindow.show();

      authWindow.webContents.on('will-redirect', async (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);

        if (parsedUrl.pathname === '/oauth2callback') {
          const code = parsedUrl.searchParams.get('code');

          if (code) {
            try {
              const { tokens } = await oauth2Client.getToken(code);
              oauth2Client.setCredentials(tokens);

              authWindow.close();
              resolve({ success: true });
            } catch (error) {
              authWindow.close();
              resolve({ success: false, error: error.message });
            }
          }
        }
      });

      authWindow.on('closed', () => {
        resolve({ success: false, error: 'Authentication cancelled' });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-gdrive', async () => {
  try {
    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await drive.files.list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
    });

    const files = response.data.files;
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(async () => {
  await initializeGoogleAuth();
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
