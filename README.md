# Electron Google Drive Sync

A desktop application built with Electron and React that allows users to authenticate with Google and sync files from Google Drive.

## Features

- Google OAuth authentication
- Google Drive file synchronization
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
3. Once authenticated, click "Sync Google Drive" to fetch your files

## Tech Stack

- **Electron**: Desktop app framework
- **React**: Frontend UI library
- **Google APIs**: For Drive integration and authentication
- **Webpack**: Module bundler