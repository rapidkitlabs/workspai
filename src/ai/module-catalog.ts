import { exec } from 'child_process';
import { promisify } from 'util';
import { isMockMode } from './openai-client.js';

const execAsync = promisify(exec);

export interface ModuleMetadata {
  id: string;
  name: string;
  category:
    | 'auth'
    | 'database'
    | 'payment'
    | 'communication'
    | 'infrastructure'
    | 'security'
    | 'analytics';
  description: string;
  longDescription: string;
  keywords: string[];
  framework: 'fastapi' | 'nestjs' | 'both';
  dependencies: string[];
  useCases: string[];
}

interface PythonModuleShape {
  id?: string;
  module_id?: string;
  name?: string;
  display_name?: string;
  category?: string;
  description?: string;
  summary?: string;
  long_description?: string;
  keywords?: string[];
  tags?: string[];
  framework?: unknown;
  dependencies?: string[];
  use_cases?: string[];
  useCases?: string[];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toPythonModuleShape(value: unknown): PythonModuleShape {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as PythonModuleShape;
}

// Fallback hardcoded catalog (used if Python Core not available)
const FALLBACK_MODULE_CATALOG: ModuleMetadata[] = [
  // Authentication & Authorization
  {
    id: 'authentication-core',
    name: 'Authentication Core',
    category: 'auth',
    description:
      'Complete authentication system with password hashing, JWT tokens, OAuth 2.0, and secure session management',
    longDescription:
      'Production-ready authentication with bcrypt password hashing, JWT access/refresh tokens, OAuth 2.0 providers (Google, GitHub, etc), rate limiting, and security best practices.',
    keywords: [
      'auth',
      'login',
      'password',
      'jwt',
      'oauth',
      'token',
      'authentication',
      'security',
      'signin',
      'signup',
    ],
    framework: 'both',
    dependencies: [],
    useCases: [
      'User login and logout',
      'Password reset flow',
      'OAuth social login (Google, GitHub)',
      'JWT authentication',
      'Secure session management',
      'Token refresh',
      'Rate limiting',
    ],
  },
  {
    id: 'users-core',
    name: 'Users Core',
    category: 'auth',
    description:
      'User management system with profiles, roles, permissions, and user CRUD operations',
    longDescription:
      'Complete user management with user profiles, role-based access control (RBAC), permissions, user search, soft delete, and audit trails.',
    keywords: ['user', 'profile', 'role', 'permission', 'rbac', 'management', 'admin', 'accounts'],
    framework: 'both',
    dependencies: ['authentication-core'],
    useCases: [
      'User registration',
      'User profile management',
      'Role management (admin, user, etc)',
      'Permission system',
      'User administration dashboard',
      'Soft delete users',
    ],
  },
  {
    id: 'session-management',
    name: 'Session Management',
    category: 'auth',
    description:
      'Secure session handling with Redis storage, session rotation, and device tracking',
    longDescription:
      'Advanced session management with Redis-backed storage, automatic session rotation, device fingerprinting, IP tracking, and session revocation.',
    keywords: ['session', 'redis', 'cookie', 'storage', 'device', 'tracking'],
    framework: 'both',
    dependencies: ['authentication-core', 'redis-cache'],
    useCases: [
      'User session management',
      'Remember me functionality',
      'Device tracking',
      'Session security',
      'Logout from all devices',
      'Session expiration',
    ],
  },

  // Database
  {
    id: 'db-postgres',
    name: 'PostgreSQL',
    category: 'database',
    description:
      'PostgreSQL integration with async SQLAlchemy, migrations, connection pooling, and query optimization',
    longDescription:
      'Production-ready PostgreSQL with async SQLAlchemy 2.0, Alembic migrations, connection pooling, query optimization, JSON support, and full-text search.',
    keywords: [
      'postgres',
      'postgresql',
      'database',
      'sql',
      'sqlalchemy',
      'migration',
      'orm',
      'relational',
    ],
    framework: 'both',
    dependencies: [],
    useCases: [
      'Relational database',
      'Complex SQL queries',
      'Database transactions',
      'Data integrity',
      'Production-grade database',
      'ACID compliance',
    ],
  },
  {
    id: 'db-mongodb',
    name: 'MongoDB',
    category: 'database',
    description:
      'MongoDB integration with Motor async driver, schema validation, and aggregation pipelines',
    longDescription:
      'Async MongoDB with Motor driver, Pydantic schema validation, aggregation pipelines, indexes, and Atlas integration.',
    keywords: ['mongodb', 'mongo', 'nosql', 'document', 'database', 'motor'],
    framework: 'both',
    dependencies: [],
    useCases: [
      'Document storage',
      'Flexible schema',
      'Real-time data',
      'JSON documents',
      'Unstructured data',
      'Analytics',
    ],
  },

  // Payment
  {
    id: 'stripe-payment',
    name: 'Stripe Payment',
    category: 'payment',
    description:
      'Stripe integration with payment intents, subscriptions, webhooks, and customer portal',
    longDescription:
      'Complete Stripe integration with Payment Intents API, subscription management, automatic webhooks, customer portal, refunds, and SCA compliance.',
    keywords: [
      'stripe',
      'payment',
      'subscription',
      'billing',
      'checkout',
      'webhook',
      'credit card',
    ],
    framework: 'both',
    dependencies: [],
    useCases: [
      'Accept credit card payments',
      'Subscription billing',
      'One-time payments',
      'Checkout flow',
      'Payment webhooks',
      'Refunds and disputes',
    ],
  },

  // Communication
  {
    id: 'email',
    name: 'Email',
    category: 'communication',
    description:
      'Email sending with templates, SMTP/SendGrid/AWS SES support, and queue management',
    longDescription:
      'Production email system with Jinja2 templates, multiple providers (SMTP, SendGrid, AWS SES), queue management, retry logic, and bounce handling.',
    keywords: ['email', 'mail', 'smtp', 'sendgrid', 'ses', 'template', 'notification'],
    framework: 'both',
    dependencies: [],
    useCases: [
      'Welcome emails',
      'Password reset emails',
      'Notifications',
      'Marketing emails',
      'Transactional emails',
      'Email templates',
    ],
  },
  {
    id: 'sms',
    name: 'SMS',
    category: 'communication',
    description: 'SMS sending with Twilio, verification codes, and delivery tracking',
    longDescription:
      'SMS integration with Twilio, verification codes, two-factor authentication, delivery tracking, and international support.',
    keywords: ['sms', 'twilio', 'text', 'message', '2fa', 'verification', 'otp'],
    framework: 'both',
    dependencies: [],
    useCases: [
      '2FA verification codes',
      'SMS notifications',
      'Phone verification',
      'OTP generation',
      'SMS alerts',
    ],
  },

  // Infrastructure
  {
    id: 'redis-cache',
    name: 'Redis Cache',
    category: 'infrastructure',
    description: 'Redis caching with decorators, TTL management, and cache invalidation patterns',
    longDescription:
      'Redis integration with async client, caching decorators, TTL management, cache invalidation, pub/sub, and rate limiting.',
    keywords: ['redis', 'cache', 'memory', 'performance', 'speed', 'pubsub'],
    framework: 'both',
    dependencies: [],
    useCases: [
      'API response caching',
      'Session storage',
      'Rate limiting',
      'Real-time features',
      'Performance optimization',
      'Pub/sub messaging',
    ],
  },
  {
    id: 'celery',
    name: 'Celery',
    category: 'infrastructure',
    description: 'Background task processing with Celery, periodic tasks, and monitoring',
    longDescription:
      'Celery task queue with Redis/RabbitMQ backend, periodic tasks (cron), task monitoring, retry logic, and failure handling.',
    keywords: ['celery', 'task', 'background', 'queue', 'async', 'worker', 'job', 'cron'],
    framework: 'fastapi',
    dependencies: ['redis-cache'],
    useCases: [
      'Background email sending',
      'Data processing',
      'Report generation',
      'Scheduled tasks',
      'Long-running jobs',
    ],
  },
  {
    id: 'storage',
    name: 'Storage',
    category: 'infrastructure',
    description: 'File storage with S3, local filesystem, and image processing',
    longDescription:
      'Unified storage interface for AWS S3, local files, image resizing, format conversion, CDN integration, and presigned URLs.',
    keywords: ['storage', 's3', 'file', 'upload', 'image', 'cdn', 'aws'],
    framework: 'both',
    dependencies: [],
    useCases: [
      'File uploads',
      'Image storage',
      'Document management',
      'Profile pictures',
      'Media files',
      'CDN integration',
    ],
  },
];

// Cache for dynamic module catalog
let cachedModules: ModuleMetadata[] | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Convert Python CLI output to ModuleMetadata
 */
function parsePythonModule(pyModule: unknown): ModuleMetadata {
  const moduleShape = toPythonModuleShape(pyModule);

  // Use 'name' field directly (with underscores, not dashes)
  // Python Core returns: ai_assistant, api_keys, auth_core, etc.
  const id = moduleShape.name || moduleShape.id || moduleShape.module_id || '';

  return {
    id,
    name: moduleShape.display_name || moduleShape.name || '',
    category: mapPythonCategory(moduleShape.category || 'infrastructure'),
    description: moduleShape.description || moduleShape.summary || '',
    longDescription: moduleShape.long_description || moduleShape.description || '',
    keywords: asStringArray(moduleShape.keywords ?? moduleShape.tags),
    framework: mapPythonFramework(moduleShape.framework),
    dependencies: asStringArray(moduleShape.dependencies),
    useCases: asStringArray(moduleShape.use_cases ?? moduleShape.useCases),
  };
}

/**
 * Map Python category to TypeScript type
 */
function mapPythonCategory(category: string): ModuleMetadata['category'] {
  const categoryMap: Record<string, ModuleMetadata['category']> = {
    auth: 'auth',
    authentication: 'auth',
    database: 'database',
    payment: 'payment',
    billing: 'payment',
    communication: 'communication',
    infrastructure: 'infrastructure',
    security: 'security',
    analytics: 'analytics',
  };

  return categoryMap[category.toLowerCase()] || 'infrastructure';
}

/**
 * Map Python framework to TypeScript type
 */
function mapPythonFramework(framework: unknown): 'fastapi' | 'nestjs' | 'both' {
  if (!framework) return 'both';
  if (typeof framework === 'string') {
    if (framework.toLowerCase().includes('fastapi')) return 'fastapi';
    if (framework.toLowerCase().includes('nest')) return 'nestjs';
  }
  return 'both';
}

/**
 * Fetch modules from Python Core (rapidkit modules list --json-schema 1)
 */
async function fetchModulesFromPythonCore(): Promise<ModuleMetadata[]> {
  try {
    // Use the new JSON schema format (v1) introduced in newer Core versions
    const { stdout } = await execAsync('rapidkit modules list --json-schema 1', {
      timeout: 10000, // 10 seconds timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    // Python Core may output emojis/colors before JSON, extract only JSON part
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : stdout;

    const result = JSON.parse(jsonStr);

    // Handle different response formats
    let modules: unknown[] = [];
    if (Array.isArray(result)) {
      modules = result;
    } else if (result.modules && Array.isArray(result.modules)) {
      modules = result.modules;
    } else if (result.data && Array.isArray(result.data)) {
      modules = result.data;
    }

    return modules.map(parsePythonModule).filter((m) => m.id && m.name);
  } catch (error: unknown) {
    // Python Core not available or command failed
    const execError = error as { code?: string; killed?: boolean; message?: string };
    if (execError.code === 'ENOENT') {
      console.warn('⚠️  RapidKit Python Core not found in PATH');
    } else if (execError.killed) {
      console.warn('⚠️  Python Core command timed out');
    } else {
      console.warn('⚠️  Failed to fetch modules from Python Core:', execError.message);
    }
    console.warn('   Using fallback module catalog (11 modules)');
    return FALLBACK_MODULE_CATALOG;
  }
}

/**
 * Get module catalog (dynamic from Python or fallback)
 */
export async function getModuleCatalog(): Promise<ModuleMetadata[]> {
  const now = Date.now();

  if (isMockMode()) {
    cachedModules = FALLBACK_MODULE_CATALOG;
    lastFetchTime = now;
    return cachedModules;
  }

  // Return cached if still valid
  if (cachedModules && now - lastFetchTime < CACHE_TTL) {
    return cachedModules;
  }

  // Fetch from Python Core
  cachedModules = await fetchModulesFromPythonCore();
  lastFetchTime = now;

  // If fetch failed and returned empty, use fallback
  if (cachedModules.length === 0) {
    console.warn('⚠️  No modules found, using fallback catalog');
    cachedModules = FALLBACK_MODULE_CATALOG;
  }

  return cachedModules;
}

/**
 * Get module catalog synchronously (for backward compatibility)
 * Uses cached version or fallback
 */
export function getModuleCatalogSync(): ModuleMetadata[] {
  return cachedModules || FALLBACK_MODULE_CATALOG;
}

/**
 * Get module by ID
 */
export async function getModuleById(id: string): Promise<ModuleMetadata | undefined> {
  const catalog = await getModuleCatalog();
  return catalog.find((m) => m.id === id);
}

/**
 * Get modules by category
 */
export async function getModulesByCategory(category: string): Promise<ModuleMetadata[]> {
  const catalog = await getModuleCatalog();
  return catalog.filter((m) => m.category === category);
}

/**
 * Search modules by keyword
 */
export async function searchModules(query: string): Promise<ModuleMetadata[]> {
  if (!query || query.trim() === '') {
    return [];
  }

  const catalog = await getModuleCatalog();
  const lowerQuery = query.toLowerCase();
  return catalog.filter(
    (m) =>
      m.name.toLowerCase().includes(lowerQuery) ||
      m.description.toLowerCase().includes(lowerQuery) ||
      m.keywords.some((k) => k.includes(lowerQuery))
  );
}

/**
 * Get all module IDs
 */
export async function getAllModuleIds(): Promise<string[]> {
  const catalog = await getModuleCatalog();
  return catalog.map((m) => m.id);
}
