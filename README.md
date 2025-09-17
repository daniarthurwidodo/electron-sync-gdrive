# Electron Google Drive Sync

A desktop application built with Electron and React that allows users to authenticate with Google Drive and sync local folders with their Google Drive files.

## Features

- Google OAuth 2.0 authentication with automatic window focus after login
- Browse and list Google Drive files
- Local folder selection for synchronization
- Real-time authentication status updates
- Clean, modern UI built with React
- Cross-platform desktop app powered by Electron

## Prerequisites

- Node.js >= 22.15.0
- Google Drive API credentials

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your Google Drive API credentials:
   ```
   GOOGLE_DRIVE_CLIENT_ID=your_client_id_here
   GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret_here
   ```

## Development

Start the development server:
```bash
npm start
```

This will start both the React development server and the Electron app.

## Building

Build the React app:
```bash
npm run build
```

Package as a desktop application:
```bash
npm run package
```

## Usage

1. Launch the application
2. Click "Authenticate with Google" to sign in to your Google account
   - This will open your default browser for OAuth authentication
   - After successful login, the app window will automatically regain focus
3. Once authenticated, you'll see a green checkmark indicating successful login
4. Click "Choose Folder" to select a local directory for synchronization
5. Click "Sync Google Drive" to start the sync process and view your Drive files

## How It Works

- **Authentication**: Uses Google OAuth 2.0 with a local callback server on port 8081
- **IPC Communication**: Electron's main and renderer processes communicate via IPC for secure API calls
- **File Listing**: Currently displays the first 10 files from your Google Drive
- **Local Integration**: Allows selection of local folders for future sync functionality

## Tech Stack

- **Electron**: Desktop app framework
- **React**: Frontend UI library
- **Google APIs**: For Drive integration and authentication
- **Webpack**: Module bundler