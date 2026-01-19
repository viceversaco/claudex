# Coolify Installation Guide for Claudex

This guide provides step-by-step instructions for deploying Claudex on any VPS using [Coolify](https://coolify.io/), a self-hosted PaaS alternative to Heroku, Netlify, and Vercel.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Connect GitHub Repository](#connect-github-repository)
3. [Create Project & Environment](#create-project--environment)
4. [Add PostgreSQL Database](#add-postgresql-database)
5. [Add Redis Database](#add-redis-database)
6. [Add API Application](#add-api-application)
7. [Add Celery Beat Application](#add-celery-beat-application)
8. [Add Celery Workers](#add-celery-workers)
9. [Add Frontend Application](#add-frontend-application)
10. [Deploy All Services](#deploy-all-services)
11. [Post-Deployment Configuration](#post-deployment-configuration)
12. [Troubleshooting](#troubleshooting)
13. [Environment Variables Reference](#environment-variables-reference)
14. [Optional Environment Variables](#optional-environment-variables)

---

## Prerequisites

Before starting, ensure you have:

### VPS Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 4GB | 8GB+ |
| CPU Cores | 2 | 4+ |
| Storage | 40GB | 80GB+ |
| OS | Ubuntu 22.04+ | Ubuntu 24.04 |

### Additional Requirements

- **Domain name** with DNS configured (A records pointing to your VPS IP)
  - Main domain: `yourdomain.com` (frontend)
  - API subdomain: `api.yourdomain.com` (backend)
- **Coolify installed** on your VPS ([Installation Guide](https://coolify.io/docs/installation))
- **GitHub account** with access to your Claudex repository fork

### DNS Configuration

Create the following DNS A records pointing to your VPS IP:

```
yourdomain.com      →  YOUR_VPS_IP
api.yourdomain.com  →  YOUR_VPS_IP
```

---

## Connect GitHub Repository

### Step 1: Navigate to Sources

1. Log into your Coolify dashboard
2. Click **Sources** in the left sidebar
3. Click the **+ Add** button

### Step 2: Create GitHub App Integration

1. Select **GitHub App** as the source type
2. Follow the prompts to create a new GitHub App
3. Install the GitHub App on your account/organization
4. Grant repository access to your Claudex fork

> **Note**: Using a GitHub App provides secure, token-based access with fine-grained permissions.

---

## Create Project & Environment

### Step 1: Create New Project

1. Click **Projects** in the left sidebar
2. Click **+ Add** to create a new project
3. Enter project name: `Claudex`
4. Click **Continue**

### Step 2: Create Production Environment

1. Inside the Claudex project, click **+ New Environment**
2. Enter environment name: `production`
3. Click **Continue**

This environment will contain all your Claudex services.

---

## Add PostgreSQL Database

### Step 1: Add Database Resource

1. Inside your production environment, click **+ Add New Resource**
2. Select **Database**
3. Choose **PostgreSQL**

### Step 2: Configure PostgreSQL

Configure the following settings:

| Setting | Value |
|---------|-------|
| Name | `postgres` |
| Image | `postgres:17-alpine` |
| Database | `postgres` |
| Username | `postgres` |
| Password | *(auto-generated or custom)* |

### Step 3: Add Custom Configuration

In the **Custom PostgreSQL Configuration** section, add:

```
max_connections=600
```

This increases the connection limit to support multiple Celery workers and API instances.

### Step 4: Deploy PostgreSQL

Click **Deploy** and wait for the database to start. Verify it shows a green health status.

> **Important**: Note down the internal connection details. You'll need them for the API configuration.

---

## Add Redis Database

### Step 1: Add Database Resource

1. Click **+ Add New Resource**
2. Select **Database**
3. Choose **Redis**

### Step 2: Configure Redis

| Setting | Value |
|---------|-------|
| Name | `redis` |
| Image | `redis:7-alpine` |

### Step 3: Deploy Redis

Click **Deploy** and wait for Redis to start with a green health status.

---

## Add API Application

The API is the core backend service handling authentication, chat processing, and sandbox management.

### Step 1: Add Application

1. Click **+ Add New Resource**
2. Select **Application**
3. Choose your GitHub source
4. Select your Claudex repository
5. Select the branch (usually `main`)

### Step 2: Configure General Settings

Navigate to the **General** tab and configure:

| Setting | Value |
|---------|-------|
| Name | `api` |
| Build Pack | `Dockerfile` |
| Base Directory | `/backend` |
| Dockerfile Location | `Dockerfile` |
| Exposed Port | `8080` |

### Step 3: Configure Domain

1. Navigate to the **Domains** section
2. Add your API domain: `api.yourdomain.com`
3. Enable **HTTPS** (Coolify will auto-provision SSL via Let's Encrypt)

### Step 4: Configure Docker Options (Required for Sandbox)

In **Advanced** → **Custom Docker Options**, add:

```
--privileged
-v /var/run/docker.sock:/var/run/docker.sock
```

> **Warning**: The `--privileged` flag and Docker socket mount are required for the sandbox feature to create isolated containers. Only use this on trusted deployments.

### Step 5: Configure Environment Variables

Navigate to the **Environment Variables** tab and add the following:

```env
SERVICE_MODE=api
ENVIRONMENT=production
SECRET_KEY=your-secure-secret-key-minimum-32-characters
DATABASE_URL=postgresql+asyncpg://postgres:YOUR_POSTGRES_PASSWORD@postgres:5432/postgres
REDIS_URL=redis://redis:6379/0
BASE_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com
SANDBOX_PROVIDER=docker
DOCKER_TRAEFIK_NETWORK=YOUR_COOLIFY_NETWORK
DOCKER_SANDBOX_DOMAIN=yourdomain.com
DOCKER_PERMISSION_API_URL=http://api:8080
REQUIRE_EMAIL_VERIFICATION=false
TRUSTED_PROXY_HOSTS=*
```

#### Environment Variables Explained

| Variable | Description |
|----------|-------------|
| `SERVICE_MODE` | Determines which service to run (`api`, `celery-beat`, `celery-worker`) |
| `ENVIRONMENT` | Set to `production` for production deployments |
| `SECRET_KEY` | Secure random string (32+ chars) for JWT signing |
| `DATABASE_URL` | PostgreSQL connection string with asyncpg driver |
| `REDIS_URL` | Redis connection string for caching and Celery broker |
| `BASE_URL` | Public URL of the API service |
| `FRONTEND_URL` | Public URL of the frontend |
| `ALLOWED_ORIGINS` | CORS allowed origins (frontend URL) |
| `SANDBOX_PROVIDER` | Set to `docker` to enable Docker-based sandbox execution |
| `DOCKER_TRAEFIK_NETWORK` | Coolify's Docker network name (find in Docker networks) |
| `DOCKER_SANDBOX_DOMAIN` | Base domain for sandbox containers |
| `DOCKER_PERMISSION_API_URL` | Internal API URL for sandbox permission checks |
| `REQUIRE_EMAIL_VERIFICATION` | Set to `false` to skip email verification |
| `TRUSTED_PROXY_HOSTS` | Trust proxy headers (set to `*` behind Coolify's Traefik) |

### Finding Your Coolify Network Name

Run this command on your VPS to find the network name:

```bash
docker network ls | grep coolify
```

The network name is typically something like `coolify` or a UUID-based name.

### Step 6: Deploy API

Click **Deploy** but wait to start it until all services are configured.

---

## Add Celery Beat Application

Celery Beat handles scheduled tasks like cleanup jobs and periodic processing.

### Step 1: Clone API Configuration

The easiest way is to duplicate the API application:

1. Go to the API application settings
2. Click **Clone** (or manually create a new application with the same settings)

### Step 2: Modify Configuration

Update the following settings:

| Setting | Value |
|---------|-------|
| Name | `celery-beat` |

### Step 3: Update Environment Variables

Change the `SERVICE_MODE` variable:

```env
SERVICE_MODE=celery-beat
```

### Step 4: Remove Domain

Celery Beat doesn't need a public domain. Remove any domain configuration.

### Step 5: Deploy

Click **Deploy** (will start after API is running).

---

## Add Celery Workers

Celery Workers process background tasks like AI chat requests. You can run multiple workers for better throughput.

### Step 1: Create First Worker

Clone the API configuration as before:

1. Duplicate the API application
2. Update settings:

| Setting | Value |
|---------|-------|
| Name | `celery-worker-1` |

### Step 2: Update Environment Variables

```env
SERVICE_MODE=celery-worker
```

### Step 3: Remove Domain

Celery Workers don't need public domains.

### Step 4: Scale Horizontally (Optional)

For better performance, create additional workers:

- `celery-worker-2`
- `celery-worker-3`
- etc.

Each worker can handle concurrent tasks. The recommended number of workers depends on your VPS resources:

| VPS RAM | Recommended Workers |
|---------|---------------------|
| 4GB | 1-2 |
| 8GB | 2-4 |
| 16GB+ | 4-8 |

---

## Add Frontend Application

### Step 1: Add Application

1. Click **+ Add New Resource**
2. Select **Application**
3. Choose your GitHub source
4. Select the Claudex repository
5. Select the branch (usually `main`)

### Step 2: Configure General Settings

| Setting | Value |
|---------|-------|
| Name | `frontend` |
| Build Pack | `Nixpacks` |
| Base Directory | `/frontend` |
| Publish Directory | `/dist` |

### Step 3: Configure Static Site Settings

Enable the following options:

- [x] **Is Static Site** - Yes
- [x] **Is SPA** - Yes (enables client-side routing)

### Step 4: Configure Domain

1. Add your main domain: `yourdomain.com`
2. Enable **HTTPS**

### Step 5: Configure Environment Variables

```env
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
VITE_WS_URL=wss://api.yourdomain.com/api/v1/ws
```

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API base URL (HTTPS, includes /api/v1 path) |
| `VITE_WS_URL` | WebSocket URL for real-time features |

### Step 6: Deploy

Click **Deploy** (will start after API is running).

---

## Deploy All Services

### Step 1: Review Resources

Your production environment should now have the following resources:

| Service | Type | Domain |
|---------|------|--------|
| postgres | Database | (internal) |
| redis | Database | (internal) |
| api | Application | api.yourdomain.com |
| celery-beat | Application | (none) |
| celery-worker-1 | Application | (none) |
| frontend | Application | yourdomain.com |

### Step 2: Deploy in Order

Deploy services in this order to ensure dependencies are ready:

1. **PostgreSQL** - Wait for green status
2. **Redis** - Wait for green status
3. **API** - Wait for green status and health check
4. **Celery Beat** - Wait for green status
5. **Celery Workers** - Wait for green status
6. **Frontend** - Wait for green status

### Step 3: Verify Health Status

All services should show green health indicators:

### Step 4: Check API Health

Visit `https://api.yourdomain.com/api/v1/health` to verify the API is running:

```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected"
}
```

---

## Post-Deployment Configuration

### Step 1: Access the Frontend

Navigate to `https://yourdomain.com` in your browser.

### Step 2: Create Admin Account

1. Click **Sign Up**
2. Enter your email and password
3. Complete registration

> **Note**: The first registered user automatically becomes an admin.

### Step 3: Configure AI Providers

1. Go to **Settings** → **Providers**
2. Add your preferred AI providers:

#### Claude Max (Recommended)
- Provider: Claude Max
- Session Key: Your Claude session key
- Enable desired models

#### OpenRouter
- Provider: OpenRouter
- API Key: Your OpenRouter API key
- Enable desired models

#### Direct Anthropic API
- Provider: Anthropic
- API Key: Your Anthropic API key
- Enable Claude models

### Step 4: Test Functionality

1. Create a new chat
2. Send a test message
3. Verify AI responses work correctly

### Step 5: Test Sandbox (Optional)

If you enabled sandbox functionality:

1. Create a chat with sandbox mode enabled
2. Ask the AI to run a simple Python script
3. Verify code execution works in isolated container

---

## Troubleshooting

### Database Connection Issues

**Symptom**: API fails to start with database connection errors

**Solutions**:
1. Verify PostgreSQL is running (green status)
2. Check `DATABASE_URL` format is correct
3. Ensure password doesn't contain special characters that need URL encoding
4. Verify the postgres container name matches your configuration

```bash
# Test connection from VPS
docker exec -it <postgres-container-id> psql -U postgres
```

### Docker Socket Permission Errors (Linux VPS)

**Symptom**: Sandbox features fail with permission denied errors

**Solutions**:
1. Ensure API container has `--privileged` flag
2. Verify Docker socket is mounted: `-v /var/run/docker.sock:/var/run/docker.sock`
3. Check Docker socket permissions on host:

```bash
ls -la /var/run/docker.sock
# Should show: srw-rw---- 1 root docker
```

### CORS Errors

**Symptom**: Frontend can't connect to API, browser console shows CORS errors

**Solutions**:
1. Verify `ALLOWED_ORIGINS` includes your frontend URL (with https://)
2. Check `FRONTEND_URL` is set correctly
3. Ensure no trailing slashes in URLs
4. Clear browser cache and try again

### WebSocket Connection Failed

**Symptom**: Real-time features don't work, WebSocket errors in console

**Solutions**:
1. Verify `VITE_WS_URL` uses `wss://` (not `ws://`) for HTTPS
2. Check Coolify's Traefik is configured for WebSocket support
3. Verify the API is running and healthy

### SSL Certificate Issues

**Symptom**: HTTPS not working, certificate errors

**Solutions**:
1. Verify DNS records are correctly pointing to your VPS
2. Wait for Coolify to provision Let's Encrypt certificates (can take a few minutes)
3. Check Coolify logs for certificate provisioning errors

### Celery Workers Not Processing Tasks

**Symptom**: Messages sent but no AI responses

**Solutions**:
1. Check Celery worker logs for errors
2. Verify Redis is running and accessible
3. Ensure `REDIS_URL` is correct in worker environment variables
4. Check if workers are connected to the correct queue

### Out of Memory Errors

**Symptom**: Services randomly restart, OOM killer messages in logs

**Solutions**:
1. Reduce number of Celery workers
2. Add swap space to your VPS:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

3. Upgrade VPS to more RAM

### Frontend Shows Blank Page

**Symptom**: Frontend loads but shows nothing

**Solutions**:
1. Check browser console for JavaScript errors
2. Verify environment variables are set during build time
3. Rebuild frontend after changing environment variables
4. Check that "Is SPA" option is enabled for client-side routing

### API Health Check Fails

**Symptom**: API shows unhealthy status in Coolify

**Solutions**:
1. Check API container logs for startup errors
2. Verify all required environment variables are set
3. Ensure database migrations have run (check logs for migration messages)
4. Test database connection manually

---

## Environment Variables Reference

### Complete API Environment Variables

```env
# Service Configuration
SERVICE_MODE=api
ENVIRONMENT=production

# Security
SECRET_KEY=your-secure-secret-key-minimum-32-characters

# Database
DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@postgres:5432/postgres

# Redis
REDIS_URL=redis://redis:6379/0

# URLs
BASE_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com

# Docker/Sandbox
SANDBOX_PROVIDER=docker
DOCKER_TRAEFIK_NETWORK=coolify-network-name
DOCKER_SANDBOX_DOMAIN=yourdomain.com
DOCKER_PERMISSION_API_URL=http://api:8080

# Authentication
REQUIRE_EMAIL_VERIFICATION=false
TRUSTED_PROXY_HOSTS=*
```

### Complete Frontend Environment Variables

```env
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
VITE_WS_URL=wss://api.yourdomain.com/api/v1/ws
```

### Celery Beat Environment Variables

Same as API but with:
```env
SERVICE_MODE=celery-beat
```

### Celery Worker Environment Variables

Same as API but with:
```env
SERVICE_MODE=celery-worker
```

---

## Optional Environment Variables

The following environment variables are optional and have sensible defaults. Configure them only if you need to customize specific behavior.

### Email Configuration (SMTP)

Configure email sending for features like email verification and notifications. By default, email is disabled (no `MAIL_PASSWORD`).

```env
MAIL_SERVER=smtp.sendgrid.net
MAIL_PORT=587
MAIL_USERNAME=apikey
MAIL_PASSWORD=your-sendgrid-api-key
MAIL_FROM=noreply@yourdomain.com
MAIL_FROM_NAME=Claudex
MAIL_STARTTLS=true
MAIL_SSL_TLS=false
BLOCK_DISPOSABLE_EMAILS=true
```

| Variable | Default | Description |
|----------|---------|-------------|
| `MAIL_SERVER` | `smtp.sendgrid.net` | SMTP server hostname |
| `MAIL_PORT` | `587` | SMTP server port |
| `MAIL_USERNAME` | `apikey` | SMTP username (use `apikey` for SendGrid) |
| `MAIL_PASSWORD` | *(none)* | SMTP password or API key |
| `MAIL_FROM` | `noreply@claudex.pro` | Sender email address |
| `MAIL_FROM_NAME` | `Claudex` | Sender display name |
| `MAIL_STARTTLS` | `true` | Enable STARTTLS encryption |
| `MAIL_SSL_TLS` | `false` | Enable SSL/TLS (use either this or STARTTLS) |
| `BLOCK_DISPOSABLE_EMAILS` | `true` | Block registrations from disposable email domains |

### Logging Configuration

```env
LOG_LEVEL=INFO
```

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`) |

### Docker/Sandbox Advanced Configuration

Fine-tune Docker sandbox behavior. Most deployments can use the defaults.

```env
DOCKER_IMAGE=ghcr.io/mng-dev-ai/claudex-sandbox:latest
DOCKER_NETWORK=claudex-sandbox-net
DOCKER_HOST=
DOCKER_PREVIEW_BASE_URL=http://localhost
DOCKER_TRAEFIK_ENTRYPOINT=https
```

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_IMAGE` | `ghcr.io/mng-dev-ai/claudex-sandbox:latest` | Docker image for sandbox containers |
| `DOCKER_NETWORK` | `claudex-sandbox-net` | Docker network for sandbox isolation |
| `DOCKER_HOST` | *(none)* | Custom Docker daemon socket/host |
| `DOCKER_PREVIEW_BASE_URL` | `http://localhost` | Base URL for sandbox preview links |
| `DOCKER_TRAEFIK_ENTRYPOINT` | `https` | Traefik entrypoint for sandbox routing |
| `SANDBOX_PROVIDER` | `docker` | Sandbox provider (`docker` or `e2b`) |

> **Note**: `DOCKER_TRAEFIK_NETWORK`, `DOCKER_SANDBOX_DOMAIN`, and `DOCKER_PERMISSION_API_URL` are documented in the main configuration section above as they're typically required for Coolify deployments.

### E2B Sandbox Configuration (Alternative)

If using E2B instead of Docker for sandboxes:

```env
SANDBOX_PROVIDER=e2b
E2B_TEMPLATE_ID=61kjt118n5mlnh5c00j9
```

| Variable | Default | Description |
|----------|---------|-------------|
| `E2B_TEMPLATE_ID` | `61kjt118n5mlnh5c00j9` | E2B template ID for sandbox containers |

### Storage & Upload Configuration

```env
STORAGE_PATH=/app/storage
MAX_UPLOAD_SIZE=5242880
```

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_PATH` | `/app/storage` | Path for file storage |
| `MAX_UPLOAD_SIZE` | `5242880` | Maximum upload file size in bytes (default: 5MB) |

### JWT/Token Settings

Configure authentication token behavior.

```env
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30
```

| Variable | Default | Description |
|----------|---------|-------------|
| `ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Access token expiration time in minutes |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Refresh token expiration time in days |

### Security Headers Configuration

Control HTTP security headers. Enabled by default for production.

```env
ENABLE_SECURITY_HEADERS=true
HSTS_MAX_AGE=31536000
HSTS_INCLUDE_SUBDOMAINS=true
HSTS_PRELOAD=false
FRAME_OPTIONS=DENY
CONTENT_TYPE_OPTIONS=nosniff
XSS_PROTECTION=1; mode=block
REFERRER_POLICY=strict-origin-when-cross-origin
PERMISSIONS_POLICY=geolocation=(), microphone=(), camera=()
```

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_SECURITY_HEADERS` | `true` | Enable/disable all security headers |
| `HSTS_MAX_AGE` | `31536000` | HSTS max-age in seconds (1 year) |
| `HSTS_INCLUDE_SUBDOMAINS` | `true` | Include subdomains in HSTS |
| `HSTS_PRELOAD` | `false` | Enable HSTS preload |
| `FRAME_OPTIONS` | `DENY` | X-Frame-Options value |
| `CONTENT_TYPE_OPTIONS` | `nosniff` | X-Content-Type-Options value |
| `XSS_PROTECTION` | `1; mode=block` | X-XSS-Protection value |
| `REFERRER_POLICY` | `strict-origin-when-cross-origin` | Referrer-Policy value |
| `PERMISSIONS_POLICY` | `geolocation=(), microphone=(), camera=()` | Permissions-Policy value |

### Cache & TTL Settings (Advanced)

Fine-tune caching and task expiration. These are advanced settings that most deployments won't need to change.

```env
CONTEXT_WINDOW_TOKENS=200000
TASK_TTL_SECONDS=3600
PERMISSION_REQUEST_TTL_SECONDS=300
CELERY_RESULT_EXPIRES_SECONDS=3600
USER_SETTINGS_CACHE_TTL_SECONDS=300
MODELS_CACHE_TTL_SECONDS=3600
CONTEXT_USAGE_CACHE_TTL_SECONDS=600
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTEXT_WINDOW_TOKENS` | `200000` | Maximum context window size in tokens |
| `TASK_TTL_SECONDS` | `3600` | Background task TTL (1 hour) |
| `PERMISSION_REQUEST_TTL_SECONDS` | `300` | Permission request expiration (5 minutes) |
| `CELERY_RESULT_EXPIRES_SECONDS` | `3600` | Celery task result expiration (1 hour) |
| `CHAT_SCOPED_TOKEN_EXPIRE_MINUTES` | `10` | Chat-scoped token expiration (10 minutes) |
| `CHAT_REVOKED_KEY_TTL_SECONDS` | `3600` | Revoked chat key TTL (1 hour) |
| `USER_SETTINGS_CACHE_TTL_SECONDS` | `300` | User settings cache TTL (5 minutes) |
| `MODELS_CACHE_TTL_SECONDS` | `3600` | AI models cache TTL (1 hour) |
| `CONTEXT_USAGE_CACHE_TTL_SECONDS` | `600` | Context usage cache TTL (10 minutes) |
| `DISPOSABLE_DOMAINS_CACHE_TTL_SECONDS` | `3600` | Disposable domains list cache TTL (1 hour) |

---

## Next Steps

After successfully deploying Claudex:

1. **Set up backups** - Configure PostgreSQL backups in Coolify
2. **Monitor resources** - Use Coolify's built-in monitoring
3. **Configure email** - Set up SMTP for email verification (optional)
4. **Custom domain** - Add additional custom domains if needed
5. **Scale workers** - Add more Celery workers as usage grows

---

## Support

If you encounter issues not covered in this guide:

1. Check the [GitHub Issues](https://github.com/yourusername/claudex/issues)
2. Review Coolify logs for specific error messages
3. Join the community discussions for help
