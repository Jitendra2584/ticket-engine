import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext, HttpArgumentsHost } from '@nestjs/common/interfaces';
import { ApiKeyGuard } from './api-key.guard';

function createMockExecutionContext(headers: Record<string, string | undefined>): ExecutionContext {
  const mockRequest = { headers };
  const mockHttpArgumentsHost: HttpArgumentsHost = {
    getRequest: <T>(): T => mockRequest as T,
    getResponse: <T>(): T => ({}) as T,
    getNext: <T>(): T => (() => {}) as T,
  };

  return {
    switchToHttp: () => mockHttpArgumentsHost,
  } as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  const VALID_API_KEY = 'test-secret-key';

  beforeEach(() => {
    guard = new ApiKeyGuard();
    vi.stubEnv('API_KEY', VALID_API_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should allow the request when the correct API key is provided', () => {
    const context = createMockExecutionContext({ 'x-api-key': VALID_API_KEY });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when the x-api-key header is missing', () => {
    const context = createMockExecutionContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Invalid or missing API key');
  });

  it('should throw UnauthorizedException when the API key is invalid', () => {
    const context = createMockExecutionContext({ 'x-api-key': 'wrong-key' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Invalid or missing API key');
  });

  it('should throw UnauthorizedException when the x-api-key header is an empty string', () => {
    const context = createMockExecutionContext({ 'x-api-key': '' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Invalid or missing API key');
  });

  it('should read the expected API key from the API_KEY environment variable', () => {
    vi.stubEnv('API_KEY', 'different-secret');
    const context = createMockExecutionContext({ 'x-api-key': 'different-secret' });
    expect(guard.canActivate(context)).toBe(true);
  });
});
