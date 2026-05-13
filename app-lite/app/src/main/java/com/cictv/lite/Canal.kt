package com.cictv.lite

import org.json.JSONObject

data class Canal(
    val id: String,
    val name: String,
    val url: String,
    val logo: String,
    val cat: String,
    val co: String,
    val type: String = "tv"
) {
    companion object {
        fun fromJson(obj: JSONObject): Canal? {
            return try {
                val url  = obj.optString("url", "")
                val name = obj.optString("name", "")
                if (url.isEmpty() || name.isEmpty()) return null
                // Filtrar canales caídos para ahorrar memoria
                if (!obj.optBoolean("vivo", true)) return null
                Canal(
                    id   = obj.optString("id", ""),
                    name = name,
                    url  = url,
                    logo = obj.optString("logo", ""),
                    cat  = obj.optString("cat", "General"),
                    co   = obj.optString("co", ""),
                    type = obj.optString("type", "tv")
                )
            } catch (e: Exception) {
                null
            }
        }
    }
}
