// Utility functions that can be tested independently
const path = require('path');

/**
 * Get status icon based on status
 * @param {string} status - The status of the file
 * @returns {string} The corresponding icon
 */
function getStatusIcon(status) {
  switch (status) {
    case 'syncing': return '🔄';
    case 'synced': return '✅';
    case 'error': return '❌';
    case 'pending': return '⏳';
    default: return '📄';
  }
}

/**
 * Get change type icon based on type
 * @param {string} type - The type of change
 * @returns {string} The corresponding icon
 */
function getChangeTypeIcon(type) {
  switch (type) {
    case 'add': return '➕';
    case 'change': return '📝';
    case 'delete': return '🗑️';
    default: return '📄';
  }
}

/**
 * Format timestamp for display
 * @param {Date|null} timestamp - The timestamp to format
 * @returns {string} Formatted timestamp string
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Never';
  return timestamp.toLocaleString();
}

module.exports = {
  getStatusIcon,
  getChangeTypeIcon,
  formatTimestamp
};