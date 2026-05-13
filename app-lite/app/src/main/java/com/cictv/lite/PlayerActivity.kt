package com.cictv.lite

import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.exoplayer2.ExoPlayer
import com.google.android.exoplayer2.MediaItem
import com.google.android.exoplayer2.PlaybackException
import com.google.android.exoplayer2.Player
import com.google.android.exoplayer2.ui.StyledPlayerView

class PlayerActivity : AppCompatActivity() {

    private var player: ExoPlayer? = null
    private lateinit var playerView: StyledPlayerView
    private lateinit var txtError: TextView
    private lateinit var txtNombre: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player)

        playerView = findViewById(R.id.playerView)
        txtError   = findViewById(R.id.txtError)
        txtNombre  = findViewById(R.id.txtNombre)

        val url  = intent.getStringExtra("url")  ?: return
        val name = intent.getStringExtra("name") ?: ""

        txtNombre.text = name
        iniciarReproductor(url)
    }

    private fun iniciarReproductor(url: String) {
        player = ExoPlayer.Builder(this).build().also { exo ->
            playerView.player = exo

            val mediaItem = MediaItem.fromUri(Uri.parse(url))
            exo.setMediaItem(mediaItem)
            exo.prepare()
            exo.playWhenReady = true

            exo.addListener(object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) {
                    txtError.visibility = View.VISIBLE
                    txtError.text = "Error al reproducir este canal"
                }
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY) {
                        txtError.visibility = View.GONE
                    }
                }
            })
        }
    }

    override fun onPause()  { super.onPause();  player?.pause() }
    override fun onResume() { super.onResume(); player?.play()  }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
        player = null
    }
}
