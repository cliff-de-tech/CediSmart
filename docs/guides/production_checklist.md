# CediSmart Production & Deployment Checklist

This document details the configuration, security, assets, and infrastructure setup needed to take CediSmart from development to the **Apple App Store** and **Google Play Store**.

---

## 📱 1. Mobile App Configuration (`app.json`)
The current `app.json` has minimal settings tailored for development. You must update these details before building production binaries.

### A. Core Identifiers
* **User-facing App Name**: Update `"name": "cedismart-mobile"` to `"CediSmart"` or your custom branding name.
* **Apple Bundle Identifier**: Add `ios.bundleIdentifier` (e.g., `"com.cedismart.app"`). This must be unique in Apple Developer Portal.
* **Android Package Name**: Add `android.package` (e.g., `"com.cedismart.app"`). This must be unique in Google Play Console.
* **EAS Configuration**: If using Expo Application Services (EAS) for remote builds, configure the Expo Project ID.

### B. Device Permission Usage Descriptions
When submitting to the App Store, iOS builds will fail automated verification or face rejection unless every API that requests permissions includes a corresponding user-facing description in the `infoPlist`.
* **Biometrics (`NSFaceIDUsageDescription`)**: Already configured in `app.json`.
* **Photo Library (`NSPhotoLibraryUsageDescription`)**: **[Required]** Add this description to support custom profile avatar selection from the gallery.
  * *Example Value*: `"CediSmart requires photo gallery access to let you upload and crop your profile avatar."`
* **Camera (`NSCameraUsageDescription`)**: **[Optional]** Add this if you want to support taking a live selfie for the profile photo.
  * *Example Value*: `"CediSmart requires camera access to capture your profile photo."`

```json
/* app.json Update Snippet */
{
  "expo": {
    "name": "CediSmart",
    "slug": "cedismart",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.cedismart.app",
      "supportsTablet": true,
      "infoPlist": {
        "NSFaceIDUsageDescription": "CediSmart uses Face ID to allow you to log in quickly and securely.",
        "NSPhotoLibraryUsageDescription": "CediSmart requires photo gallery access to let you upload and crop your profile avatar."
      }
    },
    "android": {
      "package": "com.cedismart.app",
      "adaptiveIcon": {
        "backgroundColor": "#0d631b",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      }
    }
  }
}
```

---

## ⚙️ 2. Environment & Network Configuration
* **Production API Base URL**: Update `EXPO_PUBLIC_API_URL` to point to your secure production API gateway (must use `https://` protocol).
* **SSL Certificate Pinning**: Implement SSL pinning for Axios requests to enforce encrypted traffic paths and prevent Man-in-the-Middle (MitM) snooping on financial transactions.
* **API Timeout Optimization**: Scale production request timeouts appropriately (e.g., standardizing timeouts to `15000ms` for network syncing).

---

## 🔒 3. App Store Review Demo & Bypass Accounts
Apple and Google App Reviewers are located globally and will not have valid Ghanaian SIM cards (MTN, Telecel, AirtelTigo) to receive SMS OTP authentication codes. To prevent app rejection:
1. **Mock Gateway Mode**: Configure a testing/bypass route on the backend OTP server.
2. **Reviewer Demo Phone Number**: Whitelist a specific test phone number (e.g. `+233200000000`).
3. **Fixed Validation Tokens**:
   - Set the OTP verification endpoint to instantly pass with a fixed dummy code (e.g., `123456`).
   - Associate a pre-loaded profile (with fake transactions and budgets already configured) to this phone number.
4. **App Review Instructions**: Supply this phone number and PIN in the **"App Review Information" / "Demo Account Credentials"** fields on both the Play Console and App Store Connect submissions.

---

## 🔑 4. Signing Certificates & Developer Accounts
You need active publisher accounts on both platforms:

### Apple App Store
* **Apple Developer Program Account**: Requires a paid subscription ($99/year).
* **Signing Assets**: Generate a **Distribution Provisioning Profile** and **Apple Distribution Certificate**.
* **APNs Push Key**: Create a `.p8` Push Notification token inside the Apple Developer Portal and link it with EAS or your notification server.

### Google Play Store
* **Google Developer Console Account**: Requires a one-time registration fee ($25).
* **Keystore File**: Create a secure release Java Keystore file to sign the production `.aab` (Android App Bundle).
* **Expo Credentials Management (EAS)**: If building with EAS, run `eas credentials` to let Expo automatically generate, sync, and securely store signing profiles.

---

## 🎨 5. Store Metadata & Visual Assets
Prepare the following graphic and legal items before opening store submission listings:

| Asset Item | Platform | Specifications |
|---|---|---|
| **App Store Icon** | iOS | `1024 x 1024 px` (square, no transparency) |
| **Phone Screenshots** | iOS | 6.5" (iPhone Pro Max) and 5.5" (iPhone Plus) resolutions |
| **Tablet Screenshots** | iOS | 12.9" iPad Pro (if supportsTablet is checked) |
| **Feature Graphic** | Android | `1024 x 500 px` JPG or 24-bit PNG |
| **Phone Screenshots** | Android | Minimum of 2/maximum of 8 screenshots showing core dashboard screens |
| **Privacy Policy URL** | Both | A publicly hosted URL outlining how user data (phone numbers, balances, categories) is managed and protected |
| **Support Website** | Both | Public landing page for support requests and contact info |

---

## 🛠️ 6. Production Hardening & Testing
* **Error Tracking**: Initialize a production error-logging suite such as **Sentry** or **Firebase Crashlytics** to monitor UI exceptions and offline sync drops.
* **SMS Gateway Safeguards**: Configure spending limits or SMS request caps on your SMS provider (Termii) to safeguard against SMS bombing/spamming.
* **Backend Database Security**: Ensure your production PostgreSQL server resides on an isolated private subnet, accepting connections strictly from the FastAPI application host.
