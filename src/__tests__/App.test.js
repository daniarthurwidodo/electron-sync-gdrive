import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Mock electron's ipcRenderer
const mockIpcRenderer = {
  invoke: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn()
};

// Mock window.require to return our mock ipcRenderer
Object.defineProperty(window, 'require', {
  writable: true,
  value: jest.fn().mockImplementation((module) => {
    if (module === 'electron') {
      return { ipcRenderer: mockIpcRenderer };
    }
    if (module === 'path') {
      return {
        basename: jest.fn().mockImplementation((path) => path.split('/').pop()),
        relative: jest.fn().mockImplementation((from, to) => to.replace(from, ''))
      };
    }
    return {};
  })
});

describe('App', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('renders authentication prompt when not authenticated', async () => {
    // Mock check-auth-status to return unauthenticated
    mockIpcRenderer.invoke.mockImplementation((channel) => {
      if (channel === 'check-auth-status') {
        return Promise.resolve({ success: true, authenticated: false });
      }
      return Promise.resolve({});
    });

    render(<App />);
    
    // Check that authentication prompt is shown
    expect(screen.getByText('Please authenticate with Google to sync your Drive files.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Authenticate with Google' })).toBeInTheDocument();
  });

  test('shows authenticated state after successful auth', async () => {
    // Mock check-auth-status to return authenticated
    mockIpcRenderer.invoke.mockImplementation((channel) => {
      if (channel === 'check-auth-status') {
        return Promise.resolve({ success: true, authenticated: true });
      }
      if (channel === 'google-auth') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({});
    });

    render(<App />);
    
    // Check that authenticated state is shown
    expect(await screen.findByText('✅ Authenticated with Google Drive')).toBeInTheDocument();
  });
});