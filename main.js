const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const http = require('http');
const chokidar = require('chokidar');
require('dotenv').config();

let oauth2Client;
let drive;
let authServer;
let mainWindow;
let fileWatcher;
let watchedFolder = null;
let driveMapping = new Map(); // Maps local paths to Drive file IDs
let pendingChanges = new Map(); // Maps file paths to change info
let lastSyncTime = null;

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

async function findDriveFileByName(fileName, parentFolderId = null) {
  try {
    let query = `name='${fileName}' and trashed=false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType)',
    });

    return response.data.files.length > 0 ? response.data.files[0] : null;
  } catch (error) {
    console.error('Error finding Drive file:', error);
    return null;
  }
}

async function updateDriveFile(fileId, filePath) {
  try {
    const media = {
      body: require('fs').createReadStream(filePath),
    };

    const response = await drive.files.update({
      fileId: fileId,
      media: media,
      fields: 'id, name, size',
    });

    return { success: true, file: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteDriveFile(fileId) {
  try {
    await drive.files.delete({
      fileId: fileId,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function startFileWatching(folderPath, driveFolderId) {
  if (fileWatcher) {
    fileWatcher.close();
  }

  watchedFolder = folderPath;

  fileWatcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  });

  fileWatcher.on('add', async (filePath) => {
    console.log(`File added: ${filePath}`);
    pendingChanges.set(filePath, {
      type: 'add',
      path: filePath,
      status: 'pending',
      timestamp: new Date()
    });

    if (mainWindow) {
      mainWindow.webContents.send('file-change', {
        type: 'add',
        path: filePath,
        status: 'pending',
        timestamp: new Date()
      });
    }
  });

  fileWatcher.on('change', async (filePath) => {
    console.log(`File changed: ${filePath}`);
    pendingChanges.set(filePath, {
      type: 'change',
      path: filePath,
      status: 'pending',
      timestamp: new Date()
    });

    if (mainWindow) {
      mainWindow.webContents.send('file-change', {
        type: 'change',
        path: filePath,
        status: 'pending',
        timestamp: new Date()
      });
    }
  });

  fileWatcher.on('unlink', async (filePath) => {
    console.log(`File deleted: ${filePath}`);
    pendingChanges.set(filePath, {
      type: 'delete',
      path: filePath,
      status: 'pending',
      timestamp: new Date()
    });

    if (mainWindow) {
      mainWindow.webContents.send('file-change', {
        type: 'delete',
        path: filePath,
        status: 'pending',
        timestamp: new Date()
      });
    }
  });

  if (mainWindow) {
    mainWindow.webContents.send('watch-status', {
      watching: true,
      folder: folderPath
    });
  }
}

function stopFileWatching() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
    watchedFolder = null;
    driveMapping.clear();
    pendingChanges.clear();
    lastSyncTime = null;

    if (mainWindow) {
      mainWindow.webContents.send('watch-status', {
        watching: false,
        folder: null
      });
    }
  }
}

ipcMain.handle('start-watching', async (event, options = {}) => {
  try {
    const { folderPath, driveFolderId } = options;
    if (!folderPath || !driveFolderId) {
      return { success: false, error: 'Folder path and Drive folder ID required' };
    }

    startFileWatching(folderPath, driveFolderId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-watching', async () => {
  try {
    stopFileWatching();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-watch-status', async () => {
  return {
    watching: !!fileWatcher,
    folder: watchedFolder,
    lastSyncTime: lastSyncTime,
    pendingChangesCount: pendingChanges.size
  };
});

ipcMain.handle('sync-pending-changes', async (event, options = {}) => {
  try {
    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
      return { success: false, error: 'Not authenticated' };
    }

    if (pendingChanges.size === 0) {
      return { success: true, message: 'No pending changes to sync', syncResults: [] };
    }

    const { driveFolderId } = options;
    if (!driveFolderId) {
      return { success: false, error: 'Drive folder ID required' };
    }

    const syncResults = [];
    const changes = Array.from(pendingChanges.values());

    for (const change of changes) {
      const { type, path: filePath } = change;

      try {
        if (type === 'add' || type === 'change') {
          // Check if file still exists
          const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
          if (!fileExists) {
            // File was deleted after being detected, skip
            pendingChanges.delete(filePath);
            continue;
          }

          const relativePath = path.relative(watchedFolder, filePath);
          const fileName = path.basename(filePath);
          const dirPath = path.dirname(relativePath);

          let parentId = driveFolderId;
          if (dirPath !== '.') {
            // Handle nested folders - create if needed
            const folders = dirPath.split(path.sep);
            for (const folder of folders) {
              const existingFolder = await findDriveFileByName(folder, parentId);
              if (existingFolder && existingFolder.mimeType === 'application/vnd.google-apps.folder') {
                parentId = existingFolder.id;
              } else {
                const newFolder = await createGoogleDriveFolder(folder, parentId);
                if (newFolder.success) {
                  parentId = newFolder.folder.id;
                }
              }
            }
          }

          let result;
          if (type === 'change' && driveMapping.has(filePath)) {
            // Update existing file
            const driveFileId = driveMapping.get(filePath);
            result = await updateDriveFile(driveFileId, filePath);
          } else {
            // Upload new file
            result = await uploadFileToGoogleDrive(filePath, fileName, parentId);
            if (result.success) {
              driveMapping.set(filePath, result.file.id);
            }
          }

          syncResults.push({
            path: filePath,
            type: type,
            success: result.success,
            error: result.success ? null : result.error
          });

          if (mainWindow) {
            mainWindow.webContents.send('file-change', {
              type: type,
              path: filePath,
              status: result.success ? 'synced' : 'error',
              error: result.success ? null : result.error
            });
          }

        } else if (type === 'delete') {
          const driveFileId = driveMapping.get(filePath);
          if (driveFileId) {
            const result = await deleteDriveFile(driveFileId);
            driveMapping.delete(filePath);

            syncResults.push({
              path: filePath,
              type: type,
              success: result.success,
              error: result.success ? null : result.error
            });

            if (mainWindow) {
              mainWindow.webContents.send('file-change', {
                type: type,
                path: filePath,
                status: result.success ? 'synced' : 'error',
                error: result.success ? null : result.error
              });
            }
          }
        }

        // Remove from pending changes if successful
        if (syncResults[syncResults.length - 1]?.success) {
          pendingChanges.delete(filePath);
        }

      } catch (error) {
        syncResults.push({
          path: filePath,
          type: type,
          success: false,
          error: error.message
        });

        if (mainWindow) {
          mainWindow.webContents.send('file-change', {
            type: type,
            path: filePath,
            status: 'error',
            error: error.message
          });
        }
      }
    }

    lastSyncTime = new Date();

    const successCount = syncResults.filter(r => r.success).length;
    const totalCount = syncResults.length;

    if (mainWindow) {
      mainWindow.webContents.send('sync-complete', {
        timestamp: lastSyncTime,
        successCount,
        totalCount,
        pendingChangesCount: pendingChanges.size
      });
    }

    return {
      success: true,
      syncResults,
      summary: {
        totalSynced: successCount,
        totalAttempted: totalCount,
        pendingRemaining: pendingChanges.size
      },
      lastSyncTime
    };

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
