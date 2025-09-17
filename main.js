const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const http = require('http');
require('dotenv').config();

let oauth2Client;
let drive;
let authServer;
let mainWindow;

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadURL('http://localhost:8080');

  mainWindow.on('focus', () => {
    if (oauth2Client && oauth2Client.credentials && oauth2Client.credentials.access_token) {
      mainWindow.webContents.send('auth-status-changed', { authenticated: true });
    }
  });
}

async function initializeGoogleAuth() {
  oauth2Client = new OAuth2Client(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    'http://localhost:8081/oauth2callback'
  );

  drive = google.drive({ version: 'v3', auth: oauth2Client });
}

ipcMain.handle('google-auth', async () => {
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    return new Promise((resolve) => {
      authServer = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost:8081');

        if (url.pathname === '/oauth2callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h2>✅ Authentication Successful!</h2>
                  <p>You can now close this tab and return to the application.</p>
                  <script>setTimeout(() => window.close(), 3000);</script>
                </body>
              </html>
            `);

            oauth2Client.getToken(code)
              .then(({ tokens }) => {
                oauth2Client.setCredentials(tokens);
                authServer.close();
                if (mainWindow) {
                  mainWindow.webContents.send('auth-status-changed', { authenticated: true });
                  mainWindow.focus();
                  mainWindow.show();
                  if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                  }
                }
                resolve({ success: true });
              })
              .catch((error) => {
                authServer.close();
                resolve({ success: false, error: error.message });
              });
          } else if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h2>❌ Authentication Failed</h2>
                  <p>Authentication was denied or cancelled.</p>
                  <script>setTimeout(() => window.close(), 3000);</script>
                </body>
              </html>
            `);
            authServer.close();
            resolve({ success: false, error: 'Authentication denied' });
          }
        }
      });

      authServer.listen(8081, () => {
        shell.openExternal(authUrl);
      });

      authServer.on('error', (error) => {
        resolve({ success: false, error: `Server error: ${error.message}` });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-auth-status', async () => {
  try {
    const isAuthenticated = oauth2Client && oauth2Client.credentials && oauth2Client.credentials.access_token;
    return { success: true, authenticated: isAuthenticated };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-folder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select folder to sync with Google Drive'
    });

    if (result.canceled) {
      return { success: false, error: 'Selection cancelled' };
    }

    return { success: true, folderPath: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

async function uploadFileToGoogleDrive(filePath, fileName, parentFolderId = null) {
  try {
    const fileMetadata = {
      name: fileName,
    };

    if (parentFolderId) {
      fileMetadata.parents = [parentFolderId];
    }

    const media = {
      body: require('fs').createReadStream(filePath),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, size',
    });

    return { success: true, file: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function createGoogleDriveFolder(folderName, parentFolderId = null) {
  try {
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentFolderId) {
      fileMetadata.parents = [parentFolderId];
    }

    const response = await drive.files.create({
      resource: fileMetadata,
      fields: 'id, name',
    });

    return { success: true, folder: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function uploadFolderContents(folderPath, parentFolderId = null) {
  try {
    const uploadResults = [];
    const items = await fs.readdir(folderPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(folderPath, item.name);

      if (item.isDirectory()) {
        const folderResult = await createGoogleDriveFolder(item.name, parentFolderId);
        if (folderResult.success) {
          uploadResults.push({
            type: 'folder',
            name: item.name,
            id: folderResult.folder.id,
            success: true
          });

          const subFolderResults = await uploadFolderContents(itemPath, folderResult.folder.id);
          uploadResults.push(...subFolderResults);
        } else {
          uploadResults.push({
            type: 'folder',
            name: item.name,
            success: false,
            error: folderResult.error
          });
        }
      } else if (item.isFile()) {
        const fileResult = await uploadFileToGoogleDrive(itemPath, item.name, parentFolderId);
        uploadResults.push({
          type: 'file',
          name: item.name,
          success: fileResult.success,
          id: fileResult.success ? fileResult.file.id : null,
          size: fileResult.success ? fileResult.file.size : null,
          error: fileResult.success ? null : fileResult.error
        });
      }
    }

    return uploadResults;
  } catch (error) {
    throw new Error(`Failed to read folder contents: ${error.message}`);
  }
}

ipcMain.handle('sync-gdrive', async (event, options = {}) => {
  try {
    console.log('Starting upload with options:', options); // Debug logging

    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
      console.log('Not authenticated'); // Debug logging
      return { success: false, error: 'Not authenticated' };
    }

    const folderPath = options.folderPath;

    if (!folderPath) {
      console.log('No folder path provided'); // Debug logging
      return { success: false, error: 'No folder path provided' };
    }

    console.log('Creating main folder for:', folderPath); // Debug logging
    const folderName = path.basename(folderPath);
    const mainFolderResult = await createGoogleDriveFolder(folderName);

    if (!mainFolderResult.success) {
      console.log('Failed to create main folder:', mainFolderResult.error); // Debug logging
      return { success: false, error: `Failed to create main folder: ${mainFolderResult.error}` };
    }

    console.log('Uploading folder contents...'); // Debug logging
    const uploadResults = await uploadFolderContents(folderPath, mainFolderResult.folder.id);

    const totalFiles = uploadResults.filter(r => r.type === 'file').length;
    const successfulFiles = uploadResults.filter(r => r.type === 'file' && r.success).length;
    const totalFolders = uploadResults.filter(r => r.type === 'folder').length;
    const successfulFolders = uploadResults.filter(r => r.type === 'folder' && r.success).length;

    console.log('Upload completed successfully'); // Debug logging
    return {
      success: true,
      mainFolder: mainFolderResult.folder,
      uploadResults,
      summary: {
        totalFiles,
        successfulFiles,
        totalFolders,
        successfulFolders,
        failedItems: uploadResults.filter(r => !r.success)
      }
    };
  } catch (error) {
    console.log('Upload error in main process:', error.message); // Debug logging
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
