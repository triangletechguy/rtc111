package com.anonymous.yourplatformauthservice

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.widget.FrameLayout
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer

class RtcPlatformVideoView(context: Context) : FrameLayout(context) {
  val remoteRenderer: SurfaceViewRenderer = SurfaceViewRenderer(context)
  val localRenderer: SurfaceViewRenderer = SurfaceViewRenderer(context)

  private var released = false

  init {
    setBackgroundColor(Color.BLACK)

    remoteRenderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
    localRenderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
    localRenderer.setMirror(true)
    localRenderer.setZOrderMediaOverlay(true)

    addView(
      remoteRenderer,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
    )

    val density = resources.displayMetrics.density
    val previewWidth = (112 * density).toInt()
    val previewHeight = (168 * density).toInt()
    val previewMargin = (16 * density).toInt()

    addView(
      localRenderer,
      LayoutParams(previewWidth, previewHeight, Gravity.TOP or Gravity.END).apply {
        setMargins(previewMargin, previewMargin, previewMargin, previewMargin)
      },
    )
  }

  fun release() {
    if (released) return
    released = true
    runCatching { localRenderer.release() }
    runCatching { remoteRenderer.release() }
  }
}
