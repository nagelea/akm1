# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI API Key Monitor - a Next.js-based security monitoring system that automatically scans GitHub repositories for exposed AI API keys from major providers (OpenAI, Anthropic, Google AI, etc.). It provides both public monitoring dashboards and admin management interfaces.

## Development Commands

```bash
# Core Development
npm run dev                    # Start Next.js development server
npm run build                  # Build production version
npm run start                  # Start production server

# Key Management
npm run scan                   # Manual GitHub repository scan
npm run export:keys            # Export keys by type (supports --type, --format, --status flags)
npm run extract:keys           # Manual key extraction from text

# Backup & Recovery
npm run decrypt:backup         # Decrypt encrypted backup files
npm run restore:backup         # Restore backup to database (supports --dry-run, --table, --confirm)
```

### Archived Scripts
Additional analysis and cleanup scripts are available in `archived/scripts/`:
- Database migration and setup scripts
- Key analysis and cleanup utilities  
- Data validation and recovery tools
- Performance optimization scripts

To use archived scripts: `node archived/scripts/[script-name].js`

## Architecture Overview

### Technology Stack
- **Frontend**: Next.js 14 with App Router, React 18, Tailwind CSS
- **Backend**: Next.js API routes, Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with custom admin system
- **External APIs**: GitHub API (Octokit), AI provider APIs for verification
- **Automation**: GitHub Actions for scheduled scanning

### Core Components

#### Database Layer
The system uses Supabase with strict Row Level Security (RLS):
- `leaked_keys`: Public view with masked key data
- `leaked_keys_sensitive`: Admin-only complete keys
- `admin_users`: Admin authentication
- `daily_stats`: Aggregated statistics
- `visitor_stats`: IP access tracking with geolocation
- `online_users`: Real-time user activity
- `ip_blacklist`/`ip_whitelist`: IP access control

#### Scanner System (`scripts/scanner.js`)
- Multi-provider AI key detection (20+ services)
- Context-aware filtering to distinguish similar formats (e.g., OpenAI vs DeepSeek)
- Severity classification based on file type and repository context
- Real-time API verification of discovered keys

#### Frontend Architecture
```
/app/
├── page.js                   # Public dashboard (main entry)
├── layout.js                 # Root layout with navigation
├── components/               # Shared UI components
│   ├── Dashboard.js          # Main tabbed dashboard
│   ├── StatsCards.js         # Statistics display
│   ├── KeysTable.js          # Public keys table
│   └── ChartsPanel.js        # Trend visualizations
└── admin/                    # Admin-only section
    ├── page.js               # Admin authentication & dashboard
    └── components/           # Admin components
        ├── AdminLogin.js     # Auth form
        ├── AdminDashboard.js # Complete key management
        └── SensitiveKeysList.js # Full key access
```

#### API Structure (`/app/api/`)
- **Public APIs**: `/api/stats`, `/api/keys` (masked data only)
- **Admin APIs**: `/api/admin/*` (requires authentication)
- **Analytics APIs**: `/api/analytics`, `/api/ip-analytics` (visitor tracking & IP analysis)
- **Utility APIs**: `/api/verify-key`, `/api/extract-keys`, `/api/stats-trends`

### Key Detection Patterns
The scanner supports 20+ AI services with regex patterns:
- **OpenAI**: `sk-[48chars]` or `sk-proj-[40+chars]` (high confidence)
- **Anthropic**: `sk-ant-[95chars]` (high confidence)  
- **Google AI**: `AIza[35chars]` (high confidence)
- **DeepSeek**: `sk-[48chars]` with context validation (requires "deepseek" in context)
- **xAI**: `xai-[80chars]` (high confidence)

Priority order matters - OpenAI patterns are checked before DeepSeek to handle similar formats.

### Security Architecture
- **Data Separation**: Complete isolation between public and sensitive data via RLS
- **Admin Authentication**: Supabase Auth integration with admin_users table
- **Access Logging**: All sensitive operations logged in access_logs
- **Rate Limiting**: GitHub API and verification rate limiting implemented

## Development Guidelines

### Database Operations
Always use the SQL files in root directory:
- `database-simple.sql`: Main database schema with RLS policies
- `database-clear.sql`: Reset database (destructive)
- `setup-ip-analytics-complete.sql`: Complete IP analytics system setup

When modifying database schema, update both the SQL files and corresponding API routes.

### Key Detection
When adding new AI service patterns:
1. Add regex pattern to `scripts/scanner.js` KEY_PATTERNS object
2. Add verification function to `app/api/verify-key/route.js`
3. Test with known key formats to avoid false positives
4. Consider context requirements for ambiguous patterns

### Admin Features
Admin functionality requires:
1. User authentication via Supabase Auth
2. Corresponding record in `admin_users` table
3. RLS policies that check `is_admin()` function

### API Development
- Public APIs should only return masked/aggregated data
- Admin APIs must verify authentication with `verifyAdminAuth()`
- Use consistent error handling and response formats
- Implement proper pagination for large datasets

## Environment Configuration

Required environment variables:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key
- `NEXT_PUBLIC_SUPABASE_URL`: Public Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public Supabase anonymous key
- `GITHUB_TOKEN`: GitHub Personal Access Token (for Actions)

## GitHub Actions Automation

Three automated workflows:
- `scan-api-keys.yml`: Scheduled scanning every 4 hours
- `verify-keys.yml`: Daily key verification across providers
- `database-backup.yml`: Daily encrypted database backups (GPG AES256)
  - Includes IP analytics tables: `visitor_stats`, `online_users`
  - Automatic geographic data backup and recovery

### Backup Security
Database backups are automatically encrypted using GPG with AES256 symmetric encryption:
- **Password**: Set `BACKUP_ENCRYPTION_PASSWORD` in GitHub Secrets
- **Format**: `.json.gz.gpg` (compressed then encrypted)
- **Recovery**: Use `npm run decrypt:backup` and `npm run restore:backup`
- **Documentation**: See `BACKUP_SECURITY.md` for detailed security procedures

## Common Issues

### Statistics Calculation
The stats API (`/app/api/stats-trends/route.js`) handles percentage calculations with special cases:
- Zero division: 0/0 = 0%, current=0 = -100%, previous=0 = +100%
- Precision: Round to 1 decimal place to avoid floating point errors

### Key Detection Priority
When similar key formats exist (OpenAI vs DeepSeek), use:
1. Pattern ordering (OpenAI first)
2. Context validation (`context_required` and `context_exclude` arrays)
3. Confidence levels to distinguish patterns

### Admin Authentication Flow
Admin access requires both:
1. Valid Supabase user session
2. Matching record in `admin_users` table with `is_active = true`

The `is_admin()` database function checks both conditions automatically.

## IP Analytics System

### Features
- **Geographic Analysis**: Real-time IP geolocation with country/city mapping
- **Risk Assessment**: Automated threat detection based on access patterns
- **Activity Monitoring**: 24-hour access distribution and session tracking
- **Access Control**: IP blacklist/whitelist management with auto-detection

### Setup
1. Execute `setup-ip-analytics-complete.sql` in Supabase SQL Editor
2. Geographic data is automatically resolved for new visitors
3. Access admin panel → IP Analytics tab for dashboard

### API Endpoints
- `GET /api/ip-analytics?type=summary` - Overview statistics
- `GET /api/ip-analytics?type=geographic` - Country/city distribution  
- `GET /api/ip-analytics?type=risk-analysis` - IP threat assessment
- `GET /api/ip-analytics?type=resolve-locations` - Manual geo resolution

### Database Functions
- `get_ip_analytics_summary(days)` - Statistical overview
- `get_ip_risk_analysis_simple(days, limit)` - Risk analysis
- `check_ip_access(ip)` - Access permission check
- `auto_detect_risky_ips()` - Automated threat detection