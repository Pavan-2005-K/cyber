
import re
import zipfile
from collections import Counter
from pathlib import Path

from androguard.core.apk import APK


FEATURE_COLUMNS = [
    "IPCAbuse", "NDK", "ServiceLifecycle", "WorkManager",
    "TotalJavaFile", "JavaLangReflectMethod", "RootAccess",
    "ReadSms", "ContentResolver", "UseFingerprint",
    "JavaSecurityCertX509Certificate", "ReceiveSms",
    "CustomPermission", "BluetoothAdmin", "JavaNetSocket",
    "UpdateAppOpsStats", "IntentSniffing", "JavaNetUrl",
    "UseBiometric", "AccessNetworkState", "AccountManager",
    "WebViewExploits", "ReadUserDictionary", "ContentProvider",
    "Vibrate1", "ChangeWifiState1", "JavaxNetSslSslsocket",
    "JavaSecurityCertCertificateFactory",
    "JavaNioFileAttributeFileTime", "JavaNetHttpURLConnection",
    "JavaNetUri", "JavaSecurityKeyPair",
    "JavaNioFileStandardCopyOption", "JavaSecurityKeyFactory",
    "JavaNetInetAddress", "JavaNioFileAttributeUserPrincipal",
    "CheckSelfPermissionCallCount", "GetConnectionInfoCallCount",
    "GetSubscriberIdCallCount", "GetDeviceIdCallCount",
    "GetDrawableOccurrences", "OnResumeOccurrences",
    "ConnectOccurrences", "OnTouchCallCount", "NewWakeLockCallCount",
    "SetProgressOccurrences", "GetPackageInfoCallCount",
    "RemoveOccurrences", "EnqueueOccurrences",
    "GetSystemServiceCallCount", "CancelOccurrences",
    "SetAccessibleCallCount", "OpenConnectionCallCount",
    "RegisterListenerCallCount", "GetContentResolverCallCount",
    "RegisterListenerOccurrences", "RequestPermissionsCallCount",
    "GetPrimaryClipCallCount", "GetPrimaryClipOccurrences",
    "OnPauseCallCount", "GetSimSerialNumberCallCount",
    "Internet", "AccessCoarseLocation", "Vibrate",
    "AccessFineLocation", "SendSms", "ChangeWifiState", "Bluetooth",
]


# Indicators that can be searched for in DEX string data.
# These are proxies; they may not reproduce the original training features.
DEX_INDICATORS = {
    "IPCAbuse": ["Binder", "Messenger", "AIDL"],
    "NDK": ["System.loadLibrary", "native "],
    "ServiceLifecycle": ["onStartCommand", "onBind", "startService"],
    "WorkManager": ["androidx/work", "WorkManager"],
    "JavaLangReflectMethod": ["java/lang/reflect/Method"],
    "RootAccess": ["su", "Superuser.apk", "magisk"],
    "ReadSms": ["READ_SMS", "getMessagesFromIntent"],
    "ContentResolver": ["getContentResolver"],
    "UseFingerprint": ["FingerprintManager"],
    "JavaSecurityCertX509Certificate": ["X509Certificate"],
    "ReceiveSms": ["RECEIVE_SMS", "SMS_RECEIVED"],
    "BluetoothAdmin": ["BLUETOOTH_ADMIN"],
    "JavaNetSocket": ["java/net/Socket"],
    "UpdateAppOpsStats": ["UPDATE_APP_OPS_STATS"],
    "IntentSniffing": ["getAction", "registerReceiver"],
    "JavaNetUrl": ["java/net/URL"],
    "UseBiometric": ["BiometricPrompt"],
    "AccessNetworkState": ["ACCESS_NETWORK_STATE"],
    "AccountManager": ["AccountManager"],
    "WebViewExploits": ["WebView", "addJavascriptInterface"],
    "ReadUserDictionary": ["READ_USER_DICTIONARY"],
    "ContentProvider": ["ContentProvider"],
    "Vibrate1": ["Vibrator", "vibrate"],
    "ChangeWifiState1": ["CHANGE_WIFI_STATE"],
    "JavaxNetSslSslsocket": ["javax/net/ssl/SSLSocket"],
    "JavaSecurityCertCertificateFactory": ["CertificateFactory"],
    "JavaNioFileAttributeFileTime": ["FileTime"],
    "JavaNetHttpURLConnection": ["HttpURLConnection"],
    "JavaNetUri": ["java/net/URI"],
    "JavaSecurityKeyPair": ["KeyPair"],
    "JavaNioFileStandardCopyOption": ["StandardCopyOption"],
    "JavaSecurityKeyFactory": ["KeyFactory"],
    "JavaNetInetAddress": ["InetAddress"],
    "JavaNioFileAttributeUserPrincipal": ["UserPrincipal"],
    "CheckSelfPermissionCallCount": ["checkSelfPermission"],
    "GetConnectionInfoCallCount": ["getConnectionInfo"],
    "GetSubscriberIdCallCount": ["getSubscriberId"],
    "GetDeviceIdCallCount": ["getDeviceId"],
    "GetDrawableOccurrences": ["getDrawable"],
    "OnResumeOccurrences": ["onResume"],
    "ConnectOccurrences": [".connect"],
    "OnTouchCallCount": ["onTouch"],
    "NewWakeLockCallCount": ["newWakeLock"],
    "SetProgressOccurrences": ["setProgress"],
    "GetPackageInfoCallCount": ["getPackageInfo"],
    "RemoveOccurrences": [".remove"],
    "EnqueueOccurrences": ["enqueue"],
    "GetSystemServiceCallCount": ["getSystemService"],
    "CancelOccurrences": [".cancel"],
    "SetAccessibleCallCount": ["setAccessible"],
    "OpenConnectionCallCount": ["openConnection"],
    "RegisterListenerCallCount": ["registerListener"],
    "GetContentResolverCallCount": ["getContentResolver"],
    "RegisterListenerOccurrences": ["registerListener"],
    "RequestPermissionsCallCount": ["requestPermissions"],
    "GetPrimaryClipCallCount": ["getPrimaryClip"],
    "GetPrimaryClipOccurrences": ["getPrimaryClip"],
    "OnPauseCallCount": ["onPause"],
    "GetSimSerialNumberCallCount": ["getSimSerialNumber"],
}

PERMISSION_FEATURES = {
    "Internet": "INTERNET",
    "AccessCoarseLocation": "ACCESS_COARSE_LOCATION",
    "AccessFineLocation": "ACCESS_FINE_LOCATION",
    "SendSms": "SEND_SMS",
    "ChangeWifiState": "CHANGE_WIFI_STATE",
    "Bluetooth": "BLUETOOTH",
}


def extract_apk_features(apk_path: str | Path) -> dict:
    """
    Extract a provisional 68-feature dictionary from an APK.

    IMPORTANT:
    This does not reproduce the original model's training extractor.
    Do not treat predictions as validated until feature parity is established.
    """
    apk_path = Path(apk_path)

    if not apk_path.is_file():
        raise FileNotFoundError("APK file was not found.")

    if apk_path.suffix.lower() != ".apk":
        raise ValueError("The uploaded file must have an .apk extension.")

    try:
        apk = APK(str(apk_path))

        if not apk.is_valid_APK():
            raise ValueError("The uploaded file is not a valid APK.")

        permissions = set(apk.get_permissions() or [])
        feature_values = {name: 0 for name in FEATURE_COLUMNS}

        # Permission indicators.
        for feature, permission_suffix in PERMISSION_FEATURES.items():
            feature_values[feature] = int(
                any(
                    permission.endswith("." + permission_suffix)
                    or permission == "android.permission." + permission_suffix
                    for permission in permissions
                )
            )

        # Custom permissions: permissions declared by the app itself.
        package_name = apk.get_package()
        if package_name:
            feature_values["CustomPermission"] = int(
                any(
                    permission.startswith(package_name + ".")
                    and permission not in permissions
                    for permission in []
                )
            )

        # Read DEX string data from APK archives without executing the app.
        dex_text_parts = []
        dex_file_count = 0

        with zipfile.ZipFile(apk_path, "r") as archive:
            for entry in archive.namelist():
                if re.fullmatch(r"classes\d*\.dex", Path(entry).name):
                    dex_file_count += 1
                    raw = archive.read(entry)
                    dex_text_parts.append(raw.decode("latin-1", errors="ignore"))

        dex_text = "\n".join(dex_text_parts)

        # Approximate Java source/class indicators.
        feature_values["TotalJavaFile"] = dex_file_count

        # API/class indicators.
        for feature, indicators in DEX_INDICATORS.items():
            if feature in feature_values:
                feature_values[feature] = sum(
                    dex_text.count(indicator) for indicator in indicators
                )

        # These are permission indicators, not proof of malicious behaviour.
        feature_values["ReadSms"] = max(
            feature_values["ReadSms"],
            int(any(p.endswith(".READ_SMS") for p in permissions)),
        )
        feature_values["ReceiveSms"] = max(
            feature_values["ReceiveSms"],
            int(any(p.endswith(".RECEIVE_SMS") for p in permissions)),
        )
        feature_values["BluetoothAdmin"] = max(
            feature_values["BluetoothAdmin"],
            int(any(p.endswith(".BLUETOOTH_ADMIN") for p in permissions)),
        )
        feature_values["AccessNetworkState"] = max(
            feature_values["AccessNetworkState"],
            int(any(p.endswith(".ACCESS_NETWORK_STATE") for p in permissions)),
        )
        feature_values["ChangeWifiState"] = max(
            feature_values["ChangeWifiState"],
            int(any(p.endswith(".CHANGE_WIFI_STATE") for p in permissions)),
        )

        # Ensure the exact feature order expected by the model.
        return {
            feature: int(feature_values[feature])
            for feature in FEATURE_COLUMNS
        }

    except (zipfile.BadZipFile, KeyError) as exc:
        raise ValueError("Unable to read the APK archive.") from exc
