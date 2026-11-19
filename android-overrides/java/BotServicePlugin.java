package com.djoussetech.md;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Plugin natif appelé depuis la WebView : Capacitor.Plugins.BotService */
@CapacitorPlugin(name = "BotService")
public class BotServicePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Context c = getContext();
        Intent i = new Intent(c, BotService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), BotService.class));
        call.resolve();
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getActivity() != null
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7001);
        }
        call.resolve();
    }

    @PluginMethod
    public void isBatteryExempt(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject r = new JSObject();
        r.put("exempt", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(r);
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void openAutoStartSettings(PluginCall call) {
        String[][] targets = {
                {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
                {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
                {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
                {"com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity"}
        };
        for (String[] t : targets) {
            try {
                Intent i = new Intent();
                i.setComponent(new ComponentName(t[0], t[1]));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                JSObject r = new JSObject(); r.put("opened", "oem"); call.resolve(r);
                return;
            } catch (Exception ignored) { }
        }
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject(); r.put("opened", "details"); call.resolve(r);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void setPaired(PluginCall call) {
        SharedPreferences sp = getContext().getSharedPreferences("djousse", Context.MODE_PRIVATE);
        sp.edit().putBoolean("paired", Boolean.TRUE.equals(call.getBoolean("paired", false))).apply();
        call.resolve();
    }

    @PluginMethod
    public void deviceInfo(PluginCall call) {
        JSObject r = new JSObject();
        r.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        r.put("model", Build.MODEL);
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    /** Relance l'appli (au mieux) : après réinitialisation de session. */
    @PluginMethod
    public void restartApp(PluginCall call) {
        Context c = getContext();
        try {
            Intent li = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (li != null) {
                li.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                PendingIntent pi = PendingIntent.getActivity(c, 0, li, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_CANCEL_CURRENT);
                AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
                if (am != null) am.set(AlarmManager.RTC, System.currentTimeMillis() + 600, pi);
            }
            c.stopService(new Intent(c, BotService.class));
            call.resolve();
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override public void run() { System.exit(0); }
            }, 300);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }
}