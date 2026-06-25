package com.anonymous.yourplatformauthservice

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class RtcPlatformVideoViewManager : SimpleViewManager<RtcPlatformVideoView>() {
  override fun getName(): String = "RtcPlatformVideoView"

  override fun createViewInstance(reactContext: ThemedReactContext): RtcPlatformVideoView {
    return RtcPlatformVideoView(reactContext).also { view ->
      RtcPlatformController.attachVideoView(view)
    }
  }

  override fun onDropViewInstance(view: RtcPlatformVideoView) {
    RtcPlatformController.detachVideoView(view)
    view.release()
    super.onDropViewInstance(view)
  }
}
