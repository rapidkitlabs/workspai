# 🎯 AI Examples - Real-World Use Cases

Complete examples showing how to use RapidKit AI for different scenarios.

## 📱 Example 1: Building a Social Media App

### Requirements
- User authentication with social login
- User profiles with photos
- Real-time notifications
- Content moderation

### Using AI to Find Modules

```bash
# Step 1: Authentication
$ npx rapidkit ai recommend "social login with Google Facebook Twitter OAuth"

📦 Recommended Modules:

1. Authentication Core ⭐
   Complete authentication with OAuth 2.0, social providers
   Match: 96.8% - Matches: auth, oauth, social, login
   Category: auth

2. Users Core
   User management with profiles, roles, permissions
   Match: 91.2% - Matches: user, profile
   Category: auth
   Requires: authentication-core

3. Session Management
   Secure session handling with Redis storage
   Match: 85.4% - Matches: session, secure
   Category: auth
   Requires: authentication-core, redis-cache
```

```bash
# Step 2: File Storage for Photos
$ npx rapidkit ai recommend "image upload storage S3 with thumbnails"

📦 Recommended Modules:

1. Storage ⭐
   File storage with S3, local filesystem, image processing
   Match: 94.3% - Matches: storage, image, s3, upload
   Category: infrastructure

2. Redis Cache
   Redis caching for CDN URLs and metadata
   Match: 78.1% - Matches: cache
   Category: infrastructure
```

```bash
# Step 3: Real-time Notifications
$ npx rapidkit ai recommend "real-time push notifications websocket"

📦 Recommended Modules:

1. Notifications (if available)
   Real-time notifications with WebSocket, push, email, SMS
   Match: 95.7% - Matches: notification, realtime, websocket
   Category: communication

2. Redis Cache
   For pub/sub and message queuing
   Match: 82.3% - Matches: redis, pubsub
   Category: infrastructure
```

### Installation

```bash
# Install all recommended modules
npx rapidkit add module authentication-core users-core storage redis-cache
```

## 💳 Example 2: Building a SaaS Platform

### Requirements
- User authentication
- Subscription billing (monthly/yearly)
- Payment processing
- Invoice generation
- Usage tracking

### Using AI

```bash
# Step 1: Authentication & Users
$ npx rapidkit ai recommend "user authentication with email password reset"

📦 Recommended Modules:

1. Authentication Core ⭐
   Match: 97.2% - Matches: auth, email, password, user
   
2. Users Core
   Match: 92.8% - Matches: user
   Requires: authentication-core

3. Email
   Match: 89.5% - Matches: email, password-reset
```

```bash
# Step 2: Subscription & Payments
$ npx rapidkit ai recommend "subscription billing monthly yearly Stripe webhooks"

📦 Recommended Modules:

1. Stripe Payment ⭐
   Stripe integration with subscriptions, webhooks, customer portal
   Match: 98.1% - Matches: stripe, subscription, billing, webhook
   Category: payment

2. Email
   For invoice emails and payment receipts
   Match: 81.3% - Matches: email, receipt
   Category: communication
```

```bash
# Step 3: Background Jobs for Usage Tracking
$ npx rapidkit ai recommend "background jobs async tasks Celery"

📦 Recommended Modules:

1. Celery ⭐
   Celery integration for async tasks, scheduled jobs
   Match: 96.4% - Matches: celery, background, async, jobs
   Category: infrastructure
   Requires: redis-cache

2. Redis Cache
   Required for Celery broker and result backend
   Match: 88.7% - Matches: redis, cache
   Category: infrastructure
```

### Installation

```bash
npx rapidkit add module authentication-core users-core stripe-payment email celery redis-cache
```

## 🛒 Example 3: Building an E-commerce Platform

### Requirements
- Product catalog with search
- Shopping cart
- Payment processing
- Order management
- Email notifications
- Inventory tracking

### Using AI

```bash
# Step 1: Database with Search
$ npx rapidkit ai recommend "PostgreSQL database with full-text search"

📦 Recommended Modules:

1. PostgreSQL ⭐
   PostgreSQL with SQLAlchemy, migrations, full-text search
   Match: 95.3% - Matches: postgres, database, search
   Category: database

2. Redis Cache
   For caching product catalog and search results
   Match: 84.2% - Matches: cache
   Category: infrastructure
```

```bash
# Step 2: Payments & Orders
$ npx rapidkit ai recommend "payment checkout Stripe with order management"

📦 Recommended Modules:

1. Stripe Payment ⭐
   Payment intents, checkout sessions, webhooks
   Match: 97.8% - Matches: stripe, payment, checkout
   Category: payment

2. Email
   Order confirmations and shipping notifications
   Match: 86.5% - Matches: email, notification
   Category: communication
```

```bash
# Step 3: Background Jobs for Inventory
$ npx rapidkit ai recommend "background tasks for inventory sync cron"

📦 Recommended Modules:

1. Celery ⭐
   Scheduled tasks for inventory updates
   Match: 93.7% - Matches: celery, background, cron, scheduled
   Category: infrastructure
   Requires: redis-cache
```

### Installation

```bash
npx rapidkit add module db-postgres redis-cache stripe-payment email celery
```

## 🏥 Example 4: Building a Healthcare API

### Requirements
- Secure authentication (HIPAA compliant)
- Patient records database
- Audit logging
- Encrypted file storage
- SMS notifications for appointments

### Using AI

```bash
# Step 1: Secure Authentication
$ npx rapidkit ai recommend "secure authentication HIPAA compliant audit logging"

📦 Recommended Modules:

1. Authentication Core ⭐
   PBKDF2 hashing, secure sessions, audit logs
   Match: 96.2% - Matches: auth, secure, audit
   Category: auth

2. Session Management
   Secure session rotation, device tracking
   Match: 89.8% - Matches: session, secure, audit
   Category: auth
   Requires: authentication-core, redis-cache
```

```bash
# Step 2: Database with Encryption
$ npx rapidkit ai recommend "PostgreSQL with encryption for sensitive data"

📦 Recommended Modules:

1. PostgreSQL ⭐
   PostgreSQL with field-level encryption support
   Match: 94.7% - Matches: postgres, database, encryption
   Category: database

2. Storage
   Encrypted file storage for medical records
   Match: 87.3% - Matches: storage, encryption, file
   Category: infrastructure
```

```bash
# Step 3: SMS Notifications
$ npx rapidkit ai recommend "SMS notifications Twilio appointment reminders"

📦 Recommended Modules:

1. SMS ⭐
   Twilio SMS with templates and delivery tracking
   Match: 98.5% - Matches: sms, twilio, notification
   Category: communication

2. Celery
   Schedule appointment reminders
   Match: 85.4% - Matches: schedule, reminder
   Category: infrastructure
   Requires: redis-cache
```

### Installation

```bash
npx rapidkit add module authentication-core session-management db-postgres storage sms celery redis-cache
```

## 🎮 Example 5: Building a Gaming Backend

### Requirements
- User accounts with avatars
- Leaderboards
- In-app purchases
- Real-time multiplayer
- Push notifications

### Using AI

```bash
# Step 1: User System
$ npx rapidkit ai recommend "user accounts with profiles avatars achievements"

📦 Recommended Modules:

1. Users Core ⭐
   User profiles, custom fields, avatar URLs
   Match: 95.8% - Matches: user, profile, avatar
   Category: auth
   Requires: authentication-core

2. Authentication Core
   Required for user accounts
   Match: 88.2% - Matches: auth, user, account
   Category: auth
```

```bash
# Step 2: Leaderboards & Caching
$ npx rapidkit ai recommend "leaderboards rankings Redis sorted sets"

📦 Recommended Modules:

1. Redis Cache ⭐
   Redis sorted sets for leaderboards, caching
   Match: 97.3% - Matches: redis, leaderboard, ranking, cache
   Category: infrastructure

2. Database (PostgreSQL/MongoDB)
   Store persistent game data
   Match: 84.6% - Matches: database, persistent
   Category: database
```

```bash
# Step 3: In-App Purchases
$ npx rapidkit ai recommend "in-app purchases mobile payment Stripe"

📦 Recommended Modules:

1. Stripe Payment ⭐
   Mobile payments, subscriptions, purchases
   Match: 96.4% - Matches: stripe, payment, purchase, mobile
   Category: payment
```

### Installation

```bash
npx rapidkit add module authentication-core users-core redis-cache stripe-payment db-mongodb
```

## 💡 Tips for Better Results

### 1. Combine Multiple Searches

Instead of one vague query, break it down:

❌ Bad:
```bash
npx rapidkit ai recommend "social media app"
```

✅ Good:
```bash
npx rapidkit ai recommend "user authentication social login"
npx rapidkit ai recommend "image upload storage S3"
npx rapidkit ai recommend "real-time notifications"
```

### 2. Mention Specific Technologies

```bash
# Generic
npx rapidkit ai recommend "database"

# Specific (better results!)
npx rapidkit ai recommend "PostgreSQL database with async support"
```

### 3. Describe Your Exact Use Case

```bash
# Vague
npx rapidkit ai recommend "payments"

# Specific (much better!)
npx rapidkit ai recommend "subscription payments with monthly billing and invoices"
```

### 4. Use Natural Language

```bash
# Don't just list keywords
npx rapidkit ai recommend "auth jwt oauth redis"

# Describe what you're building
npx rapidkit ai recommend "I need authentication with JWT tokens and Redis sessions for my API"
```

## 🚀 Next Steps

After finding modules with AI:

```bash
# 1. Install modules
npx rapidkit add module <module-id-1> <module-id-2> ...

# 2. Configure modules
npx rapidkit modules configure <module-id>

# 3. Start development
npx rapidkit dev
```

## 📚 Learn More

- [AI Features Guide](AI_FEATURES.md) - Complete reference
- [AI Quick Start](AI_QUICKSTART.md) - Get started in 60 seconds
- [Technical Details](AI_DYNAMIC_INTEGRATION.md) - How it works

---

**Need help?** Open an issue: https://github.com/rapidkitlabs/rapidkit-npm/issues
