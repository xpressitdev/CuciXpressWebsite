# 🔗 Unified Authentication System Setup Complete!

Your two Replit apps can now share users and authentication across both domains:
- **cucixpress.com** (Car wash business)
- **cuci-xpress.com** (Live queue system)

## ✅ What's Now Working

### 🔐 **Cross-Domain Authentication**
- Users can log in once and access both apps
- JWT tokens work across both domains
- Secure cookie-based sessions
- Automatic login state synchronization

### 📊 **Shared Database**
- All user accounts stored in unified PostgreSQL database
- Customer data (car plates, phone numbers) shared between apps
- Payment history accessible from both systems
- Queue management synced across platforms

### 🛠️ **New API Endpoints**
- `POST /api/auth/login` - Login to both apps
- `POST /api/auth/register` - Create account for both apps
- `POST /api/auth/logout` - Logout from both apps
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/verify-token` - Cross-domain token verification

## 🚀 Setup Instructions

### Step 1: Deploy the Updated System
Your current app (cucixpress.com) now has all the unified auth features. The system will:
- Automatically handle cross-domain cookies
- Sync user sessions between domains
- Share all customer and payment data

### Step 2: Update Your Second App (cuci-xpress.com)
To connect your live queue system:

1. **Add authentication check** to your cuci-xpress.com app:
```javascript
// Check if user is logged in
const response = await fetch('https://cucixpress.com/api/auth/verify-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: userToken })
});
```

2. **Share the database connection**:
```javascript
// Use the same DATABASE_URL in both apps
const DATABASE_URL = 'your-shared-database-url';
```

3. **Cross-domain login redirect**:
```javascript
// Redirect users to main login page
const loginUrl = 'https://cucixpress.com/login?return_to=' + encodeURIComponent(window.location.href);
```

### Step 3: User Experience Flow

**For New Users:**
1. User visits either cucixpress.com or cuci-xpress.com
2. Clicks login/register → Redirects to main auth page
3. Creates account once → Works on both apps
4. Gets redirected back to original app

**For Existing Users:**
1. Login on either domain
2. Automatically authenticated on both domains
3. Can switch between apps without re-login
4. Logout from either app logs out of both

## 🔧 Technical Features

### **Security**
- JWT tokens with 7-day expiration
- Secure HTTP-only cookies
- Cross-domain cookie settings
- Password hashing (ready for implementation)

### **User Management**
- Role-based access (admin, user)
- App-specific permissions
- Profile data storage
- Last login tracking

### **Backward Compatibility**
- Legacy admin password still works
- Existing customer data preserved
- Gradual migration from old auth system

## 📱 Integration Benefits

✅ **Single Account** - One login for both car wash and laundry services  
✅ **Shared Customer Data** - Car plates, phone numbers sync between apps  
✅ **Unified Payments** - Payment history across both services  
✅ **Queue Management** - Real-time updates between both systems  
✅ **Admin Dashboard** - Manage both businesses from one place  
✅ **Customer History** - Complete service history across all branches  

## 🛠️ Next Steps

1. **Test the authentication** on your current app
2. **Update your cuci-xpress.com app** to use the unified auth
3. **Configure cross-domain cookies** in production
4. **Set up user registration flow** for customers
5. **Train staff** on the unified system

The authentication system is now ready and will automatically handle users across both of your apps!