import React, { useState, useEffect } from 'react';
import { getStatusIcon, getChangeTypeIcon, formatTimestamp } from './utils';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [isWatching, setIsWatching] = useState(false);
  const [watchedFolder, setWatchedFolder] = useState('');
  const [fileChanges, setFileChanges] = useState([]);
  const [uploadedFolderId, setUploadedFolderId] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [pendingChangesCount, setPendingChangesCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Electron-specific modules (lazy loaded for testing)
  const [ipcRenderer, setIpcRenderer] = useState(null);
  const [pathModule, setPathModule] = useState(null);

  useEffect(() => {
    // Initialize Electron modules
    if (typeof window !== 'undefined' && window.require) {
      const { ipcRenderer } = window.require('electron');
      const path = window.require('path');
      setIpcRenderer(ipcRenderer);
      setPathModule(path);
    }

    // Only run Electron-specific code if we're in Electron
    if (typeof window !== 'undefined' && window.require && ipcRenderer) {
      const checkAuthStatus = async () => {
        try {
          const result = await ipcRenderer.invoke('check-auth-status');
          if (result.success && result.authenticated) {
            setIsAuthenticated(true);
          }
        } catch (error) {
          console.error('Error checking auth status:', error);
        }
      };

      const handleAuthStatusChange = (event, data) => {
        if (data.authenticated) {
          setIsAuthenticated(true);
          setNotification('Successfully authenticated with Google Drive!');
          setTimeout(() => setNotification(''), 3000);
        }
      };

      const handleWatchStatus = (event, data) => {
        setIsWatching(data.watching);
        setWatchedFolder(data.folder || '');
        setLastSyncTime(data.lastSyncTime ? new Date(data.lastSyncTime) : null);
        setPendingChangesCount(data.pendingChangesCount || 0);
      };

      const handleFileChange = (event, data) => {
        setFileChanges(prev => {
          const filtered = prev.filter(change => change.path !== data.path);
          return [data, ...filtered].slice(0, 10); // Keep only last 10 changes
        });

        // Update pending changes count
        if (data.status === 'pending') {
          setPendingChangesCount(prev => prev + 1);
        } else if (data.status === 'synced') {
          setPendingChangesCount(prev => Math.max(0, prev - 1));
        }
      };

      const handleSyncComplete = (event, data) => {
        setLastSyncTime(new Date(data.timestamp));
        setPendingChangesCount(data.pendingChangesCount);
        setNotification(`Sync completed: ${data.successCount}/${data.totalCount} files synced`);
        setTimeout(() => setNotification(''), 3000);
      };

      checkAuthStatus();

      ipcRenderer.on('auth-status-changed', handleAuthStatusChange);
      ipcRenderer.on('watch-status', handleWatchStatus);
      ipcRenderer.on('file-change', handleFileChange);
      ipcRenderer.on('sync-complete', handleSyncComplete);

      return () => {
        ipcRenderer.removeListener('auth-status-changed', handleAuthStatusChange);
        ipcRenderer.removeListener('watch-status', handleWatchStatus);
        ipcRenderer.removeListener('file-change', handleFileChange);
        ipcRenderer.removeListener('sync-complete', handleSyncComplete);
      };
    }
  }, [ipcRenderer]);

  const handleGoogleAuth = async () => {
    if (!ipcRenderer) return;
    
    setIsLoading(true);
    try {
      const result = await ipcRenderer.invoke('google-auth');
      if (result.success) {
        setIsAuthenticated(true);
        setNotification('Successfully authenticated with Google Drive!');
        setTimeout(() => setNotification(''), 3000);
        console.log('Authentication successful');
      } else {
        console.error('Authentication failed:', result.error);
      }
    } catch (error) {
      console.error('Authentication error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFolderSelect = async () => {
    if (!ipcRenderer) return;
    
    try {
      const result = await ipcRenderer.invoke('select-folder');
      if (result.success) {
        setSelectedFolder(result.folderPath);
        setNotification(`Folder selected: ${result.folderPath}`);
        setTimeout(() => setNotification(''), 3000);
      }
    } catch (error) {
      console.error('Folder selection error:', error);
    }
  };

  const handleSync = async () => {
    if (!ipcRenderer) return;
    
    if (!selectedFolder) {
      setNotification('Please select a folder to sync first');
      setTimeout(() => setNotification(''), 3000);
      return;
    }

    setIsLoading(true);
    setNotification('Uploading folder to Google Drive...');

    try {
      const result = await ipcRenderer.invoke('sync-gdrive', { folderPath: selectedFolder });
      console.log('Upload result:', result); // Debug logging

      if (result.success && result.summary) {
        const { summary, mainFolder } = result;
        setUploadedFolderId(mainFolder.id);
        setNotification(
          `Upload completed! Files: ${summary.successfulFiles}/${summary.totalFiles}, ` +
          `Folders: ${summary.successfulFolders}/${summary.totalFolders}`
        );
        setTimeout(() => setNotification(''), 5000);
        console.log('Upload successful:', result);
      } else {
        setNotification(`Upload failed: ${result.error || 'Unknown error'}`);
        setTimeout(() => setNotification(''), 5000);
        console.error('Upload failed - Full result:', result);
      }
    } catch (error) {
      setNotification(`Upload error: ${error.message}`);
      setTimeout(() => setNotification(''), 5000);
      console.error('Upload error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartWatching = async () => {
    if (!ipcRenderer) return;
    
    if (!selectedFolder || !uploadedFolderId) {
      setNotification('Please upload a folder first before starting file watching');
      setTimeout(() => setNotification(''), 3000);
      return;
    }

    try {
      const result = await ipcRenderer.invoke('start-watching', {
        folderPath: selectedFolder,
        driveFolderId: uploadedFolderId
      });

      if (result.success) {
        setNotification('Started watching folder for changes');
        setTimeout(() => setNotification(''), 3000);
      } else {
        setNotification(`Failed to start watching: ${result.error}`);
        setTimeout(() => setNotification(''), 3000);
      }
    } catch (error) {
      setNotification(`Error starting watch: ${error.message}`);
      setTimeout(() => setNotification(''), 3000);
    }
  };

  const handleSyncChanges = async () => {
    if (!ipcRenderer) return;
    
    if (!uploadedFolderId) {
      setNotification('No folder to sync changes to');
      setTimeout(() => setNotification(''), 3000);
      return;
    }

    if (pendingChangesCount === 0) {
      setNotification('No pending changes to sync');
      setTimeout(() => setNotification(''), 3000);
      return;
    }

    setIsSyncing(true);
    setNotification('Syncing pending changes...');

    try {
      const result = await ipcRenderer.invoke('sync-pending-changes', {
        driveFolderId: uploadedFolderId
      });

      if (result.success) {
        const { summary } = result;
        if (summary.totalAttempted === 0) {
          setNotification('No pending changes to sync');
        } else {
          setNotification(`Synced ${summary.totalSynced}/${summary.totalAttempted} changes`);
        }
        setTimeout(() => setNotification(''), 3000);
      } else {
        setNotification(`Sync failed: ${result.error}`);
        setTimeout(() => setNotification(''), 3000);
      }
    } catch (error) {
      setNotification(`Sync error: ${error.message}`);
      setTimeout(() => setNotification(''), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleStopWatching = async () => {
    if (!ipcRenderer) return;
    
    try {
      const result = await ipcRenderer.invoke('stop-watching');
      if (result.success) {
        setNotification('Stopped watching folder');
        setFileChanges([]);
        setTimeout(() => setNotification(''), 3000);
      }
    } catch (error) {
      setNotification(`Error stopping watch: ${error.message}`);
      setTimeout(() => setNotification(''), 3000);
    }
  };

  // For testing purposes, we'll render a simplified version if not in Electron
  if (!ipcRenderer || !pathModule) {
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <h1>Google Drive Sync</h1>
        <p>Application running in test environment</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Google Drive Sync</h1>

      {notification && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          backgroundColor: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: '4px'
        }}>
          {notification}
        </div>
      )}

      {!isAuthenticated ? (
        <div>
          <p>Please authenticate with Google to sync your Drive files.</p>
          <button
            onClick={handleGoogleAuth}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#4285F4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? 'Authenticating...' : 'Authenticate with Google'}
          </button>
        </div>
      ) : (
        <div>
          <p>✅ Authenticated with Google Drive</p>

          <div style={{ marginBottom: '20px' }}>
            <h3>Select Folder to Sync</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <button
                onClick={handleFolderSelect}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#FF9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Choose Folder
              </button>
              {selectedFolder && (
                <span style={{ fontSize: '14px', color: '#666' }}>
                  Selected: {selectedFolder}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={handleSync}
              disabled={isLoading || !selectedFolder}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: selectedFolder ? '#0F9D58' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (isLoading || !selectedFolder) ? 'not-allowed' : 'pointer'
              }}
            >
              {isLoading ? 'Uploading to Google Drive...' : 'Upload Folder to Google Drive'}
            </button>

            {uploadedFolderId && (
              <>
                <button
                  onClick={isWatching ? handleStopWatching : handleStartWatching}
                  disabled={isLoading}
                  style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    backgroundColor: isWatching ? '#f44336' : '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isWatching ? 'Stop Watching' : 'Start Watching'}
                </button>

                {isWatching && (
                  <button
                    onClick={handleSyncChanges}
                    disabled={isSyncing || pendingChangesCount === 0}
                    style={{
                      padding: '10px 20px',
                      fontSize: '16px',
                      backgroundColor: pendingChangesCount > 0 ? '#FF9800' : '#ccc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: (isSyncing || pendingChangesCount === 0) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isSyncing ? 'Syncing...' : `Sync Changes (${pendingChangesCount})`}
                  </button>
                )}
              </>
            )}
          </div>

          {isWatching && (
            <div style={{
              padding: '15px',
              backgroundColor: '#e8f5e8',
              border: '1px solid #4caf50',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#2e7d32' }}>
                👀 Watching for Changes
              </h3>
              <p style={{ margin: '0', fontSize: '14px', color: '#555' }}>
                Watching: {pathModule.basename(watchedFolder)}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                <span style={{ fontSize: '12px', color: '#777' }}>
                  Pending changes: {pendingChangesCount}
                </span>
                <span style={{ fontSize: '12px', color: '#777' }}>
                  Last sync: {formatTimestamp(lastSyncTime)}
                </span>
              </div>
            </div>
          )}

          {fileChanges.length > 0 && (
            <div style={{
              padding: '15px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: '0 0 10px 0' }}>Recent File Changes</h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {fileChanges.map((change, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 0',
                    borderBottom: index < fileChanges.length - 1 ? '1px solid #eee' : 'none'
                  }}>
                    <span style={{ marginRight: '8px' }}>
                      {getChangeTypeIcon(change.type)}
                    </span>
                    <span style={{ marginRight: '8px' }}>
                      {getStatusIcon(change.status)}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#555',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {pathModule.basename(change.path)}
                    </span>
                    {change.error && (
                      <span style={{ fontSize: '10px', color: '#f44336', marginLeft: '8px' }}>
                        Error
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Google Drive Sync</h1>

      {notification && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          backgroundColor: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: '4px'
        }}>
          {notification}
        </div>
      )}

      {!isAuthenticated ? (
        <div>
          <p>Please authenticate with Google to sync your Drive files.</p>
          <button
            onClick={handleGoogleAuth}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#4285F4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? 'Authenticating...' : 'Authenticate with Google'}
          </button>
        </div>
      ) : (
        <div>
          <p>✅ Authenticated with Google Drive</p>

          <div style={{ marginBottom: '20px' }}>
            <h3>Select Folder to Sync</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <button
                onClick={handleFolderSelect}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#FF9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Choose Folder
              </button>
              {selectedFolder && (
                <span style={{ fontSize: '14px', color: '#666' }}>
                  Selected: {selectedFolder}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={handleSync}
              disabled={isLoading || !selectedFolder}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: selectedFolder ? '#0F9D58' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (isLoading || !selectedFolder) ? 'not-allowed' : 'pointer'
              }}
            >
              {isLoading ? 'Uploading to Google Drive...' : 'Upload Folder to Google Drive'}
            </button>

            {uploadedFolderId && (
              <>
                <button
                  onClick={isWatching ? handleStopWatching : handleStartWatching}
                  disabled={isLoading}
                  style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    backgroundColor: isWatching ? '#f44336' : '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isWatching ? 'Stop Watching' : 'Start Watching'}
                </button>

                {isWatching && (
                  <button
                    onClick={handleSyncChanges}
                    disabled={isSyncing || pendingChangesCount === 0}
                    style={{
                      padding: '10px 20px',
                      fontSize: '16px',
                      backgroundColor: pendingChangesCount > 0 ? '#FF9800' : '#ccc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: (isSyncing || pendingChangesCount === 0) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isSyncing ? 'Syncing...' : `Sync Changes (${pendingChangesCount})`}
                  </button>
                )}
              </>
            )}
          </div>

          {isWatching && (
            <div style={{
              padding: '15px',
              backgroundColor: '#e8f5e8',
              border: '1px solid #4caf50',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#2e7d32' }}>
                👀 Watching for Changes
              </h3>
              <p style={{ margin: '0', fontSize: '14px', color: '#555' }}>
                Watching: {path.basename(watchedFolder)}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                <span style={{ fontSize: '12px', color: '#777' }}>
                  Pending changes: {pendingChangesCount}
                </span>
                <span style={{ fontSize: '12px', color: '#777' }}>
                  Last sync: {formatTimestamp(lastSyncTime)}
                </span>
              </div>
            </div>
          )}

          {fileChanges.length > 0 && (
            <div style={{
              padding: '15px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: '0 0 10px 0' }}>Recent File Changes</h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {fileChanges.map((change, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 0',
                    borderBottom: index < fileChanges.length - 1 ? '1px solid #eee' : 'none'
                  }}>
                    <span style={{ marginRight: '8px' }}>
                      {getChangeTypeIcon(change.type)}
                    </span>
                    <span style={{ marginRight: '8px' }}>
                      {getStatusIcon(change.status)}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#555',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {path.basename(change.path)}
                    </span>
                    {change.error && (
                      <span style={{ fontSize: '10px', color: '#f44336', marginLeft: '8px' }}>
                        Error
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
