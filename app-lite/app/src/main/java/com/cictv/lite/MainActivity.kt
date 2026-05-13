package com.cictv.lite

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.*

class MainActivity : AppCompatActivity() {

    private lateinit var recycler: RecyclerView
    private lateinit var spinner: Spinner
    private lateinit var loading: TextView
    private lateinit var tabs: RadioGroup

    private var todosCanales: List<Canal> = emptyList()
    private var todasRadios:  List<Canal> = emptyList()
    private var modoActual = "tv"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        recycler = findViewById(R.id.recycler)
        spinner  = findViewById(R.id.spinnerCat)
        loading  = findViewById(R.id.txtLoading)
        tabs     = findViewById(R.id.tabs)

        recycler.layoutManager = LinearLayoutManager(this)

        tabs.setOnCheckedChangeListener { _, id ->
            modoActual = if (id == R.id.tabTV) "tv" else "radio"
            filtrarYMostrar()
        }

        cargarTodo()
    }

    private fun cargarTodo() {
        loading.visibility = View.VISIBLE
        recycler.visibility = View.GONE

        CoroutineScope(Dispatchers.IO).launch {
            todosCanales = JsonLoader.cargarCanales()
            todasRadios  = JsonLoader.cargarRadios()

            withContext(Dispatchers.Main) {
                loading.visibility = View.GONE
                recycler.visibility = View.VISIBLE
                filtrarYMostrar()
            }
        }
    }

    private fun filtrarYMostrar() {
        val lista = if (modoActual == "tv") todosCanales else todasRadios
        val cats  = listOf("Todas") + lista.map { it.cat }.distinct().sorted()

        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, cats)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = adapter

        spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                val cat = cats[pos]
                val filtrada = if (cat == "Todas") lista else lista.filter { it.cat == cat }
                recycler.adapter = CanalAdapter(filtrada) { canal ->
                    abrirReproductor(canal)
                }
            }
            override fun onNothingSelected(p: AdapterView<*>?) {}
        }

        // Mostrar todos al inicio
        recycler.adapter = CanalAdapter(lista) { canal -> abrirReproductor(canal) }
    }

    private fun abrirReproductor(canal: Canal) {
        val intent = Intent(this, PlayerActivity::class.java).apply {
            putExtra("url",  canal.url)
            putExtra("name", canal.name)
        }
        startActivity(intent)
    }
}

// ── Adapter ──────────────────────────────────────────────────────────────────

class CanalAdapter(
    private val items: List<Canal>,
    private val onClick: (Canal) -> Unit
) : RecyclerView.Adapter<CanalAdapter.VH>() {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val nombre: TextView  = view.findViewById(R.id.txtNombre)
        val cat:    TextView  = view.findViewById(R.id.txtCat)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_canal, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val c = items[position]
        holder.nombre.text = c.name
        holder.cat.text    = "${c.cat}  ${c.co}"
        holder.itemView.setOnClickListener { onClick(c) }
        holder.itemView.isFocusable = true
    }

    override fun getItemCount() = items.size
}
