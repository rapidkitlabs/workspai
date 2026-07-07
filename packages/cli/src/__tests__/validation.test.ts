import { describe, it, expect } from 'vitest';
import { validateProjectName, toSnakeCase, toKebabCase } from '../validation.js';
import { InvalidProjectNameError } from '../errors.js';

describe('validateProjectName', () => {
  it('should accept valid project names', () => {
    expect(validateProjectName('my-api')).toBe(true);
    expect(validateProjectName('my_api')).toBe(true);
    expect(validateProjectName('myapi')).toBe(true);
    expect(validateProjectName('my-awesome-api')).toBe(true);
    expect(validateProjectName('api2024')).toBe(true);
  });

  it('should reject names starting with uppercase', () => {
    expect(() => validateProjectName('My-Api')).toThrow(InvalidProjectNameError);
    expect(() => validateProjectName('API')).toThrow(InvalidProjectNameError);
  });

  it('should reject names starting with numbers', () => {
    expect(() => validateProjectName('123api')).toThrow(InvalidProjectNameError);
  });

  it('should reject names with invalid characters', () => {
    expect(() => validateProjectName('my@api')).toThrow(InvalidProjectNameError);
    expect(() => validateProjectName('my api')).toThrow(InvalidProjectNameError);
    expect(() => validateProjectName('my.api')).toThrow(InvalidProjectNameError);
  });

  it('should reject reserved names', () => {
    expect(() => validateProjectName('test')).toThrow(InvalidProjectNameError);
    expect(() => validateProjectName('python')).toThrow(InvalidProjectNameError);
    expect(() => validateProjectName('rapidkit')).toThrow(InvalidProjectNameError);
  });

  it('should reject names that are too short', () => {
    expect(() => validateProjectName('a')).toThrow(InvalidProjectNameError);
  });

  it('should reject names that are too long', () => {
    const longName = 'a'.repeat(215);
    expect(() => validateProjectName(longName)).toThrow(InvalidProjectNameError);
  });

  it('should accept names with mixed dashes and underscores', () => {
    expect(validateProjectName('my-api_service')).toBe(true);
    expect(validateProjectName('data_api-v2')).toBe(true);
  });

  it('should accept names with numbers in middle', () => {
    expect(validateProjectName('api2024service')).toBe(true);
    expect(validateProjectName('my-v2-api')).toBe(true);
  });

  it('should reject more reserved names', () => {
    expect(() => validateProjectName('src')).toThrow(InvalidProjectNameError);
    expect(() => validateProjectName('npm')).toThrow(InvalidProjectNameError);
    expect(() => validateProjectName('node')).toThrow(InvalidProjectNameError);
  });

  it('should accept minimum valid length', () => {
    expect(validateProjectName('ab')).toBe(true);
    expect(validateProjectName('my')).toBe(true);
  });

  it('should accept maximum valid length', () => {
    const maxValid = 'a'.repeat(214);
    expect(validateProjectName(maxValid)).toBe(true);
  });

  it('should reject special characters', () => {
    expect(() => validateProjectName('my!api')).toThrow(InvalidProjectNameError);
    expect(() => validateProjectName('my#api')).toThrow(InvalidProjectNameError);
    expect(() => validateProjectName('my$api')).toThrow(InvalidProjectNameError);
    expect(() => validateProjectName('my%api')).toThrow(InvalidProjectNameError);
  });

  it('should provide detailed error messages', () => {
    try {
      validateProjectName('My-Api');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidProjectNameError);
      expect((error as InvalidProjectNameError).message).toContain('Invalid project name');
    }
  });

  it('should handle npm package validation errors with explicit true return', () => {
    // Ensure the return true at the end is covered
    const result1 = validateProjectName('my-app');
    expect(result1).toBe(true);
    const result2 = validateProjectName('app123');
    expect(result2).toBe(true);
  });

  it('should reject names with dots (npm validation)', () => {
    expect(() => validateProjectName('my.app')).toThrow(InvalidProjectNameError);
  });

  it('should reject names with slashes (npm validation)', () => {
    expect(() => validateProjectName('my/app')).toThrow(InvalidProjectNameError);
  });
});

describe('toSnakeCase', () => {
  it('should convert kebab-case to snake_case', () => {
    expect(toSnakeCase('my-api')).toBe('my_api');
    expect(toSnakeCase('my-awesome-api')).toBe('my_awesome_api');
  });

  it('should leave snake_case unchanged', () => {
    expect(toSnakeCase('my_api')).toBe('my_api');
  });

  it('should handle mixed cases', () => {
    expect(toSnakeCase('my-api_test')).toBe('my_api_test');
  });

  it('should handle single word', () => {
    expect(toSnakeCase('api')).toBe('api');
  });

  it('should handle multiple consecutive dashes', () => {
    expect(toSnakeCase('my--api')).toBe('my__api');
  });

  it('should handle strings with numbers', () => {
    expect(toSnakeCase('api-v2-test')).toBe('api_v2_test');
  });

  it('should handle empty string', () => {
    expect(toSnakeCase('')).toBe('');
  });

  it('should handle complex patterns', () => {
    expect(toSnakeCase('my-complex-api-service-v2')).toBe('my_complex_api_service_v2');
  });
});

describe('toKebabCase', () => {
  it('should convert snake_case to kebab-case', () => {
    expect(toKebabCase('my_api')).toBe('my-api');
    expect(toKebabCase('my_awesome_api')).toBe('my-awesome-api');
  });

  it('should leave kebab-case unchanged', () => {
    expect(toKebabCase('my-api')).toBe('my-api');
  });

  it('should handle mixed cases', () => {
    expect(toKebabCase('my_api-test')).toBe('my-api-test');
  });

  it('should handle single word', () => {
    expect(toKebabCase('api')).toBe('api');
  });

  it('should handle multiple consecutive underscores', () => {
    expect(toKebabCase('my__api')).toBe('my--api');
  });

  it('should handle strings with numbers', () => {
    expect(toKebabCase('api_v2_test')).toBe('api-v2-test');
  });

  it('should handle empty string', () => {
    expect(toKebabCase('')).toBe('');
  });

  it('should handle complex patterns', () => {
    expect(toKebabCase('my_complex_api_service_v2')).toBe('my-complex-api-service-v2');
  });

  it('should be reversible with toSnakeCase', () => {
    const original = 'my_test_api';
    const kebab = toKebabCase(original);
    const backToSnake = toSnakeCase(kebab);
    expect(backToSnake).toBe(original);
  });
});
