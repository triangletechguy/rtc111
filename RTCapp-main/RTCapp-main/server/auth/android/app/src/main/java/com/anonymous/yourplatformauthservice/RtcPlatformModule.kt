package com.anonymous.yourplatformauthservice

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class RtcPlatformModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = NAME

  @ReactMethod
  fun start(options: ReadableMap, promise: Promise) {
    RtcPlatformController.start(reactContext, options, promise)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    RtcPlatformController.stop(promise)
  }

  @ReactMethod
  fun muteLocalAudio(muted: Boolean, promise: Promise) {
    RtcPlatformController.muteLocalAudio(muted, promise)
  }

  @ReactMethod
  fun setLocalVideoEnabled(enabled: Boolean, promise: Promise) {
    RtcPlatformController.setLocalVideoEnabled(enabled, promise)
  }

  @ReactMethod
  fun setSpeakerphoneOn(enabled: Boolean, promise: Promise) {
    RtcPlatformController.setSpeakerphoneOn(enabled, promise)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    RtcPlatformController.addListener()
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    RtcPlatformController.removeListeners(count)
  }

  override fun invalidate() {
    RtcPlatformController.clearReactContext(reactContext)
    super.invalidate()
  }

  companion object {
    const val NAME = "RtcPlatform"
  }
}
