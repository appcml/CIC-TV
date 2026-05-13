package com.cictv.lite

import android.util.Log
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

object JsonLoader {

    private const val URL_CANALES =
        "https://raw.githubusercontent.com/appcml/CIC-TV/main/canales.json"
    private const val URL_RADIOS =
        "https://raw.githubusercontent.com/appcml/CIC-TV/main/radios.json"
    private const val TAG = "CICLite"

    fun cargarCanales(): List<Canal> = cargarDesde(URL_CANALES)
    fun cargarRadios(): List<Canal>  = cargarDesde(URL_RADIOS)

    private fun cargarDesde(urlStr: String): List<Canal> {
        return try {
            val url  = URL(urlStr)
            val conn = url.openConnection() as HttpURLConnection
            conn.apply {
                connectTimeout = 10_000
                readTimeout    = 20_000
                setRequestProperty("User-Agent", "CICTVLite/1.0")
            }
            val json = conn.inputStream.bufferedReader().readText()
            conn.disconnect()

            // canales.json → { "canales": [...] }
            // radios.json  → { "radios": [...] }
            // fallback     → array directo [...]
            val array = try {
                val obj = org.json.JSONObject(json)
                when {
                    obj.has("canales") -> obj.getJSONArray("canales")
                    obj.has("radios")  -> obj.getJSONArray("radios")
                    else               -> JSONArray(json)
                }
            } catch (e: Exception) {
                JSONArray(json)
            }

            val result = mutableListOf<Canal>()
            for (i in 0 until array.length()) {
                Canal.fromJson(array.getJSONObject(i))?.let { result.add(it) }
            }
            Log.d(TAG, "Cargados ${result.size} items de $urlStr")
            result
        } catch (e: Exception) {
            Log.e(TAG, "Error cargando $urlStr: ${e.message}")
            emptyList()
        }
    }
}
