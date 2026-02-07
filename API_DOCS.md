# Auth Service

Authentication Service sử dụng NestJS với JWT để xác thực người dùng qua số điện thoại và mật khẩu.

## 🔧 Tech Stack

- **NestJS** - Progressive Node.js framework
- **TypeORM** - ORM cho PostgreSQL
- **JWT** - JSON Web Token authentication
- **bcrypt** - Password hashing
- **class-validator** - DTO validation
- **PostgreSQL** - Database

## 📡 API Endpoints

### Public Endpoints

#### 1. Health Check

```http
GET /api/auth/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-02-05T10:00:00.000Z"
}
```

#### 2. Register (Đăng ký)

```http
POST /api/auth/register
Content-Type: application/json

{
  "phoneNumber": "0912345678",
  "password": "password123",
  "fullName": "Nguyễn Văn A"
}
```

Response:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid-here",
    "phoneNumber": "0912345678",
    "fullName": "Nguyễn Văn A"
  }
}
```

#### 3. Login (Đăng nhập)

```http
POST /api/auth/login
Content-Type: application/json

{
  "phoneNumber": "0912345678",
  "password": "password123"
}
```

Response: Same as Register

#### 4. Refresh Token

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

Response: Same as Register

### Protected Endpoints

#### 5. Get Profile

```http
POST /api/auth/profile
Authorization: Bearer {accessToken}
```

Response:

```json
{
  "id": "uuid-here",
  "phoneNumber": "0912345678",
  "fullName": "Nguyễn Văn A",
  "avatar": null,
  "isActive": true,
  "createdAt": "2026-02-05T10:00:00.000Z",
  "updatedAt": "2026-02-05T10:00:00.000Z"
}
```

## 🚀 Setup & Run

### Local Development

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file:

```bash
cp .env.example .env
```

3. Update `.env` with your configuration

4. Run development server:

```bash
npm run start:dev
```

Server chạy tại: http://localhost:3010

### Docker

```bash
# Build
docker build -t auth-service .

# Run
docker run -p 3010:3010 --env-file .env auth-service
```

### With Docker Compose

```bash
cd ../../
docker-compose up -d auth-service
```

## 📋 Environment Variables

| Variable                 | Description              | Default       |
| ------------------------ | ------------------------ | ------------- |
| `PORT`                   | Server port              | `3010`        |
| `DB_HOST`                | PostgreSQL host          | `localhost`   |
| `DB_PORT`                | PostgreSQL port          | `5432`        |
| `DB_USERNAME`            | Database username        | `chatapp`     |
| `DB_PASSWORD`            | Database password        | -             |
| `DB_NAME`                | Database name            | `chatapp`     |
| `JWT_SECRET`             | JWT access token secret  | -             |
| `JWT_REFRESH_SECRET`     | JWT refresh token secret | -             |
| `JWT_ACCESS_EXPIRATION`  | Access token expiration  | `15m`         |
| `JWT_REFRESH_EXPIRATION` | Refresh token expiration | `7d`          |
| `NODE_ENV`               | Environment              | `development` |

## 🔐 Security Features

- ✅ Password hashing với bcrypt (cost factor: 10)
- ✅ JWT với access token (15 phút) và refresh token (7 ngày)
- ✅ Phone number validation (10-11 chữ số)
- ✅ Password minimum length (6 ký tự)
- ✅ User active status check
- ✅ Protected routes với JWT Guard

## 📚 Database Schema

### User Entity

```typescript
{
  id: string (UUID, Primary Key)
  phoneNumber: string (Unique, Length: 15)
  passwordHash: string
  fullName: string (Nullable)
  avatar: string (Nullable)
  isActive: boolean (Default: true)
  createdAt: Date
  updatedAt: Date
}
```

## 🔄 Token Flow

1. User đăng ký/đăng nhập → Nhận Access Token + Refresh Token
2. Sử dụng Access Token cho các API calls (valid 15 phút)
3. Khi Access Token hết hạn → Dùng Refresh Token để lấy token mới
4. Refresh Token hết hạn (7 ngày) → Đăng nhập lại

## 🧪 Testing APIs

### Using cURL

```bash
# Register
curl -X POST http://localhost:3010/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"0912345678","password":"password123","fullName":"Test User"}'

# Login
curl -X POST http://localhost:3010/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"0912345678","password":"password123"}'

# Get Profile
curl -X POST http://localhost:3010/api/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 📝 Notes

- Số điện thoại phải là 10-11 chữ số
- Mật khẩu tối thiểu 6 ký tự
- Access token hết hạn sau 15 phút
- Refresh token hết hạn sau 7 ngày
- Tự động tạo bảng `users` khi chạy (synchronize: true trong development)
