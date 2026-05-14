package com.cictv.lite

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object JsonLoader {

    // Archivos pequeños (~50KB) optimizados para TV Box
    private const val URL_CANALES =
        "https://appcml.github.io/CIC-TV/canales-lite.json"
    private const val URL_RADIOS =
        "https://appcml.github.io/CIC-TV/radios-lite.json"
    private const val TAG = "CICLite"

    fun cargarCanales(): List<Canal> = cargarDesde(URL_CANALES)
    fun cargarRadios(): List<Canal>  = cargarDesde(URL_RADIOS)

    private fun cargarDesde(urlStr: String): List<Canal> {
        return try {
            val url  = URL(urlStr)
            val conn = url.openConnection() as HttpURLConnection
            conn.apply {
                connectTimeout = 10_000
                readTimeout    = 15_000
                setRequestProperty("User-Agent", "CICTVLite/1.0")
            }
            val json = conn.inputStream.bufferedReader().readText()
            conn.disconnect()

            val array: JSONArray = try {
                val obj = JSONObject(json)
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
            Log.d(TAG, "Cargados ${result.size} de $urlStr")
            result
        } catch (e: Exception) {
            Log.e(TAG, "Error: ${e.message}")
            emptyList()
        }
    }
}
