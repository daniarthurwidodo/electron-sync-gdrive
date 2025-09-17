# Claude Code Configuration

## Development Commands

```bash
# Start development server
npm start

# Build for production
npm run build

# Package as desktop app
npm run package
```

## Google Drive Integration

This app uses Google Drive API for file synchronization. Credentials are stored in `.env`:

- `GOOGLE_DRIVE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_DRIVE_CLIENT_SECRET`: Google OAuth client secret

## Architecture

- **Frontend**: React app running in Electron renderer process
- **Backend**: Electron main process handles Google OAuth and Drive API calls
- **Communication**: IPC between renderer and main process
- **OAuth Flow**: Local HTTP server on port 8081 for OAuth callback handling

## Implementation Status

### ✅ Completed Features
- Google OAuth 2.0 authentication with proper redirect handling
- Main window focus restoration after successful authentication
- Real-time authentication status updates via IPC
- Local folder selection dialog
- Google Drive file listing (first 10 files)
- Clean React UI with loading states and notifications

### 🔄 Current Functionality
- Authentication works with automatic window focus after OAuth
- File listing displays basic file information (id, name, mimeType, size)
- Local folder selection for future sync operations
- Error handling for authentication and API calls

## Key Files

- `src/App.js`: Main React component with complete auth and sync UI
- `main.js`: Electron main process with full Google OAuth implementation
- `.env`: Google API credentials

## OAuth Configuration
- Redirect URI: `http://localhost:8081/oauth2callback`
- Scopes: `https://www.googleapis.com/auth/drive.readonly`
- Callback server runs on port 8081 during authentication