import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { logger } from '../logger.js';
import * as messages from '../cli-ui/messages.js';

describe('Logger', () => {
  let uiInfoSpy: ReturnType<typeof vi.spyOn>;
  let uiSuccessSpy: ReturnType<typeof vi.spyOn>;
  let uiWarnSpy: ReturnType<typeof vi.spyOn>;
  let uiErrorSpy: ReturnType<typeof vi.spyOn>;
  let uiDimSpy: ReturnType<typeof vi.spyOn>;
  let uiStepNumberedSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    uiInfoSpy = vi.spyOn(messages.ui, 'info').mockImplementation(() => {});
    uiSuccessSpy = vi.spyOn(messages.ui, 'success').mockImplementation(() => {});
    uiWarnSpy = vi.spyOn(messages.ui, 'warn').mockImplementation(() => {});
    uiErrorSpy = vi.spyOn(messages.ui, 'error').mockImplementation(() => {});
    uiDimSpy = vi.spyOn(messages.ui, 'dim').mockImplementation(() => {});
    uiStepNumberedSpy = vi.spyOn(messages.ui, 'stepNumbered').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    logger.setDebug(false);
    delete process.env.RAPIDKIT_LOG_FORMAT;
  });

  describe('setDebug', () => {
    it('should enable debug mode', () => {
      logger.setDebug(true);
      logger.debug('test message');
      expect(uiDimSpy).toHaveBeenCalledWith('[debug] test message');
    });

    it('should disable debug mode', () => {
      logger.setDebug(false);
      logger.debug('test message');
      expect(uiDimSpy).not.toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    it('should log debug messages when debug is enabled', () => {
      logger.setDebug(true);
      logger.debug('debug message', 'arg1', 'arg2');
      expect(uiDimSpy).toHaveBeenCalledWith('[debug] debug message');
    });

    it('should not log debug messages when debug is disabled', () => {
      logger.setDebug(false);
      logger.debug('debug message');
      expect(uiDimSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('info message');
      expect(uiInfoSpy).toHaveBeenCalledWith('info message');
    });

    it('should log info messages with additional arguments', () => {
      logger.info('info message', 'arg1', 'arg2');
      expect(uiInfoSpy).toHaveBeenCalledWith('info message');
    });
  });

  describe('success', () => {
    it('should log success messages', () => {
      logger.success('success message');
      expect(uiSuccessSpy).toHaveBeenCalledWith('success message');
    });

    it('should log success messages with additional arguments', () => {
      logger.success('success message', { key: 'value' });
      expect(uiSuccessSpy).toHaveBeenCalledWith('success message');
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('warning message');
      expect(uiWarnSpy).toHaveBeenCalledWith('warning message');
    });

    it('should log warning messages with additional arguments', () => {
      logger.warn('warning message', 123);
      expect(uiWarnSpy).toHaveBeenCalledWith('warning message');
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('error message');
      expect(uiErrorSpy).toHaveBeenCalledWith('error message');
    });

    it('should log error messages with additional arguments', () => {
      const errorObj = new Error('test error');
      logger.error('error message', errorObj);
      expect(uiErrorSpy).toHaveBeenCalledWith('error message');
    });
  });

  describe('step', () => {
    it('should log step messages with progress', () => {
      logger.step(1, 5, 'First step');
      expect(uiStepNumberedSpy).toHaveBeenCalledWith(1, 5, 'First step');
    });

    it('should log step messages with different numbers', () => {
      logger.step(3, 10, 'Third step');
      expect(uiStepNumberedSpy).toHaveBeenCalledWith(3, 10, 'Third step');
    });

    it('should emit structured progress events in json log mode', () => {
      process.env.RAPIDKIT_LOG_FORMAT = 'json';
      const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      logger.step(2, 3, 'Setting up RapidKit environment');

      expect(uiStepNumberedSpy).not.toHaveBeenCalled();
      expect(stderrWrite).toHaveBeenCalledTimes(1);
      const event = JSON.parse(String(stderrWrite.mock.calls[0][0]).trim());
      expect(event.event).toBe('progress');
      expect(event.metadata.stepNum).toBe(2);
      expect(event.metadata.total).toBe(3);

      stderrWrite.mockRestore();
    });
  });
});
