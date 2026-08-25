# Auth-Gated App Testing Playbook (Emergent Google Auth)

Kash AI Pro supports TWO auth methods that coexist:
1. JWT email/password (existing 5-role system) — token stored in localStorage "kash_token", sent as `Authorization: Bearer <jwt>`.
2. Emergent Google OAuth — session_token stored in `user_sessions`, also returned as access_token and stored in localStorage "kash_token" (sent as Bearer) AND set as httpOnly cookie `session_token`.

`get_current_user` accepts BOTH: it first looks up the token in `user_sessions` (Google), else decodes it as a JWT.

Google users are created in the `users` collection with role="user" (Customer), auth_provider="google". Their `user_sessions.user_id` == str(users._id).

## Step 1: Create Test User & Session (Google-style)
```
mongosh --eval "
use('test_database');
var oid = new ObjectId();
db.users.insertOne({_id: oid, name:'Google Test', email:'gtest_'+Date.now()+'@example.com', role:'user', is_verified:true, is_blocked:false, auth_provider:'google', profile:{}, created_at:new Date().toISOString()});
var token='test_session_'+Date.now();
db.user_sessions.insertOne({session_token:token, user_id:oid.str, expires_at:new Date(Date.now()+7*24*3600*1000).toISOString(), created_at:new Date().toISOString()});
print('session_token: '+token);
"
```

## Step 2: Test backend
```
curl -s $BACKEND/api/auth/me -H "Authorization: Bearer <session_token>"    # returns user
curl -s $BACKEND/api/user/medicines -H "Authorization: Bearer <session_token>"
```

## Step 3: Browser
Set localStorage kash_token to the session_token then open /shop, OR set cookie session_token (httpOnly, secure, sameSite None) and open the app.

## Live OAuth flow (manual only — cannot script Google login)
- Click "Continue with Google" -> redirects to https://auth.emergentagent.com/?redirect=<origin>/shop
- After Google, lands at /shop#session_id=... -> AuthProvider POSTs /api/auth/google-session with X-Session-ID -> stores access_token -> /shop renders.

## Cleanup
```
mongosh --eval "use('test_database'); db.users.deleteMany({email:/gtest_/}); db.user_sessions.deleteMany({session_token:/test_session/});"
```

## Checklist
- /api/auth/me returns user for a valid session_token (Google) AND a valid JWT (email/password)
- Blocked users get 403 on both paths
- Expired session (expires_at < now) -> 401
- New Google user gets role "user" and lands on /shop
