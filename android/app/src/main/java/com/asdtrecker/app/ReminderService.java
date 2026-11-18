package com.asdtrecker.app;

import android.app.*;
import android.app.job.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;

/** Local, persisted reminder job. Android may defer delivery while idle. */
public final class ReminderService extends JobService {
    static final int JOB = 90210;
    static final String CHANNEL = "finance-reminders";
    static android.content.SharedPreferences prefs(Context c) { return c.getSharedPreferences("preferences", MODE_PRIVATE); }
    static String language(Context c) { return prefs(c).getString("language", "ru"); }
    static String text(Context c, String ru, String uz, String en) { String l=language(c); return "uz".equals(l)?uz:"en".equals(l)?en:ru; }
    static void schedule(Context c) {
        JobScheduler jobs=(JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE);
        if(!prefs(c).getBoolean("reminders",false)){jobs.cancel(JOB);return;}
        if(jobs.getPendingJob(JOB)==null) jobs.schedule(new JobInfo.Builder(JOB,new ComponentName(c,ReminderService.class)).setPeriodic(90*60*1000L,15*60*1000L).setPersisted(true).build());
    }
    static void channel(Context c) {
        NotificationManager manager=(NotificationManager)c.getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel channel=new NotificationChannel(CHANNEL,text(c,"Записи о финансах","Moliyaviy qaydlar","Finance reminders"),NotificationManager.IMPORTANCE_DEFAULT);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }
    @Override public boolean onStartJob(JobParameters params) {
        if(!prefs(this).getBoolean("reminders",false))return false;
        channel(this);
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(!manager.areNotificationsEnabled() || (Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED))return false;
        String[][] messages={
            {"Были покупки или доходы? Запишите их, пока всё помните.","Xarid yoki daromad bo‘ldimi? Yodingizdaligida qayd eting.","Any purchases or income? Log them while they are fresh."},
            {"Полторы минуты для порядка: добавьте последние расходы и доходы.","Tartib uchun bir daqiqa: so‘nggi xarajat va daromadlarni kiriting.","A minute for clarity: add your latest expenses and income."},
            {"Даже маленькая покупка важна. Обновите свои записи.","Kichik xarid ham muhim. Qaydlaringizni yangilang.","Even a small purchase counts. Update your records."},
            {"Что изменилось в кошельке? Отметьте траты и поступления.","Hamyoningizda nima o‘zgardi? Xarajat va tushumlarni belgilang.","What changed in your wallet? Record spending and incoming money."},
            {"Сделайте паузу: внесите сегодняшние финансовые события.","Bir zum to‘xtang: bugungi moliyaviy voqealarni yozing.","Take a short pause and record today’s money activity."},
            {"Память может подвести, записи — нет. Добавьте операции.","Xotira adashishi mumkin, qaydlar esa qoladi. Amaliyotlarni qo‘shing.","Memory can fade; records stay. Add your transactions."},
            {"Кофе, дорога, зарплата — всё найдёт своё место в трекере.","Qahva, yo‘lkira, ish haqi — barchasini trekerga yozing.","Coffee, travel, payday — give each one a place in your tracker."},
            {"Ваш бюджет станет понятнее после пары новых записей.","Bir necha yangi qayd budjetingizni tushunarli qiladi.","A few new entries can make your budget clearer."},
            {"Есть незаписанные расходы? Сейчас удобный момент их добавить.","Yozilmagan xarajatlar bormi? Ularni hozir kiriting.","Any unrecorded expenses? Now is a good time to add them."},
            {"Получили деньги? Не забудьте отметить и доходы.","Pul oldingizmi? Daromadlarni ham qayd etishni unutmang.","Received money? Remember to record your income too."},
            {"Небольшая привычка сегодня — ясная статистика завтра.","Bugungi kichik odat — ertangi aniq statistika.","A small habit today makes clearer statistics tomorrow."},
            {"Проверьте последние полтора часа: что потратили или получили?","So‘nggi bir yarim soatni eslang: qancha sarfladingiz yoki oldingiz?","Look back over the last 90 minutes: what did you spend or receive?"}
        };
        int index=prefs(this).getInt("reminderIndex",0)%messages.length;
        String l=language(this);String body=messages[index]["uz".equals(l)?1:"en".equals(l)?2:0];
        PendingIntent open=PendingIntent.getActivity(this,JOB,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification n=new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_launcher).setContentTitle("ASDTrecker").setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).build();
        try{manager.notify(JOB,n);prefs(this).edit().putInt("reminderIndex",(index+1)%messages.length).apply();}catch(SecurityException ignored){}
        return false;
    }
    @Override public boolean onStopJob(JobParameters p){return false;}
}
