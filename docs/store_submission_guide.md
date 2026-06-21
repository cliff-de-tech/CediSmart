# CediSmart Production Store Submission Guide

This guide provides a comprehensive step-by-step walk-through for deploying the CediSmart FastAPI backend to production and building & submitting the Expo React Native app to the Google Play Store and Apple App Store.

---

## 🛠️ Step 1: Backend Server Deployment

Before building your mobile app, your production backend API must be deployed and accessible over a secure HTTPS connection.

### A. Environment Configuration (`.env`)
Create a `.env` file on your production server. Ensure the following production-grade values are set:

```ini
# Production Database Connection
DATABASE_URL=postgresql+asyncpg://<PROD_USER>:<PROD_PASSWORD>@<PROD_DB_HOST>:5432/cedismart

# Production Redis (for OTP throttling and token revocation)
REDIS_URL=redis://<PROD_REDIS_HOST>:6379/0

# Production Settings
ENVIRONMENT=production
DEBUG=false
ALLOWED_ORIGINS=https://cedismart.com,https://www.cedismart.com

# Termii SMS Gateway Credentials
TERMII_API_KEY=your-live-termii-api-key
TERMII_SENDER_ID=CediSmart

# Security Keys (JWT RSA Key Pair)
# RSA keys must match your development key format but use unique production-generated key pairs.
RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."

# Gemini AI SMS Parser key
GEMINI_API_KEY=your-production-gemini-api-key
```

> [!CAUTION]
> Never set `DEBUG=true` or use localhost credentials in your production `.env`. Ensure your PostgreSQL database and Redis servers are protected inside a private VPC and only accept connections from your web application instance.

### B. Database Migration
After setting up your production environment and connection string, execute database migrations to set up the schemas:
```bash
# Run Alembic migrations to build tables on your production DB
alembic upgrade head
```

---

## 🔒 Step 2: Whitelisting App Store Reviewers

Apple and Google app review teams do not have access to Ghanaian phone numbers to receive SMS messages. We have pre-configured a test bypass mechanism in your backend.

1. **Review Account**: Do **not** block or delete the number `+233200000000` on the backend.
2. **Review credentials**: In the submission form, provide:
   * **Test Phone**: `+233200000000`
   * **Test OTP**: `123456`
   * **Test PIN**: `123456`
3. **Review Bypass Flow**: The review bypass is whitelisted for all auth endpoints, allowing reviewers to test registration, login, and PIN configuration without triggering SMS Gateway API costs.

---

## 📱 Step 3: Expo Mobile App Configuration

Before triggering standalone builds, ensure the environment variables are correctly injected.

### A. Update API Endpoints in `eas.json`
Since Expo compiles standalone binaries on their remote cloud servers, environment variables from your local `.env` are not included by default. We have set up `eas.json` to handle this.
1. Open [eas.json](file:///media/cliff-de-tech/Apps/Everything/My_Projects/CediSmart/cedismart-mobile/eas.json).
2. Change the `"EXPO_PUBLIC_API_URL"` keys under both the `preview` and `production` build profiles to match your secure production backend endpoint:
```json
"env": {
  "EXPO_PUBLIC_API_URL": "https://api.yourdomain.com/api/v1"
}
```

> [!WARNING]
> If you build your app without updating this URL, the binary will default to your local development IP (`http://192.168.1.199:8000/api/v1`) and the app will freeze or show network errors in production.

---

## 📦 Step 4: Standalone Builds with EAS (Expo Application Services)

Ensure you have the EAS CLI tool installed globally on your machine:
```bash
npm install -g eas-cli
```

### A. Log in to Expo
Authenticate the CLI with your Expo developer account:
```bash
eas login
```

### B. Initialize the EAS Project
Link your local codebase to your Expo dashboard project:
```bash
eas project:init
```

### C. Build the Android Standalone APK (For Website Download)
To generate a downloadable `.apk` file for direct installation from your landing website, build using the `preview` profile:
```bash
eas build --platform android --profile preview
```
*When the build finishes, EAS will provide a direct download link to the `.apk` file, which you can host on your server or distribute to users.*

### D. Build the Android Production App Bundle (AAB)
To generate the `.aab` file required by the Google Play Store:
```bash
eas build --platform android --profile production
```
*EAS will prompt you to generate a Keystore file. Choose **Yes** to let Expo handle it securely.*

### E. Build the iOS Production App (IPA)
To compile the production build for iOS submission:
```bash
eas build --platform ios --profile production
```
*EAS will prompt you to log in to your Apple Developer Account to configure provision profiles, signing identifiers, and certificates.*

---

## 🚀 Step 5: Submission to Store Portals

### A. Google Play Store Submission
1. Log in to the [Google Play Console](https://play.google.com/console/) and click **Create app**.
2. Complete the initial questionnaire (app declarations, target age groups, data safety, etc.).
3. Upload the `.aab` file generated in **Step 4-D** to the **Production** release track.
4. **Data Safety Declarations**: Declare that CediSmart collects *Personal Info* (phone number, full name) and *Financial Info* (transactions, balances) for account management and tracking purposes, and that all data is encrypted in transit (via HTTPS).
5. In **App Access**, choose "Some or all functional parts of my app are restricted" and provide the reviewer credentials:
   * **Phone**: `+233200000000`
   * **OTP**: `123456`
   * **PIN**: `123456`

### B. Apple App Store Submission
1. Log in to [App Store Connect](https://appstoreconnect.apple.com/) and create a new app.
2. Link the bundle ID (`com.cedismart.app`).
3. Complete the app details (Privacy policy URL, Support URL, categories, description).
4. Run `eas submit -p ios` to upload your completed iOS build directly from EAS to App Store Connect.
5. Under **App Review Information**, check "Sign-in required" and enter:
   * **Username (Phone)**: `+233200000000`
   * **Password (OTP/PIN)**: `123456`
   * **Notes**: *"To test registration or login, enter the phone number +233200000000 and enter the OTP 123456 when prompted."*
6. Select the uploaded build, add your app screenshots (6.5" and 5.5"), and click **Submit for Review**.
