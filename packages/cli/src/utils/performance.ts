// src/utils/performance.ts
import { performance } from 'perf_hooks';
import { logger } from '../logger.js';

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private timers = new Map<string, number>();

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  start(name: string): void {
    this.timers.set(name, performance.now());
    logger.debug(`Performance timer started: ${name}`);
  }

  end(name: string): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      logger.warn(`Performance timer not found: ${name}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(name);

    this.metrics.push({
      name,
      duration,
      timestamp: Date.now(),
    });

    logger.debug(`Performance timer ended: ${name} (${duration.toFixed(2)}ms)`);
    return duration;
  }

  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  clear(): void {
    this.metrics = [];
    this.timers.clear();
  }

  summary(): void {
    if (this.metrics.length === 0) {
      return;
    }

    console.log('\n📊 Performance Summary:');
    const sorted = [...this.metrics].sort((a, b) => b.duration - a.duration);

    sorted.forEach((metric, index) => {
      if (index < 10) {
        // Show top 10
        console.log(`  ${metric.name}: ${metric.duration.toFixed(2)}ms`);
      }
    });

    const total = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    console.log(`  Total: ${total.toFixed(2)}ms\n`);
  }
}

/**
 * Decorator to measure async function performance
 */
export function measurePerformance(
  target: object,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: unknown[]) {
    const monitor = PerformanceMonitor.getInstance();
    const timerName = `${target.constructor.name}.${propertyKey}`;

    monitor.start(timerName);
    try {
      return await originalMethod.apply(this, args);
    } finally {
      monitor.end(timerName);
    }
  };

  return descriptor;
}

/**
 * Helper to measure a code block
 */
export async function measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const monitor = PerformanceMonitor.getInstance();
  monitor.start(name);
  try {
    return await fn();
  } finally {
    monitor.end(name);
  }
}
