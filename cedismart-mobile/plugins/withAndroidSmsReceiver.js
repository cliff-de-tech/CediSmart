const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to register Android SMS Receiver and config helper module.
 */
module.exports = function withAndroidSmsReceiver(config) {
  // 1. Add permissions and receiver to AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    
    // Ensure permissions array exists
    if (!config.modResults.manifest['uses-permission']) {
      config.modResults.manifest['uses-permission'] = [];
    }

    // Add RECEIVE_SMS and READ_SMS permissions
    const permissions = ['android.permission.RECEIVE_SMS', 'android.permission.READ_SMS'];
    permissions.forEach((permission) => {
      if (!config.modResults.manifest['uses-permission'].some(p => p.$['android:name'] === permission)) {
        config.modResults.manifest['uses-permission'].push({
          $: { 'android:name': permission }
        });
      }
    });

    // Add broadcast receiver declaration
    if (!mainApplication.receiver) {
      mainApplication.receiver = [];
    }

    const receiverName = '.SmsReceiver';
    if (!mainApplication.receiver.some(r => r.$['android:name'] === receiverName)) {
      mainApplication.receiver.push({
        $: {
          'android:name': receiverName,
          'android:exported': 'true',
          'android:permission': 'android.permission.BROADCAST_SMS'
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }
            ]
          }
        ]
      });
    }

    return config;
  });

  // 2. Generate Kotlin native source files during prebuild
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      
      // Determine the package path. Standard Expo package is usually com.cedismart.mobile or similar.
      // We read package name from app.json / android.package
      const packageName = config.android?.package || 'com.cedismart.mobile';
      const packagePath = packageName.replace(/\./g, '/');
      const srcDir = path.join(projectRoot, 'android/app/src/main/java', packagePath);

      // Create directories if they do not exist yet
      fs.mkdirSync(srcDir, { recursive: true });

      // Write SmsReceiver.kt
      const smsReceiverCode = `package ${packageName}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import org.json.JSONObject

class SmsReceiver : BroadcastReceiver() {
    private val TAG = "CediSmartSmsReceiver"

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            for (message in messages) {
                val sender = message.originatingAddress ?: continue
                val body = message.messageBody ?: continue
                
                Log.d(TAG, "Received SMS from: $sender")
                
                val senderLower = sender.lowercase()
                if (senderLower.contains("mobilemoney") || 
                    senderLower.contains("mtnmomo") || 
                    senderLower.contains("telecel") || 
                    senderLower.contains("vodacash") ||
                    senderLower.contains("t-cash") ||
                    senderLower.contains("tcash") ||
                    senderLower.contains("atmoney")) {
                    
                    forwardSmsToApi(context, sender, body)
                }
            }
        }
    }

    private fun forwardSmsToApi(context: Context, sender: String, body: String) {
        val prefs = context.getSharedPreferences("momo_sync_prefs", Context.MODE_PRIVATE)
        val token = prefs.getString("access_token", null)
        val phone = prefs.getString("linked_phone", null)
        val rawBaseUrl = prefs.getString("api_url", "https://api.cedismart.com/api/v1") ?: "https://api.cedismart.com/api/v1"

        if (token == null || phone == null) {
            Log.w(TAG, "Sync configuration is missing. Skipping SMS forwarding.")
            return
        }

        // Clean up base URL to ensure proper endpoint routing
        val baseUrl = if (rawBaseUrl.endsWith("/")) rawBaseUrl.substring(0, rawBaseUrl.length - 1) else rawBaseUrl
        val webhookUrlStr = "$baseUrl/transactions/sms-webhook"

        thread {
            try {
                Log.d(TAG, "Forwarding to: $webhookUrlStr")
                val url = URL(webhookUrlStr)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.doOutput = true

                val payload = JSONObject().apply {
                    put("sender", sender)
                    put("message_body", body)
                    put("phone", phone)
                }

                OutputStreamWriter(conn.outputStream, "UTF-8").use { writer ->
                    writer.write(payload.toString())
                    writer.flush()
                }

                val responseCode = conn.responseCode
                Log.d(TAG, "Server responded with status code: $responseCode")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send SMS to API webhook", e)
            }
        }
    }
}
`;

      // Write MomoSyncModule.kt
      const momoSyncModuleCode = `package ${packageName}

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MomoSyncModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "MomoSyncModule"
    }

    @ReactMethod
    fun saveConfig(token: String, phone: String, apiUrl: String) {
        val context = reactApplicationContext
        val prefs = context.getSharedPreferences("momo_sync_prefs", Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString("access_token", token)
            putString("linked_phone", phone)
            putString("api_url", apiUrl)
            apply()
        }
        Log.d("MomoSyncModule", "Auto-sync config saved locally for background receiver.")
    }

    @ReactMethod
    fun clearConfig() {
        val context = reactApplicationContext
        val prefs = context.getSharedPreferences("momo_sync_prefs", Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
        Log.d("MomoSyncModule", "Auto-sync config cleared.")
    }
}
`;

      // Write MomoSyncPackage.kt
      const momoSyncPackageCode = `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import java.util.ArrayList

class MomoSyncPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        val modules = ArrayList<NativeModule>()
        modules.add(MomoSyncModule(reactContext))
        return modules
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

      fs.writeFileSync(path.join(srcDir, 'SmsReceiver.kt'), smsReceiverCode);
      fs.writeFileSync(path.join(srcDir, 'MomoSyncModule.kt'), momoSyncModuleCode);
      fs.writeFileSync(path.join(srcDir, 'MomoSyncPackage.kt'), momoSyncPackageCode);

      // 3. Register the MomoSyncPackage inside android/app/src/main/java/.../MainApplication.kt (or similar if using modern Expo template)
      // In modern Expo, packages are autolinked. But custom local modules can be added manually.
      // Let's modify MainApplication.kt to add MomoSyncPackage.
      // Usually, Expo has a standard template for packages. If we want it registered automatically, we can find the MainApplication.kt file
      // and inject `packages.add(MomoSyncPackage())` in getPackages()!
      const mainApplicationPath = path.join(projectRoot, 'android/app/src/main/java', packagePath, 'MainApplication.kt');
      if (fs.existsSync(mainApplicationPath)) {
        let appContent = fs.readFileSync(mainApplicationPath, 'utf8');
        
        // Check if package is already imported/registered
        if (!appContent.includes('MomoSyncPackage')) {
            // Add import
            appContent = appContent.replace(
                `import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint`,
                `import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint\nimport ${packageName}.MomoSyncPackage`
            );
            
            // Register in getPackages()
            // Standard React Native MainApplication.kt contains:
            // val packages = PackageList(this).packages
            // packages.add(MomoSyncPackage()) or return PackageList(this).packages
            if (appContent.includes('val packages = PackageList(this).packages')) {
                appContent = appContent.replace(
                    'val packages = PackageList(this).packages',
                    'val packages = PackageList(this).packages\n      packages.add(MomoSyncPackage())'
                );
            } else if (appContent.includes('override fun getPackages(): List<ReactPackage> {')) {
                // Alternative insertion pattern
                appContent = appContent.replace(
                    'override fun getPackages(): List<ReactPackage> {',
                    'override fun getPackages(): List<ReactPackage> {\n      val packages = PackageList(this).packages.toMutableList()\n      packages.add(MomoSyncPackage())\n      return packages'
                );
            } else if (appContent.includes('PackageList(this).packages.apply {')) {
                // Modern Expo SDK 51+ apply block
                appContent = appContent.replace(
                    'PackageList(this).packages.apply {',
                    'PackageList(this).packages.apply {\n              add(MomoSyncPackage())'
                );
            }
            
            fs.writeFileSync(mainApplicationPath, appContent);
            console.log("MomoSyncModule: MainApplication.kt updated with MomoSyncPackage.");
        }
      }

      return config;
    }
  ]);

  return config;
};
