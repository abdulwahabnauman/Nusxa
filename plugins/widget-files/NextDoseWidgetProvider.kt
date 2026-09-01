package com.nusxa.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

/**
 * Home-screen widget: today's NEXT dose with a one-tap "Taken" button.
 *
 * It reads the same SQLite database the React Native app uses
 * (expo-sqlite v16 keeps it at files/SQLite/nusxa.db inside the app's data
 * directory; older SDKs used databases/nusxa.db) and writes dose records in
 * the exact shape of the app's
 * `upsertDoseStatus()` so Home, History and Analytics stay in sync —
 * including the per-day "one record per slot" rule and the inventory
 * decrement the app performs when a dose is taken.
 *
 * States (the widget follows the same before-time rule as the app):
 *  - A dose whose time has arrived: full card + Taken button.
 *  - Nothing due yet but doses coming later: a "Coming Up" hint such as
 *    "2 to take in Afternoon" (localized via profile.language, with
 *    Eastern numerals in Urdu) and no action button.
 *  - Everything handled today / nothing scheduled today.
 *
 * Animations (RemoteViews only allow a narrow set, hence these choices):
 *  - Tapping Taken crossfades the dose card to a brief "Dose taken" pane
 *    via a ViewFlipper, then flips back to the next dose ~1.5s later.
 *  - The Taken button uses a ripple drawable for press feedback.
 *  - A live "Due in Xh Ym" line is refreshed by a 15-minute inexact alarm,
 *    and switches to a ticking Chronometer once the dose is overdue.
 *  - Today's progress renders as filled/empty dots that fill as doses are
 *    taken (flipping back in after each Taken tap animates the change).
 *
 * A second, smaller widget (NextDoseCompactWidgetProvider) reuses this
 * entire class with a trimmed layout so users can pick either size.
 */
open class NextDoseWidgetProvider : AppWidgetProvider() {

  companion object {
    const val ACTION_MARK_TAKEN = "com.nusxa.app.widget.MARK_TAKEN"
    const val ACTION_SCHEDULED_REFRESH = "com.nusxa.app.widget.SCHEDULED_REFRESH"
    const val EXTRA_SCHEDULE_ID = "schedule_id"
    const val EXTRA_MEDICINE_ID = "medicine_id"
    const val EXTRA_SCHEDULED_TIME = "scheduled_time"
    private const val DB_NAME = "nusxa.db"

    /** How long the success pane stays visible before flipping back */
    private const val SUCCESS_PANE_DELAY_MS = 1500L

    /** Keep "Due in ..." text fresh between app opens (battery-friendly) */
    private const val REFRESH_INTERVAL_MS = 15 * 60 * 1000L

    /** Beyond this many doses the dots degrade to a "3 of 12 taken" label */
    private const val MAX_PROGRESS_DOTS = 8

    private val PROVIDERS = arrayOf(
      NextDoseWidgetProvider::class.java,
      NextDoseCompactWidgetProvider::class.java,
    )

    /**
     * Refresh every placed instance of both widget sizes. Called from
     * MainActivity.onResume so the widgets catch dose changes the user
     * made inside the app (which lives in another process/thread).
     */
    @JvmStatic
    fun refreshAll(context: Context) {
      try {
        val manager = AppWidgetManager.getInstance(context) ?: return
        for (provider in PROVIDERS) {
          val ids = manager.getAppWidgetIds(ComponentName(context, provider))
          if (ids.isEmpty()) continue
          provider.getDeclaredConstructor().newInstance()
            .let { it as AppWidgetProvider }
            .onUpdate(context, manager, ids)
        }
      } catch (e: Exception) {
        // Widget host unavailable — nothing to refresh
      }
    }

    /** True when neither widget size has any placed instances */
    private fun hasNoInstances(context: Context): Boolean {
      val manager = AppWidgetManager.getInstance(context) ?: return true
      return PROVIDERS.all {
        manager.getAppWidgetIds(ComponentName(context, it)).isEmpty()
      }
    }
  }

  /** Layout this provider renders; the compact variant overrides it. */
  protected open fun layoutRes(): Int = R.layout.widget_next_dose

  /** Compact hides the title and progress rows to fit a ~2x1 cell. */
  protected open fun isCompact(): Boolean = false

  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_MARK_TAKEN -> {
        val scheduleId = intent.getStringExtra(EXTRA_SCHEDULE_ID)
        val medicineId = intent.getStringExtra(EXTRA_MEDICINE_ID)
        val scheduledTime = intent.getStringExtra(EXTRA_SCHEDULED_TIME)
        val taken = if (scheduleId != null && medicineId != null && scheduledTime != null) {
          markTaken(context, scheduleId, medicineId, scheduledTime)
        } else {
          false
        }
        if (taken) {
          // Crossfade to the success pane on every placed instance, then
          // flip back to the (now advanced) next dose shortly after.
          // goAsync() keeps this broadcast alive for the delayed re-render.
          val pending = goAsync()
          showSuccessPane(context)
          Handler(Looper.getMainLooper()).postDelayed({
            try {
              refreshAll(context)
            } finally {
              pending.finish()
            }
          }, SUCCESS_PANE_DELAY_MS)
        } else {
          // Rejected (e.g. a stale tap on a dose whose time never arrived)
          // — just re-render the current state without celebrating.
          refreshAll(context)
        }
        return
      }
      ACTION_SCHEDULED_REFRESH -> {
        // 15-minute alarm: keep the "Due in ..." countdown accurate
        refreshAll(context)
        return
      }
      Intent.ACTION_DATE_CHANGED, Intent.ACTION_TIME_CHANGED -> {
        // Day rolled over (or clock changed) — recompute "today's" doses
        refreshAll(context)
        return
      }
    }
    super.onReceive(context, intent)
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    for (widgetId in appWidgetIds) {
      updateWidget(context, appWidgetManager, widgetId)
    }
  }

  override fun onEnabled(context: Context) {
    // First instance of either size placed — start the refresh alarm
    schedulePeriodicRefresh(context)
  }

  override fun onDisabled(context: Context) {
    // Last instance of THIS size removed; only stop the alarm when no
    // instance of either size remains
    if (hasNoInstances(context)) {
      cancelPeriodicRefresh(context)
    }
  }

  // ------------------------------------------------------------------
  // Periodic countdown refresh
  // ------------------------------------------------------------------

  private fun refreshAlarmIntent(context: Context): PendingIntent {
    val intent = Intent(context, NextDoseWidgetProvider::class.java)
      .setAction(ACTION_SCHEDULED_REFRESH)
    return PendingIntent.getBroadcast(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun schedulePeriodicRefresh(context: Context) {
    try {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarmManager.setInexactRepeating(
        AlarmManager.ELAPSED_REALTIME,
        SystemClock.elapsedRealtime() + REFRESH_INTERVAL_MS,
        AlarmManager.INTERVAL_FIFTEEN_MINUTES,
        refreshAlarmIntent(context)
      )
    } catch (e: Exception) {
      // Countdown simply refreshes on app resume instead
    }
  }

  private fun cancelPeriodicRefresh(context: Context) {
    try {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarmManager.cancel(refreshAlarmIntent(context))
    } catch (e: Exception) {
      // Nothing to cancel
    }
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  private fun updateWidget(
    context: Context,
    manager: AppWidgetManager,
    widgetId: Int
  ) {
    val views = RemoteViews(context.packageName, layoutRes())

    // Regular refreshes snap back to the dose card without animating —
    // only the post-Taken flip uses in/out animations, so routine updates
    // (app resume, date rollover) never flicker.
    views.setInt(R.id.widget_flipper, "setDisplayedChild", 0)

    // Tapping the card itself opens the app (Home tab via nusxa:// scheme)
    views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context))

    val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    val state = readTodayState(context, today)

    val next = state.next
    if (next != null) {
      views.setTextViewText(R.id.widget_medicine, next.name)
      views.setTextViewText(
        R.id.widget_detail,
        buildDetail(next.dosage, formatTime12h(next.time))
      )
      applyCountdown(context, views, next.time, today)
      views.setViewVisibility(R.id.widget_taken_button, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.widget_taken_button,
        markTakenIntent(context, widgetId, next, today)
      )
    } else if (state.totalScheduled > 0) {
      views.setTextViewText(R.id.widget_medicine, context.getString(R.string.widget_all_done))
      views.setTextViewText(R.id.widget_detail, "")
      views.setViewVisibility(R.id.widget_countdown_text, View.GONE)
      views.setChronometer(R.id.widget_countdown_timer, SystemClock.elapsedRealtime(), null, false)
      views.setViewVisibility(R.id.widget_countdown_timer, View.GONE)
      views.setViewVisibility(R.id.widget_taken_button, View.GONE)
    } else {
      views.setTextViewText(R.id.widget_medicine, context.getString(R.string.widget_no_doses))
      views.setTextViewText(R.id.widget_detail, "")
      views.setViewVisibility(R.id.widget_countdown_text, View.GONE)
      views.setChronometer(R.id.widget_countdown_timer, SystemClock.elapsedRealtime(), null, false)
      views.setViewVisibility(R.id.widget_countdown_timer, View.GONE)
      views.setViewVisibility(R.id.widget_taken_button, View.GONE)
    }

    applyProgress(context, views, state)

    if (!isCompact()) {
      views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_label))
      views.setTextColor(R.id.widget_title, Color.parseColor("#93A5D6"))
    }
    views.setTextColor(R.id.widget_medicine, Color.WHITE)
    views.setTextColor(R.id.widget_detail, Color.parseColor("#C9D4F2"))

    manager.updateAppWidget(widgetId, views)
  }

  /**
   * "Due in Xh Ym" while the dose is in the future; once it passes, a
   * Chronometer takes over and ticks "Overdue MM:SS" every second with
   * zero battery cost (the widget host drives the ticker).
   */
  private fun applyCountdown(
    context: Context,
    views: RemoteViews,
    time24: String,
    today: String
  ) {
    val scheduled = parseScheduled("$today $time24")
    if (scheduled == null) {
      views.setViewVisibility(R.id.widget_countdown_text, View.GONE)
      views.setChronometer(R.id.widget_countdown_timer, SystemClock.elapsedRealtime(), null, false)
      views.setViewVisibility(R.id.widget_countdown_timer, View.GONE)
      return
    }

    val remainingMs = scheduled.time - System.currentTimeMillis()
    if (remainingMs > 0) {
      val label = context.getString(
        R.string.widget_due_in_format,
        formatDuration(remainingMs)
      )
      views.setTextViewText(R.id.widget_countdown_text, label)
      views.setTextColor(R.id.widget_countdown_text, Color.parseColor("#93A5D6"))
      views.setViewVisibility(R.id.widget_countdown_text, View.VISIBLE)
      views.setChronometer(R.id.widget_countdown_timer, SystemClock.elapsedRealtime(), null, false)
      views.setViewVisibility(R.id.widget_countdown_timer, View.GONE)
    } else {
      views.setViewVisibility(R.id.widget_countdown_text, View.GONE)
      // Chronometer base is in the elapsedRealtime() domain: rewind it by
      // how long ago the dose was due so it displays elapsed overdue time
      val base = SystemClock.elapsedRealtime() + remainingMs
      val format = context.getText(R.string.widget_overdue_format).toString()
      views.setChronometer(R.id.widget_countdown_timer, base, format, true)
      views.setTextColor(R.id.widget_countdown_timer, Color.parseColor("#FBBF24"))
      views.setViewVisibility(R.id.widget_countdown_timer, View.VISIBLE)
    }
  }

  /**
   * Today's progress as filled/empty dots (taken vs pending). RemoteViews
   * re-applies actions onto the live hierarchy, so clear previous dots
   * before adding to avoid duplicates across refreshes.
   */
  private fun applyProgress(context: Context, views: RemoteViews, state: TodayState) {
    val total = state.totalScheduled
    val taken = state.takenToday
    views.removeAllViews(R.id.widget_progress)

    if (isCompact() || total <= 0) {
      views.setViewVisibility(R.id.widget_progress, View.GONE)
      views.setViewVisibility(R.id.widget_progress_text, View.GONE)
      return
    }

    if (total <= MAX_PROGRESS_DOTS) {
      repeat(total) { index ->
        val dot = RemoteViews(context.packageName, R.layout.widget_dot)
        dot.setImageViewResource(
          R.id.widget_dot_image,
          if (index < taken) R.drawable.widget_dot_filled else R.drawable.widget_dot_empty
        )
        views.addView(R.id.widget_progress, dot)
      }
      views.setViewVisibility(R.id.widget_progress, View.VISIBLE)
      views.setViewVisibility(R.id.widget_progress_text, View.GONE)
    } else {
      views.setViewVisibility(R.id.widget_progress, View.GONE)
      views.setTextViewText(
        R.id.widget_progress_text,
        context.getString(R.string.widget_progress_format, taken, total)
      )
      views.setTextColor(R.id.widget_progress_text, Color.parseColor("#93A5D6"))
      views.setViewVisibility(R.id.widget_progress_text, View.VISIBLE)
    }
  }

  /**
   * Crossfade every placed instance (both sizes) to the success pane.
   * The ViewFlipper's in/out animations are declared in the layout XML,
   * so changing the displayed child animates as the RemoteViews apply.
   */
  private fun showSuccessPane(context: Context) {
    try {
      val manager = AppWidgetManager.getInstance(context) ?: return
      val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
      val state = readTodayState(context, today)
      val leftToday = state.totalScheduled - state.takenToday
      val subtitle = if (leftToday > 0) {
        context.getString(R.string.widget_success_left_format, leftToday)
      } else {
        context.getString(R.string.widget_success_all_done)
      }

      for (provider in PROVIDERS) {
        val ids = manager.getAppWidgetIds(ComponentName(context, provider))
        if (ids.isEmpty()) continue
        val instance = provider.getDeclaredConstructor().newInstance() as NextDoseWidgetProvider
        for (widgetId in ids) {
          val views = RemoteViews(context.packageName, instance.layoutRes())
          views.setOnClickPendingIntent(R.id.widget_success_root, instance.openAppIntent(context))
          views.setTextViewText(R.id.widget_success_detail, subtitle)
          views.setInt(R.id.widget_flipper, "setDisplayedChild", 1)
          manager.updateAppWidget(widgetId, views)
        }
      }
    } catch (e: Exception) {
      // If the morph fails the delayed refresh still renders the next dose
    }
  }

  // ------------------------------------------------------------------
  // Formatting helpers
  // ------------------------------------------------------------------

  private fun buildDetail(dosage: String?, time12h: String): String {
    val trimmed = dosage?.trim().orEmpty()
    return if (trimmed.isEmpty()) time12h else "$trimmed  •  $time12h"
  }

  /** Pick a string by the app language stored in the profile table. */
  private fun pick(language: String, en: String, ur: String): String =
    if (language == "ur") ur else en

  /** Day-part bucket mirroring getDayPart() in src/utils/date.ts */
  private fun getDayPart(hour: Int): Int = when {
    hour in 5..11 -> 0 // morning
    hour in 12..16 -> 1 // afternoon
    else -> 2 // night
  }

  private fun hourOf(time24: String): Int =
    time24.substringBefore(':').toIntOrNull() ?: 0

  private fun formatTime12h(time24: String): String {
    return try {
      val parsed = SimpleDateFormat("HH:mm", Locale.US).parse(time24) ?: return time24
      SimpleDateFormat("h:mm a", Locale.getDefault()).format(parsed)
    } catch (e: Exception) {
      time24
    }
  }

  private fun parseScheduled(yyyyMmDdHhMm: String): Date? {
    return try {
      SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).parse(yyyyMmDdHhMm)
    } catch (e: Exception) {
      null
    }
  }

  private fun formatDuration(ms: Long): String {
    val totalMinutes = (ms + 59_999) / 60_000 // round up: 1 minute until due reads "1m"
    val hours = totalMinutes / 60
    val minutes = totalMinutes % 60
    return when {
      hours > 0 && minutes > 0 -> "${hours}h ${minutes}m"
      hours > 0 -> "${hours}h"
      else -> "${minutes}m"
    }
  }

  // ------------------------------------------------------------------
  // Intents
  // ------------------------------------------------------------------

  private fun openAppIntent(context: Context): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nusxa://"), context, MainActivity::class.java)
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun markTakenIntent(
    context: Context,
    widgetId: Int,
    next: NextDose,
    today: String
  ): PendingIntent {
    val intent = Intent(context, NextDoseWidgetProvider::class.java)
      .setAction(ACTION_MARK_TAKEN)
      .putExtra(EXTRA_SCHEDULE_ID, next.scheduleId)
      .putExtra(EXTRA_MEDICINE_ID, next.medicineId)
      // Same shape the app uses: "<yyyy-MM-dd>T<HH:mm>"
      .putExtra(EXTRA_SCHEDULED_TIME, "${today}T${next.time}")
    return PendingIntent.getBroadcast(
      context,
      widgetId,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  // ------------------------------------------------------------------
  // Database access (mirrors src/db/repositories queries)
  // ------------------------------------------------------------------

  private data class NextDose(
    val scheduleId: String,
    val medicineId: String,
    val name: String,
    val dosage: String?,
    val time: String
  )

  private data class TodayState(
    val next: NextDose?,
    val totalScheduled: Int,
    val takenToday: Int
  )

  private fun openDb(context: Context): SQLiteDatabase? {
    return try {
      val path = resolveDbPath(context) ?: return null
      SQLiteDatabase.openDatabase(path.absolutePath, null, SQLiteDatabase.OPEN_READWRITE)
    } catch (e: Exception) {
      null
    }
  }

  /**
   * expo-sqlite v16 (Expo SDK 54) stores databases in files/SQLite/ instead
   * of the classic databases/ directory. Prefer the current location and fall
   * back to the legacy path for installs upgraded from older SDKs.
   */
  private fun resolveDbPath(context: Context): java.io.File? {
    val modern = java.io.File(context.filesDir, "SQLite/$DB_NAME")
    if (modern.exists()) return modern
    val legacy = context.getDatabasePath(DB_NAME)
    if (legacy.exists()) return legacy
    return null
  }

  private fun readTodayState(context: Context, today: String): TodayState {
    val db = openDb(context) ?: return TodayState(null, 0, 0)
    return try {
      // Active slots for today, mirroring getActiveSchedules(): active
      // schedule + active prescription + not soft-deleted, within the
      // schedule's start/end dates, and not yet addressed today (no dose
      // record for this schedule on this day — Home treats such slots as
      // pending, records only exist once taken/skipped/missed).
      val todaySql = """
        SELECT s.id AS sid, s.medicine_id AS mid, s.time AS stime,
               COALESCE(NULLIF(m.name, ''), NULLIF(m.generic_name, ''), NULLIF(m.brand_name, ''), NULL) AS mname,
               m.dosage AS mdosage
        FROM schedules s
        INNER JOIN medicines m ON m.id = s.medicine_id
        INNER JOIN prescriptions p ON m.prescription_id = p.id
        WHERE s.is_active = 1 AND p.treatment_status = 'active'
          AND m.deleted_at IS NULL AND p.deleted_at IS NULL
          AND s.start_date <= ?
          AND (s.end_date IS NULL OR s.end_date >= ?)
          AND NOT EXISTS (
            SELECT 1 FROM dose_records d
            WHERE d.schedule_id = s.id AND substr(d.scheduled_time, 1, 10) = ?
          )
        ORDER BY s.time ASC
      """.trimIndent()

      var next: NextDose? = null
      var pending = 0
      db.rawQuery(todaySql, arrayOf(today, today, today)).use { cursor ->
        while (cursor.moveToNext()) {
          pending++
          if (next == null) {
            next = NextDose(
              scheduleId = cursor.getString(0),
              medicineId = cursor.getString(1),
              time = cursor.getString(2) ?: "",
              name = cursor.getString(3) ?: "Medicine",
              dosage = cursor.getString(4)
            )
          }
        }
      }

      val totalSql = """
        SELECT COUNT(*) FROM schedules s
        INNER JOIN medicines m ON m.id = s.medicine_id
        INNER JOIN prescriptions p ON m.prescription_id = p.id
        WHERE s.is_active = 1 AND p.treatment_status = 'active'
          AND m.deleted_at IS NULL AND p.deleted_at IS NULL
          AND s.start_date <= ?
          AND (s.end_date IS NULL OR s.end_date >= ?)
      """.trimIndent()
      var total = 0
      db.rawQuery(totalSql, arrayOf(today, today)).use { cursor ->
        if (cursor.moveToFirst()) total = cursor.getInt(0)
      }

      // Doses already taken today (any schedule) — fills the progress dots
      val takenSql = """
        SELECT COUNT(*) FROM dose_records
        WHERE substr(scheduled_time, 1, 10) = ? AND status = 'taken'
      """.trimIndent()
      var taken = 0
      db.rawQuery(takenSql, arrayOf(today)).use { cursor ->
        if (cursor.moveToFirst()) taken = cursor.getInt(0)
      }

      TodayState(next, total, taken)
    } catch (e: Exception) {
      TodayState(null, 0, 0)
    } finally {
      try { db.close() } catch (e: Exception) { /* already closed */ }
    }
  }

  /**
   * Mirrors upsertDoseStatus(): one record per schedule per day — update
   * the existing row when present, insert otherwise. Also decrements
   * inventory exactly like the Home screen does when a dose is taken.
   * Returns false (no write) when the scheduled time has not arrived yet,
   * so a stale button can never mark a future dose as taken.
   */
  private fun markTaken(
    context: Context,
    scheduleId: String,
    medicineId: String,
    scheduledTime: String
  ): Boolean {
    val scheduled = parseScheduled(scheduledTime.replace('T', ' '))
    if (scheduled == null || scheduled.time > System.currentTimeMillis()) return false

    val db = openDb(context) ?: return false
    return try {
      val day = scheduledTime.take(10)
      val now = isoNow()
      val existingId = db.rawQuery(
        "SELECT id FROM dose_records WHERE schedule_id = ? AND scheduled_time LIKE ? LIMIT 1",
        arrayOf(scheduleId, "$day%")
      ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }

      if (existingId != null) {
        db.execSQL(
          "UPDATE dose_records SET status = 'taken', actual_time = ?, updated_at = ? WHERE id = ?",
          arrayOf<Any>(now, now, existingId)
        )
      } else {
        val id = "${System.currentTimeMillis()}-${randomSuffix()}"
        db.execSQL(
          """INSERT INTO dose_records
             (id, schedule_id, medicine_id, scheduled_time, actual_time, status, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'taken', NULL, ?, ?)""",
          arrayOf<Any>(id, scheduleId, medicineId, scheduledTime, now, now, now)
        )
      }

      // Same inventory rule as Home: decrement only when a count is tracked
      db.execSQL(
        """UPDATE medicines
           SET remaining_quantity = remaining_quantity - 1, updated_at = ?
           WHERE id = ? AND remaining_quantity IS NOT NULL AND remaining_quantity > 0""",
        arrayOf<Any>(now, medicineId)
      )
      true
    } catch (e: Exception) {
      // Never crash the widget host over a write failure; the next
      // refresh will show the unchanged state.
      false
    } finally {
      try { db.close() } catch (e: Exception) { /* already closed */ }
    }
  }

  private fun isoNow(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = java.util.TimeZone.getTimeZone("UTC")
    return formatter.format(Date())
  }

  private fun randomSuffix(): String {
    val chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    return (1..7).map { chars[Random.nextInt(chars.length)] }.joinToString("")
  }
}

/**
 * The smaller widget variant. Same provider logic, trimmed layout, so the
 * user can place whichever size fits their home screen.
 */
class NextDoseCompactWidgetProvider : NextDoseWidgetProvider() {
  override fun layoutRes(): Int = R.layout.widget_next_dose_compact
  override fun isCompact(): Boolean = true
}
