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

## Key Files

- `src/App.js`: Main React component with auth and sync UI
- `main.js`: Electron main process (needs Google auth implementation)
- `.env`: Google API credentials