import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');

  useEffect(() => {
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

    checkAuthStatus();

    ipcRenderer.on('auth-status-changed', handleAuthStatusChange);

    return () => {
      ipcRenderer.removeListener('auth-status-changed', handleAuthStatusChange);
    };
  }, []);

  const handleGoogleAuth = async () => {
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
    if (!selectedFolder) {
      setNotification('Please select a folder to sync first');
      setTimeout(() => setNotification(''), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const result = await ipcRenderer.invoke('sync-gdrive', { folderPath: selectedFolder });
      if (result.success) {
        setNotification('Sync completed successfully!');
        setTimeout(() => setNotification(''), 3000);
        console.log('Sync successful:', result.files);
      } else {
        console.error('Sync failed:', result.error);
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
            {isLoading ? 'Syncing...' : 'Sync Google Drive'}
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
