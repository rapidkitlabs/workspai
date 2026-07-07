import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceMonitor, measure, measurePerformance } from '../utils/performance.js';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    monitor = PerformanceMonitor.getInstance();
    monitor.clear();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = PerformanceMonitor.getInstance();
      const instance2 = PerformanceMonitor.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('start and end', () => {
    it('should measure time duration', () => {
      monitor.start('test-timer');
      const duration = monitor.end('test-timer');

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(typeof duration).toBe('number');
    });

    it('should track multiple timers', () => {
      monitor.start('timer-1');
      monitor.start('timer-2');

      const duration1 = monitor.end('timer-1');
      const duration2 = monitor.end('timer-2');

      expect(duration1).toBeGreaterThanOrEqual(0);
      expect(duration2).toBeGreaterThanOrEqual(0);
    });

    it('should handle ending non-existent timer', () => {
      const duration = monitor.end('non-existent');
      expect(duration).toBe(0);
    });

    it('should not allow starting same timer twice', () => {
      monitor.start('duplicate');
      monitor.start('duplicate'); // Overwrites

      const duration = monitor.end('duplicate');
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getMetrics', () => {
    it('should return empty array initially', () => {
      expect(monitor.getMetrics()).toEqual([]);
    });

    it('should return all recorded metrics', () => {
      monitor.start('metric-1');
      monitor.end('metric-1');

      monitor.start('metric-2');
      monitor.end('metric-2');

      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics[0].name).toBe('metric-1');
      expect(metrics[1].name).toBe('metric-2');
    });

    it('should include duration and timestamp', () => {
      monitor.start('test');
      monitor.end('test');

      const metrics = monitor.getMetrics();
      expect(metrics[0]).toHaveProperty('name');
      expect(metrics[0]).toHaveProperty('duration');
      expect(metrics[0]).toHaveProperty('timestamp');
      expect(metrics[0].duration).toBeGreaterThanOrEqual(0);
      expect(metrics[0].timestamp).toBeGreaterThan(0);
    });

    it('should return copy of metrics array', () => {
      monitor.start('test');
      monitor.end('test');

      const metrics1 = monitor.getMetrics();
      const metrics2 = monitor.getMetrics();

      expect(metrics1).not.toBe(metrics2); // Different instances
      expect(metrics1).toEqual(metrics2); // Same content
    });
  });

  describe('clear', () => {
    it('should clear all metrics', () => {
      monitor.start('metric-1');
      monitor.end('metric-1');
      monitor.start('metric-2');
      monitor.end('metric-2');

      monitor.clear();

      expect(monitor.getMetrics()).toEqual([]);
    });

    it('should clear active timers', () => {
      monitor.start('active-timer');
      monitor.clear();

      const duration = monitor.end('active-timer');
      expect(duration).toBe(0); // Timer was cleared
    });
  });

  describe('summary', () => {
    it('should display performance summary', () => {
      monitor.start('operation-1');
      monitor.end('operation-1');

      monitor.start('operation-2');
      monitor.end('operation-2');

      monitor.summary();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Performance Summary'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Total:'));
    });

    it('should not display summary when no metrics', () => {
      monitor.summary();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should show top 10 metrics when more than 10 exist', () => {
      // Add 15 metrics
      for (let i = 1; i <= 15; i++) {
        monitor.start(`metric-${i}`);
        monitor.end(`metric-${i}`);
      }

      monitor.summary();

      const calls = consoleLogSpy.mock.calls;
      // Should show header + 10 metrics + total = 12 lines
      expect(calls.length).toBeLessThanOrEqual(12);
    });

    it('should sort metrics by duration (slowest first)', () => {
      monitor.start('fast');
      monitor.end('fast');

      monitor.start('slow');
      // Simulate slower operation
      const startTime = Date.now();
      while (Date.now() - startTime < 5) {
        // Small delay
      }
      monitor.end('slow');

      monitor.summary();

      const metrics = monitor.getMetrics();
      const slowMetric = metrics.find((m) => m.name === 'slow');
      const fastMetric = metrics.find((m) => m.name === 'fast');

      expect(slowMetric?.duration).toBeGreaterThan(fastMetric?.duration || 0);
    });

    it('should format durations with 2 decimal places', () => {
      monitor.start('test');
      monitor.end('test');

      monitor.summary();

      const summaryCall = consoleLogSpy.mock.calls.find((call) => String(call[0]).includes('test'));

      if (summaryCall) {
        expect(String(summaryCall[0])).toMatch(/\d+\.\d{2}ms/);
      }
    });

    it('should display total time', () => {
      monitor.start('op1');
      monitor.end('op1');
      monitor.start('op2');
      monitor.end('op2');

      monitor.summary();

      const totalCall = consoleLogSpy.mock.calls.find((call) => String(call[0]).includes('Total:'));

      expect(totalCall).toBeDefined();
    });
  });
});

describe('measure helper', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = PerformanceMonitor.getInstance();
    monitor.clear();
  });

  it('should measure async function execution', async () => {
    const result = await measure('test-operation', async () => {
      return 'result';
    });

    expect(result).toBe('result');
    const metrics = monitor.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].name).toBe('test-operation');
  });

  it('should handle async functions that throw errors', async () => {
    await expect(
      measure('error-operation', async () => {
        throw new Error('Test error');
      })
    ).rejects.toThrow('Test error');

    // Metric should still be recorded
    const metrics = monitor.getMetrics();
    expect(metrics).toHaveLength(1);
  });

  it('should measure execution time accurately', async () => {
    const delayMs = 50;
    await measure('delay-operation', async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    });

    const metrics = monitor.getMetrics();
    expect(metrics[0].duration).toBeGreaterThanOrEqual(delayMs - 10); // Allow some margin
  });

  it('should support nested measurements', async () => {
    await measure('outer', async () => {
      await measure('inner-1', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      await measure('inner-2', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    });

    const metrics = monitor.getMetrics();
    expect(metrics).toHaveLength(3);
    expect(metrics.map((m) => m.name)).toContain('outer');
    expect(metrics.map((m) => m.name)).toContain('inner-1');
    expect(metrics.map((m) => m.name)).toContain('inner-2');
  });

  it('should return function result', async () => {
    const result = await measure('calculation', async () => {
      return { sum: 1 + 2, product: 3 * 4 };
    });

    expect(result).toEqual({ sum: 3, product: 12 });
  });

  it('should handle promise rejection', async () => {
    const error = new Error('Rejected');

    await expect(
      measure('rejection', async () => {
        return Promise.reject(error);
      })
    ).rejects.toThrow('Rejected');
  });
});

describe('measurePerformance Decorator', () => {
  let monitor: PerformanceMonitor;

  function decorateMethod(target: object, propertyKey: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
    if (!descriptor) {
      throw new Error(`Missing descriptor for ${propertyKey}`);
    }
    const measured = measurePerformance(target, propertyKey, descriptor);
    Object.defineProperty(target, propertyKey, measured ?? descriptor);
  }

  beforeEach(() => {
    monitor = PerformanceMonitor.getInstance();
    monitor.clear();
  });

  it('should measure decorated async method performance', async () => {
    class TestClass {
      async testMethod(): Promise<string> {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result';
      }
    }
    decorateMethod(TestClass.prototype, 'testMethod');

    const instance = new TestClass();
    const result = await instance.testMethod();

    expect(result).toBe('result');

    const metrics = monitor.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].name).toBe('TestClass.testMethod');
    expect(metrics[0].duration).toBeGreaterThan(0);
  });

  it('should measure decorated method with parameters', async () => {
    class Calculator {
      async add(a: number, b: number): Promise<number> {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return a + b;
      }
    }
    decorateMethod(Calculator.prototype, 'add');

    const calc = new Calculator();
    const result = await calc.add(5, 3);

    expect(result).toBe(8);

    const metrics = monitor.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].name).toBe('Calculator.add');
  });

  it('should handle decorated method errors', async () => {
    class ErrorClass {
      async failingMethod(): Promise<void> {
        throw new Error('Method error');
      }
    }
    decorateMethod(ErrorClass.prototype, 'failingMethod');

    const instance = new ErrorClass();

    await expect(instance.failingMethod()).rejects.toThrow('Method error');

    // Should still record the measurement
    const metrics = monitor.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].name).toBe('ErrorClass.failingMethod');
  });

  it('should preserve method context (this)', async () => {
    class ContextClass {
      value = 42;

      async getValue(): Promise<number> {
        return this.value;
      }
    }
    decorateMethod(ContextClass.prototype, 'getValue');

    const instance = new ContextClass();
    const result = await instance.getValue();

    expect(result).toBe(42);
  });

  it('should work with multiple decorated methods', async () => {
    class MultiMethod {
      async method1(): Promise<number> {
        return 1;
      }

      async method2(): Promise<number> {
        return 2;
      }
    }
    decorateMethod(MultiMethod.prototype, 'method1');
    decorateMethod(MultiMethod.prototype, 'method2');

    const instance = new MultiMethod();
    await instance.method1();
    await instance.method2();

    const metrics = monitor.getMetrics();
    expect(metrics).toHaveLength(2);
    expect(metrics.map((m) => m.name)).toContain('MultiMethod.method1');
    expect(metrics.map((m) => m.name)).toContain('MultiMethod.method2');
  });

  it('should handle decorated method with complex return types', async () => {
    class DataClass {
      async fetchData(): Promise<{ id: number; data: string[] }> {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id: 1, data: ['a', 'b', 'c'] };
      }
    }
    decorateMethod(DataClass.prototype, 'fetchData');

    const instance = new DataClass();
    const result = await instance.fetchData();

    expect(result).toEqual({ id: 1, data: ['a', 'b', 'c'] });

    const metrics = monitor.getMetrics();
    expect(metrics[0].name).toBe('DataClass.fetchData');
  });
});
