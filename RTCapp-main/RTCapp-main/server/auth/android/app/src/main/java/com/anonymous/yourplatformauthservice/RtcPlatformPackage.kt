package com.anonymous.yourplatformauthservice

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RtcPlatformPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(RtcPlatformModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(RtcPlatformVideoViewManager())
  }

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == RtcPlatformModule.NAME) RtcPlatformModule(reactContext) else null
  }
}
