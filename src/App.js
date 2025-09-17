import React, { useState } from 'react';

const { ipcRenderer } = window.require('electron');

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    try {
      const result = await ipcRenderer.invoke('google-auth');
      if (result.success) {
        setIsAuthenticated(true);
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

  const handleSync = async () => {
    setIsLoading(true);
    try {
      const result = await ipcRenderer.invoke('sync-gdrive');
      if (result.success) {
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
          <button
            onClick={handleSync}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#0F9D58',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer'
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
