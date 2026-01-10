# AI Marketplace Admin Dashboard

Secure React-based admin dashboard for managing the AI Marketplace Assistant system.

## 🔒 Security Features

- **Private S3 Hosting:** Bucket is NOT public, only accessible via CloudFront OAI
- **HTTPS Enforced:** All traffic redirected to HTTPS
- **Authentication Required:** Protected routes with role-based access
- **CSP Headers:** Content Security Policy for XSS protection
- **Secure Session Management:** JWT tokens with secure storage

## 🚀 Features

### Dashboard Overview
- Real-time system metrics and statistics
- Performance monitoring (response times, escalation rates)
- System status indicators
- Recent escalations summary

### Conversation Management
- Inbox view of all customer conversations
- Search and filter conversations by status, priority
- Real-time message viewing
- Conversation history and context

### Human Handoff Control
- View and manage escalated conversations
- Take ownership of escalated chats
- Resolve escalations and return to bot
- Escalation analytics and triggers

### Product Management
- CRUD operations for product catalog
- Inventory management and stock tracking
- Product search and filtering
- Image management and categorization

## 🛠 Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
```bash
cd frontend
npm install
```

### Development Server
```bash
npm start
```

### Build for Production
```bash
npm run build:prod
```

### Testing
```bash
npm test
```

## 🏗 Architecture

### Tech Stack
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Heroicons** for icons
- **Axios** for API calls

### Project Structure
```
frontend/
├── public/
│   ├── index.html          # Main HTML template
│   └── manifest.json       # PWA manifest
├── src/
│   ├── components/         # React components
│   │   ├── Login.tsx       # Authentication
│   │   ├── Dashboard.tsx   # Main dashboard
│   │   ├── ConversationInbox.tsx
│   │   ├── HandoffControl.tsx
│   │   └── ProductManagement.tsx
│   ├── contexts/          # React contexts
│   │   └── AuthContext.tsx # Authentication state
│   ├── App.tsx            # Main app component
│   └── index.tsx          # Entry point
├── package.json
└── tailwind.config.js
```

## 🔐 Authentication

### Demo Credentials
- **Admin:** admin@aimarketplace.com / admin123
- **Agent:** agent@aimarketplace.com / agent123

### Production Setup
Replace the demo authentication in `AuthContext.tsx` with:
1. JWT token validation
2. API integration for user management
3. Role-based permissions
4. Session timeout handling

## 🚀 Deployment

The frontend is automatically deployed via CI/CD pipeline:

1. **Build:** React app built with production optimizations
2. **Upload:** Files uploaded to private S3 bucket
3. **Distribution:** Served via CloudFront with OAI
4. **Cache:** CloudFront cache invalidated after deployment

### Manual Deployment
```bash
# Build the app
npm run build:prod

# Deploy to S3 (requires AWS CLI configured)
aws s3 sync build/ s3://ai-marketplace-admin-dashboard-production-{account}/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id {distribution-id} --paths "/*"
```

## 🔧 Configuration

### Environment Variables
Create `.env` file in frontend directory:
```bash
REACT_APP_API_BASE_URL=https://api.aimarketplace.com
REACT_APP_ENVIRONMENT=production
```

### API Integration
Update API endpoints in components to connect with backend:
- Conversation API: `/api/conversations`
- Escalation API: `/api/escalations`
- Product API: `/api/products`
- Auth API: `/api/auth`

## 📱 Responsive Design

The dashboard is fully responsive and works on:
- Desktop (1024px+)
- Tablet (768px - 1023px)
- Mobile (320px - 767px)

## 🎨 Theming

Tailwind CSS configuration supports:
- Custom color palette
- Dark mode (can be enabled)
- Consistent spacing and typography
- Responsive breakpoints

## 🔍 Monitoring

### Performance Metrics
- Web Vitals tracking enabled
- Performance monitoring via `reportWebVitals`
- Error boundary for crash reporting

### Security Monitoring
- CSP violation reporting
- Authentication failure tracking
- Session timeout monitoring

## 📚 API Documentation

### Authentication Endpoints
```typescript
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me
POST /api/auth/refresh
```

### Conversation Endpoints
```typescript
GET /api/conversations
GET /api/conversations/:id
POST /api/conversations/:id/messages
PUT /api/conversations/:id/status
```

### Escalation Endpoints
```typescript
GET /api/escalations
POST /api/escalations/:id/take
POST /api/escalations/:id/resolve
GET /api/escalations/:id/status
```

### Product Endpoints
```typescript
GET /api/products
POST /api/products
PUT /api/products/:id
DELETE /api/products/:id
GET /api/products/search
```

## 🚨 Security Considerations

1. **Never expose sensitive data** in frontend code
2. **Validate all user inputs** before API calls
3. **Use HTTPS only** for all communications
4. **Implement proper session management**
5. **Regular security audits** of dependencies
6. **CSP headers** to prevent XSS attacks
7. **Input sanitization** for all user content

## 📄 License

This project is part of the AI Marketplace Assistant system and is proprietary software.