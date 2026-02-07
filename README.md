# Auth Service

Authentication & Authorization service using NestJS.

## Features

- User registration & login
- JWT token generation & validation
- Refresh token mechanism
- Password hashing (bcrypt)
- OAuth integration (Google, Facebook)

## API Endpoints

```
POST   /api/auth/register       - Register new user
POST   /api/auth/login          - Login user
POST   /api/auth/refresh        - Refresh access token
POST   /api/auth/logout         - Logout user
POST   /api/auth/verify-email   - Verify email
POST   /api/auth/reset-password - Reset password
```

## Development

```bash
# Install dependencies
npm install

# Run migrations
npm run db:migrate

# Start development server
npm run dev

# Run tests
npm test
```

## Environment Variables

See `.env.example` in root directory.
