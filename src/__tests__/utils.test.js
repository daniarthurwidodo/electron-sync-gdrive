const { getStatusIcon, getChangeTypeIcon, formatTimestamp } = require('../utils');

describe('Utility Functions', () => {
  describe('getStatusIcon', () => {
    test('returns correct icons for each status', () => {
      expect(getStatusIcon('syncing')).toBe('🔄');
      expect(getStatusIcon('synced')).toBe('✅');
      expect(getStatusIcon('error')).toBe('❌');
      expect(getStatusIcon('pending')).toBe('⏳');
      expect(getStatusIcon('unknown')).toBe('📄');
      expect(getStatusIcon(null)).toBe('📄');
    });
  });

  describe('getChangeTypeIcon', () => {
    test('returns correct icons for each change type', () => {
      expect(getChangeTypeIcon('add')).toBe('➕');
      expect(getChangeTypeIcon('change')).toBe('📝');
      expect(getChangeTypeIcon('delete')).toBe('🗑️');
      expect(getChangeTypeIcon('unknown')).toBe('📄');
      expect(getChangeTypeIcon(null)).toBe('📄');
    });
  });

  describe('formatTimestamp', () => {
    test('returns "Never" for null or undefined timestamp', () => {
      expect(formatTimestamp(null)).toBe('Never');
      expect(formatTimestamp(undefined)).toBe('Never');
    });

    test('formats valid date correctly', () => {
      // Create a fixed date for testing
      const testDate = new Date('2023-01-01T12:00:00Z');
      // The exact format may vary based on locale, but it should contain the date parts
      const formatted = formatTimestamp(testDate);
      expect(formatted).toContain('2023');
      expect(formatted).toContain('1');
    });
  });
});