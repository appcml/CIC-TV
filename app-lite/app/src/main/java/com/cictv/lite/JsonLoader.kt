package com.cictv.lite

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object JsonLoader {

    // GitHub Pages — mismo dominio que la app web, siempre accesible
    private const val URL_CANALES =
        "https://appcml.github.io/CIC-TV/canales.json"
    private const val URL_RADIOS =
        "https://appcml.github.io/CIC-TV/radios.json"
    private const val TAG = "CICLite"

    fun cargarCanalesRapido(max: Int = 300): List<Canal> = cargarDesde(URL_CANALES, max)
    fun cargarRadios(): List<Canal> = cargarDesde(URL_RADIOS, 500)

    private fun cargarDesde(urlStr: String, maxItems: Int = 500): List<Canal> {
        return try {
            val url  = URL(urlStr)
            val conn = url.openConnection() as HttpURLConnection
            conn.apply {
                connectTimeout = 15_000
                readTimeout    = 30_000
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
            var i = 0
            while (i < array.length() && result.size < maxItems) {
                Canal.fromJson(array.getJSONObject(i))?.let { result.add(it) }
                i++
            }
            Log.d(TAG, "Cargados ${result.size} de $urlStr")
            result
        } catch (e: Exception) {
            Log.e(TAG, "Error: ${e.message}")
            emptyList()
        }
    }
}
