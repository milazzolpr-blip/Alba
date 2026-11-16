package it.alba.workout

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
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
 * Legge da Health Connect solo tre cose: sonno, frequenza cardiaca a riposo e HRV.
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

    private fun wanted(): Set<String> {
        val s = mutableSetOf(
            HealthPermission.getReadPermission(SleepSessionRecord::class),
            HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        )
        hrvClass?.let { s.add(HealthPermission.getReadPermission(it)) }
        return s
    }

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
                call.resolve(JSObject().put("granted", granted.containsAll(wanted())).put("count", granted.size))
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
        startActivityForResult(call, contract.createIntent(context, wanted()), "onPermissions")
    }

    @ActivityCallback
    fun onPermissions(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val granted = contract.parseResult(result.resultCode, result.data)
        call.resolve(JSObject().put("granted", granted.containsAll(wanted())).put("count", granted.size))
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
                for (r in sleep) {
                    val total = Duration.between(r.startTime, r.endTime).toMinutes()
                    if (total < 45) continue
                    val asleep = if (r.stages.isEmpty()) total
                    else r.stages.filter { it.stage == 2 || it.stage == 4 || it.stage == 5 || it.stage == 6 }.sumOf { Duration.between(it.startTime, it.endTime).toMinutes() }
                    val d = day(r.endTime); d.sleep += asleep; d.hasSleep = true
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

                val arr = JSArray()
                for ((k, d) in map) {
                    val o = JSObject().put("date", k)
                    o.put("sleepMin", if (d.hasSleep) d.sleep else null)
                    o.put("restHr", d.hr)
                    o.put("hrv", d.hrv?.let { Math.round(it) })
                    arr.put(o)
                }
                call.resolve(JSObject().put("days", arr).put("sleepRecords", sleep.size).put("hrRecords", rhr.size).put("hrvDays", hrvFound))
            } catch (e: Throwable) { call.reject(e.message ?: "lettura non riuscita") }
        }
    }
}
