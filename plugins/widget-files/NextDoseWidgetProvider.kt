package com.nusxa.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.graphics.Color
import android.net.Uri
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
 */
class NextDoseWidgetProvider : AppWidgetProvider() {

  companion object {
    const val ACTION_MARK_TAKEN = "com.nusxa.app.widget.MARK_TAKEN"
    const val EXTRA_SCHEDULE_ID = "schedule_id"
    const val EXTRA_MEDICINE_ID = "medicine_id"
    const val EXTRA_SCHEDULED_TIME = "scheduled_time"
    private const val DB_NAME = "nusxa.db"

    /**
     * Refresh every placed instance of the widget. Called from
     * MainActivity.onResume so the widget catches dose changes the user
     * made inside the app (which lives in another process/thread).
     */
    @JvmStatic
    fun refreshAll(context: Context) {
      try {
        val manager = AppWidgetManager.getInstance(context) ?: return
        val ids = manager.getAppWidgetIds(
          ComponentName(context, NextDoseWidgetProvider::class.java)
        )
        if (ids.isEmpty()) return
        NextDoseWidgetProvider().onUpdate(context, manager, ids)
      } catch (e: Exception) {
        // Widget host unavailable — nothing to refresh
      }
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_MARK_TAKEN -> {
        val scheduleId = intent.getStringExtra(EXTRA_SCHEDULE_ID)
        val medicineId = intent.getStringExtra(EXTRA_MEDICINE_ID)
        val scheduledTime = intent.getStringExtra(EXTRA_SCHEDULED_TIME)
        if (scheduleId != null && medicineId != null && scheduledTime != null) {
          markTaken(context, scheduleId, medicineId, scheduledTime)
        }
        // Reflect the new state immediately, then fall through to re-render
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(
          ComponentName(context, NextDoseWidgetProvider::class.java)
        )
        onUpdate(context, manager, ids)
        return
      }
      Intent.ACTION_DATE_CHANGED, Intent.ACTION_TIME_CHANGED -> {
        // Day rolled over (or clock changed) — recompute "today's" dose
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

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  private fun updateWidget(
    context: Context,
    manager: AppWidgetManager,
    widgetId: Int
  ) {
    val views = RemoteViews(context.packageName, R.layout.widget_next_dose)

    // Tapping the card itself opens the app (Home tab via nusxa:// scheme)
    views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context))

    val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    val state = readTodayState(context, today)

    val next = state.next
    if (next != null) {
      views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_label))
      views.setTextViewText(R.id.widget_medicine, next.name)
      views.setTextViewText(
        R.id.widget_detail,
        buildDetail(next.dosage, formatTime12h(next.time))
      )
      views.setViewVisibility(R.id.widget_taken_button, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.widget_taken_button,
        markTakenIntent(context, widgetId, next, today)
      )
    } else if (state.totalScheduled > 0) {
      views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_label))
      views.setTextViewText(R.id.widget_medicine, context.getString(R.string.widget_all_done))
      views.setTextViewText(R.id.widget_detail, "")
      views.setViewVisibility(R.id.widget_taken_button, View.GONE)
    } else {
      views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_label))
      views.setTextViewText(R.id.widget_medicine, context.getString(R.string.widget_no_doses))
      views.setTextViewText(R.id.widget_detail, "")
      views.setViewVisibility(R.id.widget_taken_button, View.GONE)
    }

    views.setTextColor(R.id.widget_title, Color.parseColor("#93A5D6"))
    views.setTextColor(R.id.widget_medicine, Color.WHITE)
    views.setTextColor(R.id.widget_detail, Color.parseColor("#C9D4F2"))

    manager.updateAppWidget(widgetId, views)
  }

  private fun buildDetail(dosage: String?, time12h: String): String {
    val trimmed = dosage?.trim().orEmpty()
    return if (trimmed.isEmpty()) time12h else "$trimmed  •  $time12h"
  }

  private fun formatTime12h(time24: String): String {
    return try {
      val parsed = SimpleDateFormat("HH:mm", Locale.US).parse(time24) ?: return time24
      SimpleDateFormat("h:mm a", Locale.getDefault()).format(parsed)
    } catch (e: Exception) {
      time24
    }
  }

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
    val totalScheduled: Int
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
    val db = openDb(context) ?: return TodayState(null, 0)
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

      TodayState(next, total)
    } catch (e: Exception) {
      TodayState(null, 0)
    } finally {
      try { db.close() } catch (e: Exception) { /* already closed */ }
    }
  }

  /**
   * Mirrors upsertDoseStatus(): one record per schedule per day — update
   * the existing row when present, insert otherwise. Also decrements
   * inventory exactly like the Home screen does when a dose is taken.
   */
  private fun markTaken(
    context: Context,
    scheduleId: String,
    medicineId: String,
    scheduledTime: String
  ) {
    val db = openDb(context) ?: return
    try {
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
    } catch (e: Exception) {
      // Never crash the widget host over a write failure; the next
      // refresh will show the unchanged state.
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
