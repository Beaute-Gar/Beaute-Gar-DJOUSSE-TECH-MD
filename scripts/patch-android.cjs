'use strict';
// Patche le projet Android genere par Capacitor : manifeste + minSdk.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'android');

const mf = path.join(root, 'app', 'src', 'main', 'AndroidManifest.xml');
let x = fs.readFileSync(mf, 'utf8');

const perms = [
  'android.permission.INTERNET',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.WAKE_LOCK',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'
];
const missing = perms.filter(function (p) { return x.indexOf('android:name="' + p + '"') === -1; });
if (missing.length) {
  const block = missing.map(function (p) { return '    <uses-permission android:name="' + p + '" />'; }).join('\n');
  x = x.replace('</manifest>', block + '\n</manifest>');
}
if (x.indexOf('.BotService') === -1) {
  const comps = [
    '        <service android:name=".BotService" android:exported="false" android:foregroundServiceType="specialUse">',
    '            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="Execute localement le bot WhatsApp choisi par l utilisateur" />',
    '        </service>',
    '        <receiver android:name=".BootReceiver" android:exported="true">',
    '            <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED" /></intent-filter>',
    '        </receiver>'
  ].join('\n');
  x = x.replace('</application>', comps + '\n    </application>');
}
if (x.indexOf('android:largeHeap') === -1) {
  x = x.replace('<application', '<application android:largeHeap="true"');
}
fs.writeFileSync(mf, x);
console.log('  manifeste patche');

const vg = path.join(root, 'variables.gradle');
if (fs.existsSync(vg)) {
  let g = fs.readFileSync(vg, 'utf8');
  g = g.replace(/minSdkVersion\s*=\s*(\d+)/, function (m, n) { return 'minSdkVersion = ' + Math.max(24, parseInt(n, 10)); });
  fs.writeFileSync(vg, g);
  console.log('  minSdkVersion >= 24');
}