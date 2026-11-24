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
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
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
    private class Parts(val sleep: List<SleepSessionRecord>, val rhr: List<RestingHeartRateRecord>, val hrv: Map<String, List<Double>>, val act: Pair<JSArray, JSArray>, val t: LongArray)

    /** Una sola richiesta per intervallo con tutte le misure che servono, invece di una richiesta per misura. */
    @Suppress("UNCHECKED_CAST")
    private fun req(a: Instant, b: Instant, vararg m: AggregateMetric<*>) =
        AggregateRequest(metrics = m.toSet() as Set<AggregateMetric<Any>>, timeRangeFilter = TimeRangeFilter.between(a, b))

    private suspend fun readHrv(range: TimeRangeFilter, zone: ZoneId): Map<String, List<Double>> {
        val cls = hrvClass ?: return emptyMap()
        return try {
            val recs = client.readRecords(ReadRecordsRequest(cls, range, pageSize = 500)).records
            val byDay = mutableMapOf<String, MutableList<Double>>()
            for (r in recs) {
                val t = r.javaClass.getMethod("getTime").invoke(r) as Instant
                val v = r.javaClass.getMethod("getHeartRateVariabilityMillis").invoke(r) as Double
                byDay.getOrPut(t.atZone(zone).toLocalDate().toString()) { mutableListOf() }.add(v)
            }
            byDay
        } catch (e: Throwable) { emptyMap() } // HRV non leggibile: si prosegue senza
    }

    /** Passi, distanza e calorie per giorno, più le sessioni dell'orologio. Tutte le richieste partono insieme. */
    private suspend fun readActivity(zone: ZoneId, actDays: Int): Pair<JSArray, JSArray> = coroutineScope {
        val now = Instant.now()
        val perDay = (actDays downTo 0).map { i ->
            val d0 = LocalDate.now(zone).minusDays(i.toLong())
            val a = d0.atStartOfDay(zone).toInstant()
            val b = minOf(d0.plusDays(1).atStartOfDay(zone).toInstant(), now)
            async {
                if (!b.isAfter(a)) null
                else try {
                    Pair(d0, client.aggregate(req(a, b, StepsRecord.COUNT_TOTAL, DistanceRecord.DISTANCE_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, TotalCaloriesBurnedRecord.ENERGY_TOTAL)))
                } catch (e: Throwable) { null }
            }
        }
        val sStart = LocalDate.now(zone).minusDays(actDays.toLong()).atStartOfDay(zone).toInstant()
        val recs = client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(sStart, now), pageSize = 200)).records
        // Zepp scrive spesso lo stesso allenamento due volte: si tiene una copia per inizio, fine e tipo.
        val seen = HashSet<String>()
        val uniq = recs.filter { seen.add("${it.startTime}|${it.endTime}|${it.exerciseType}") }
        val perSession = uniq.map { r ->
            async {
                var avg: Long? = null
                var mx: Long? = null
                var kc: Double? = null
                var dm: Double? = null
                // Frequenza e calorie si leggono solo per gli allenamenti da 20 minuti in su: le micro-camminate non servono.
                if (Duration.between(r.startTime, r.endTime).toMinutes() >= 20) {
                    try {
                        val res = client.aggregate(req(r.startTime, r.endTime, HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MAX, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, TotalCaloriesBurnedRecord.ENERGY_TOTAL, DistanceRecord.DISTANCE_TOTAL))
                        avg = res[HeartRateRecord.BPM_AVG]
                        mx = res[HeartRateRecord.BPM_MAX]
                        kc = res[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: res[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories
                        dm = res[DistanceRecord.DISTANCE_TOTAL]?.inMeters
                    } catch (e: Throwable) { /* senza dati di frequenza si tiene la sessione */ }
                }
                JSObject().put("id", r.metadata.id).put("start", r.startTime.toString()).put("end", r.endTime.toString())
                    .put("type", r.exerciseType).put("title", r.title).put("avgHr", avg).put("maxHr", mx)
                    .put("kcal", kc?.let { Math.round(it) }).put("distanceM", dm?.let { Math.round(it) })
            }
        }
        val actArr = JSArray()
        for (row in perDay.awaitAll()) {
            if (row == null) continue
            val (d0, res) = row
            val steps = res[StepsRecord.COUNT_TOTAL]
            val dist = res[DistanceRecord.DISTANCE_TOTAL]?.inMeters
            val act = res[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories
            val tot = res[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories
            if (steps == null && dist == null && act == null && tot == null) continue
            actArr.put(JSObject().put("date", d0.toString()).put("steps", steps).put("distanceM", dist?.let { Math.round(it) })
                .put("activeKcal", act?.let { Math.round(it) }).put("totalKcal", tot?.let { Math.round(it) }))
        }
        val sessArr = JSArray()
        for (o in perSession.awaitAll()) sessArr.put(o)
        Pair(actArr, sessArr)
    }

    /** days: finestra di sonno, frequenza e HRV. activityDays: finestra di passi, calorie e allenamenti (massimo 14). */
    @PluginMethod
    fun readDaily(call: PluginCall) {
        val days = call.getInt("days") ?: 30
        val actDays = minOf(call.getInt("activityDays") ?: 14, 14)
        activity.lifecycleScope.launch {
            try {
                val t0 = System.currentTimeMillis()
                val zone = ZoneId.systemDefault()
                val end = Instant.now()
                val start = LocalDate.now(zone).minusDays(days.toLong()).atStartOfDay(zone).toInstant()
                val range = TimeRangeFilter.between(start, end)
                val map = sortedMapOf<String, Day>()
                fun day(i: Instant) = map.getOrPut(i.atZone(zone).toLocalDate().toString()) { Day() }
                val withActivity = client.permissionController.getGrantedPermissions().containsAll(activityPerms())

                // Sonno, frequenza, HRV e attività si leggono insieme.
                // t[0..3]: durata in ms di sonno, frequenza, HRV e attività (per capire cosa rallenta la lettura).
                val t = LongArray(4)
                val p = coroutineScope {
                    val sleepJ = async { val a0 = System.currentTimeMillis(); val r = client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range, pageSize = 500)).records; t[0] = System.currentTimeMillis() - a0; r }
                    val rhrJ = async { val a0 = System.currentTimeMillis(); val r = client.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, range, pageSize = 500)).records; t[1] = System.currentTimeMillis() - a0; r }
                    val hrvJ = async { val a0 = System.currentTimeMillis(); val r = readHrv(range, zone); t[2] = System.currentTimeMillis() - a0; r }
                    val actJ = async { val a0 = System.currentTimeMillis(); val r = if (withActivity) { try { readActivity(zone, actDays) } catch (e: Throwable) { Pair(JSArray(), JSArray()) } } else Pair(JSArray(), JSArray()); t[3] = System.currentTimeMillis() - a0; r }
                    Parts(sleepJ.await(), rhrJ.await(), hrvJ.await(), actJ.await(), t)
                }

                // Sonno: la notte si assegna al giorno del risveglio; si contano solo le fasi di sonno vero.
                // Lo stesso sonno può essere scritto più volte: si uniscono gli intervalli che si sovrappongono.
                val intervals = mutableMapOf<String, MutableList<Pair<Instant, Instant>>>()
                for (r in p.sleep) {
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
                for (r in p.rhr.sortedBy { it.time }) day(r.time).hr = r.beatsPerMinute
                for ((k, v) in p.hrv) map.getOrPut(k) { Day() }.hrv = v.average()

                val arr = JSArray()
                for ((k, d) in map) {
                    val o = JSObject().put("date", k)
                    o.put("sleepMin", if (d.hasSleep) d.sleep else null)
                    o.put("restHr", d.hr)
                    o.put("hrv", d.hrv?.let { Math.round(it) })
                    arr.put(o)
                }
                call.resolve(JSObject().put("days", arr).put("activity", p.act.first).put("sessions", p.act.second)
                    .put("sleepRecords", p.sleep.size).put("hrRecords", p.rhr.size).put("hrvDays", p.hrv.size).put("ms", System.currentTimeMillis() - t0)
                    .put("timings", JSObject().put("sleep", p.t[0]).put("rhr", p.t[1]).put("hrv", p.t[2]).put("activity", p.t[3]).put("sessions", p.act.second.length())))
            } catch (e: Throwable) { call.reject(e.message ?: "lettura non riuscita") }
        }
    }
}
