package com.djoussetech.md;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;

/** Après un redémarrage : Android interdit de relancer l'appli depuis le fond,
 *  on affiche donc une notification que l'utilisateur touche pour relancer le bot. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (i == null || !Intent.ACTION_BOOT_COMPLETED.equals(i.getAction())) return;
        SharedPreferences sp = c.getSharedPreferences("djousse", Context.MODE_PRIVATE);
        if (!sp.getBoolean("paired", false)) return;
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= 26) {
                nm.createNotificationChannel(new NotificationChannel("djousse_boot", "Redémarrage", NotificationManager.IMPORTANCE_HIGH));
            }
            Intent open = new Intent(c, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = new NotificationCompat.Builder(c, "djousse_boot")
                    .setContentTitle("Téléphone redémarré")
                    .setContentText("Touchez pour relancer DJOUSSE TECH MD")
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .build();
            nm.notify(2002, n);
        } catch (Exception ignored) { }
    }
}