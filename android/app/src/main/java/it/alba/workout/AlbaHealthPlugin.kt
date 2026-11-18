package it.alba.workout

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.reflect.KClass

/**
 * Legge da Health Connect: sonno, frequenza a riposo e HRV (recupero); passi, distanza, calorie e sessioni di allenamento (attività).
 * I permessi di attività sono separati: se non li concedi, il recupero funziona lo stesso.
 * L'HRV si carica per nome di classe: se la versione di Health Connect non la conosce, l'app continua con il resto.
 */
@CapacitorPlugin(name = "AlbaHealth")
class AlbaHealthPlugin : Plugin() {
    private val client by lazy { HealthConnectClient.getOrCreate(context.applicationContext) }
    private val contract by lazy { PermissionController.createRequestPermissionResultContract() }

    @Suppress("UNCHECKED_CAST")
    private val hrvClass: KClass<out Record>? by lazy {
        try { Class.forName("androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord").kotlin as KClass<out Record> } catch (e: Throwable) { null }
    }

    private fun activityPerms(): Set<String> = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
    )

    private fun wanted(): Set<String> {
        val s = mutableSetOf(
            HealthPermission.getReadPermission(SleepSessionRecord::class),
            HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        )
        hrvClass?.let { s.add(HealthPermission.getReadPermission(it)) }
        return s
    }

    private fun allWanted(): Set<String> = wanted() + activityPerms()

    private fun result(granted: Set<String>): JSObject =
        JSObject().put("granted", granted.containsAll(wanted())).put("activity", granted.containsAll(activityPerms())).put("count", granted.size)

    @PluginMethod
    fun status(call: PluginCall) {
        val a = when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update"
            else -> "unsupported"
        }
        call.resolve(JSObject().put("availability", a).put("hrvSupported", hrvClass != null))
    }

    @PluginMethod
    fun check(call: PluginCall) {
        activity.lifecycleScope.launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                call.resolve(result(granted))
            } catch (e: Throwable) { call.reject(e.message ?: "check non riuscito") }
        }
    }

    @PluginMethod
    fun request(call: PluginCall) {
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
            val i = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata"))
            i.setPackage("com.android.vending")
            activity.startActivity(i)
            call.reject("Installa o aggiorna Health Connect, poi riprova.")
            return
        }
        startActivityForResult(call, contract.createIntent(context, allWanted()), "onPermissions")
    }

    @ActivityCallback
    fun onPermissions(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val granted = contract.parseResult(result.resultCode, result.data)
        call.resolve(result(granted))
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try { activity.startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)); call.resolve() } catch (e: Throwable) { call.reject("Impossibile aprire Health Connect") }
    }

    private class Day { var sleep = 0L; var hasSleep = false; var hr: Long? = null; var hrv: Double? = null }

    @PluginMethod
    fun readDaily(call: PluginCall) {
        val days = call.getInt("days") ?: 30
        activity.lifecycleScope.launch {
            try {
                val zone = ZoneId.systemDefault()
                val end = Instant.now()
                val start = LocalDate.now(zone).minusDays(days.toLong()).atStartOfDay(zone).toInstant()
                val range = TimeRangeFilter.between(start, end)
                val map = sortedMapOf<String, Day>()
                fun day(i: Instant) = map.getOrPut(i.atZone(zone).toLocalDate().toString()) { Day() }

                // Sonno: la notte si assegna al giorno del risveglio; si contano solo le fasi di sonno vero.
                val sleep = client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range, pageSize = 500)).records
                // Lo stesso sonno può essere scritto più volte (due app, o una nuova sincronizzazione): si uniscono gli
                // intervalli che si sovrappongono, così ogni minuto di sonno si conta una volta sola.
                val intervals = mutableMapOf<String, MutableList<Pair<Instant, Instant>>>()
                for (r in sleep) {
                    if (Duration.between(r.startTime, r.endTime).toMinutes() < 45) continue
                    val list = intervals.getOrPut(r.endTime.atZone(zone).toLocalDate().toString()) { mutableListOf() }
                    if (r.stages.isEmpty()) list.add(Pair(r.startTime, r.endTime))
                    else r.stages.filter { it.stage == 2 || it.stage == 4 || it.stage == 5 || it.stage == 6 }.forEach { list.add(Pair(it.startTime, it.endTime)) }
                }
                for ((k, list) in intervals) {
                    if (list.isEmpty()) continue
                    list.sortBy { it.first }
                    var cs = list[0].first
                    var ce = list[0].second
                    var total = 0L
                    for (i in 1 until list.size) {
                        val a2 = list[i].first
                        val b2 = list[i].second
                        if (a2 <= ce) { if (b2 > ce) ce = b2 } else { total += Duration.between(cs, ce).toMinutes(); cs = a2; ce = b2 }
                    }
                    total += Duration.between(cs, ce).toMinutes()
                    val d = map.getOrPut(k) { Day() }
                    d.sleep = total
                    d.hasSleep = true
                }
                val rhr = client.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, range, pageSize = 500)).records
                for (r in rhr.sortedBy { it.time }) day(r.time).hr = r.beatsPerMinute

                var hrvFound = 0
                hrvClass?.let { cls ->
                    try {
                        val recs = client.readRecords(ReadRecordsRequest(cls, range, pageSize = 500)).records
                        val byDay = mutableMapOf<String, MutableList<Double>>()
                        for (r in recs) {
                            val t = r.javaClass.getMethod("getTime").invoke(r) as Instant
                            val v = r.javaClass.getMethod("getHeartRateVariabilityMillis").invoke(r) as Double
                            byDay.getOrPut(t.atZone(zone).toLocalDate().toString()) { mutableListOf() }.add(v)
                        }
                        for ((k, v) in byDay) { map.getOrPut(k) { Day() }.hrv = v.average(); hrvFound++ }
                    } catch (e: Throwable) { /* HRV non leggibile: si prosegue senza */ }
                }

                // Attività: passi, distanza e calorie per giorno (aggregate: Health Connect evita i doppi conteggi tra app).
                val granted = client.permissionController.getGrantedPermissions()
                val actArr = JSArray()
                val sessArr = JSArray()
                if (granted.containsAll(activityPerms())) {
                    suspend fun <T : Any> agg(metric: AggregateMetric<T>, a: Instant, b: Instant): T? =
                        try { client.aggregate(AggregateRequest(metrics = setOf(metric), timeRangeFilter = TimeRangeFilter.between(a, b)))[metric] } catch (e: Throwable) { null }
                    val actDays = minOf(days, 14)
                    for (i in actDays downTo 0) {
                        val d0 = LocalDate.now(zone).minusDays(i.toLong())
                        val a = d0.atStartOfDay(zone).toInstant()
                        val b = minOf(d0.plusDays(1).atStartOfDay(zone).toInstant(), Instant.now())
                        if (!b.isAfter(a)) continue
                        val steps = agg(StepsRecord.COUNT_TOTAL, a, b)
                        val dist = agg(DistanceRecord.DISTANCE_TOTAL, a, b)?.inMeters
                        val act = agg(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, a, b)?.inKilocalories
                        val tot = agg(TotalCaloriesBurnedRecord.ENERGY_TOTAL, a, b)?.inKilocalories
                        if (steps == null && dist == null && act == null && tot == null) continue
                        actArr.put(JSObject().put("date", d0.toString()).put("steps", steps).put("distanceM", dist?.let { Math.round(it) })
                            .put("activeKcal", act?.let { Math.round(it) }).put("totalKcal", tot?.let { Math.round(it) }))
                    }
                    // Sessioni di allenamento registrate dall'orologio, con frequenza e calorie del loro intervallo.
                    val sess = client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range, pageSize = 200)).records
                    for (r in sess) {
                        val avg = agg(HeartRateRecord.BPM_AVG, r.startTime, r.endTime)
                        val mx = agg(HeartRateRecord.BPM_MAX, r.startTime, r.endTime)
                        val kc = agg(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, r.startTime, r.endTime)?.inKilocalories
                            ?: agg(TotalCaloriesBurnedRecord.ENERGY_TOTAL, r.startTime, r.endTime)?.inKilocalories
                        val dm = agg(DistanceRecord.DISTANCE_TOTAL, r.startTime, r.endTime)?.inMeters
                        sessArr.put(JSObject().put("id", r.metadata.id).put("start", r.startTime.toString()).put("end", r.endTime.toString())
                            .put("type", r.exerciseType).put("title", r.title).put("avgHr", avg).put("maxHr", mx)
                            .put("kcal", kc?.let { Math.round(it) }).put("distanceM", dm?.let { Math.round(it) }))
                    }
                }

                val arr = JSArray()
                for ((k, d) in map) {
                    val o = JSObject().put("date", k)
                    o.put("sleepMin", if (d.hasSleep) d.sleep else null)
                    o.put("restHr", d.hr)
                    o.put("hrv", d.hrv?.let { Math.round(it) })
                    arr.put(o)
                }
                call.resolve(JSObject().put("days", arr).put("activity", actArr).put("sessions", sessArr).put("sleepRecords", sleep.size).put("hrRecords", rhr.size).put("hrvDays", hrvFound))
            } catch (e: Throwable) { call.reject(e.message ?: "lettura non riuscita") }
        }
    }
}
