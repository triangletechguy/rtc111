package com.anonymous.yourplatformauthservice

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.rtcone.sdk.RtcServiceSdk
import org.webrtc.MediaStream
import org.webrtc.PeerConnection

object RtcPlatformController {
  private const val EVENT_NAME = "RtcPlatformEvent"

  private var sdk: RtcServiceSdk? = null
  private var reactContext: ReactApplicationContext? = null
  private var videoView: RtcPlatformVideoView? = null
  private var listenerCount = 0

  fun start(
    context: ReactApplicationContext,
    options: ReadableMap,
    promise: Promise,
  ) {
    val signalingUrl = options.stringValue("signalingUrl").trim()
    val token = options.stringValue("token").trim()
    val roomId = options.stringValue("roomId").trim()
    val enableAudio = options.booleanValue("enableAudio", true)
    val enableVideo = options.booleanValue("enableVideo", true)

    if (signalingUrl.isBlank()) {
      promise.reject("ERR_RTC_CONFIG", "signalingUrl is required")
      return
    }

    if (token.isBlank()) {
      promise.reject("ERR_RTC_CONFIG", "token is required")
      return
    }

    if (roomId.isBlank()) {
      promise.reject("ERR_RTC_CONFIG", "roomId is required")
      return
    }

    reactContext = context

    UiThreadUtil.runOnUiThread {
      try {
        releaseSdk()

        val nextSdk = RtcServiceSdk(
          context = context.applicationContext,
          config = RtcServiceSdk.Config(
            signalingUrl = signalingUrl,
            accessToken = token,
            roomId = roomId,
            enableAudio = enableAudio,
            enableVideo = enableVideo,
          ),
          listener = createListener(),
        )

        sdk = nextSdk
        attachActiveRenderers(initializeRenderers = true)
        sendEvent("connecting") {
          putString("roomId", roomId)
        }

        if (enableVideo) {
          nextSdk.connectAndJoinVideoCall(roomId)
        } else {
          nextSdk.connectAndJoin(roomId)
        }

        promise.resolve(null)
      } catch (error: Throwable) {
        promise.reject("ERR_RTC_START", error.message, error)
      }
    }
  }

  fun stop(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        releaseSdk()
        sendEvent("stopped")
        promise.resolve(null)
      } catch (error: Throwable) {
        promise.reject("ERR_RTC_STOP", error.message, error)
      }
    }
  }

  fun muteLocalAudio(muted: Boolean, promise: Promise) {
    runWithSdk(promise, "ERR_RTC_AUDIO") { activeSdk ->
      activeSdk.muteLocalAudio(muted)
    }
  }

  fun setLocalVideoEnabled(enabled: Boolean, promise: Promise) {
    runWithSdk(promise, "ERR_RTC_VIDEO") { activeSdk ->
      activeSdk.setLocalVideoEnabled(enabled)
    }
  }

  fun setSpeakerphoneOn(enabled: Boolean, promise: Promise) {
    runWithSdk(promise, "ERR_RTC_SPEAKER") { activeSdk ->
      activeSdk.setSpeakerphoneOn(enabled)
    }
  }

  fun attachVideoView(view: RtcPlatformVideoView) {
    videoView = view
    UiThreadUtil.runOnUiThread {
      attachActiveRenderers(initializeRenderers = true)
    }
  }

  fun detachVideoView(view: RtcPlatformVideoView) {
    if (videoView !== view) return
    videoView = null
    UiThreadUtil.runOnUiThread {
      sdk?.attachRenderers(null, null, initializeRenderers = false)
    }
  }

  fun addListener() {
    listenerCount += 1
  }

  fun removeListeners(count: Int) {
    listenerCount = (listenerCount - count).coerceAtLeast(0)
  }

  fun clearReactContext(context: ReactApplicationContext) {
    if (reactContext === context) {
      reactContext = null
    }
  }

  private fun runWithSdk(
    promise: Promise,
    errorCode: String,
    command: (RtcServiceSdk) -> Unit,
  ) {
    UiThreadUtil.runOnUiThread {
      val activeSdk = sdk
      if (activeSdk == null) {
        promise.reject(errorCode, "RTC SDK is not running")
        return@runOnUiThread
      }

      try {
        command(activeSdk)
        promise.resolve(null)
      } catch (error: Throwable) {
        promise.reject(errorCode, error.message, error)
      }
    }
  }

  private fun attachActiveRenderers(initializeRenderers: Boolean) {
    val activeSdk = sdk ?: return
    val activeView = videoView ?: return

    activeSdk.attachRenderers(
      localRenderer = activeView.localRenderer,
      remoteRenderer = activeView.remoteRenderer,
      initializeRenderers = initializeRenderers,
    )
  }

  private fun releaseSdk() {
    sdk?.attachRenderers(null, null, initializeRenderers = false)
    sdk?.release()
    sdk = null
  }

  private fun createListener(): RtcServiceSdk.Listener {
    return object : RtcServiceSdk.Listener {
      override fun onConnected(socketId: String) {
        sendEvent("connected") {
          putString("socketId", socketId)
        }
      }

      override fun onDisconnected(reason: String) {
        sendEvent("disconnected") {
          putString("reason", reason)
        }
      }

      override fun onJoiningRoom(roomId: String) {
        sendEvent("joiningRoom") {
          putString("roomId", roomId)
        }
      }

      override fun onRoomJoined(roomId: String) {
        sendEvent("roomJoined") {
          putString("roomId", roomId)
        }
      }

      override fun onRoomLeft(roomId: String) {
        sendEvent("roomLeft") {
          putString("roomId", roomId)
        }
      }

      override fun onRoomFull() {
        sendEvent("roomError") {
          putString("message", "Room is full")
        }
      }

      override fun onRoomError(message: String) {
        sendEvent("roomError") {
          putString("message", message)
        }
      }

      override fun onRoomState(participantCount: Int) {
        sendEvent("roomState") {
          putInt("participantCount", participantCount)
        }
      }

      override fun onWaitingForPeer() {
        sendEvent("waitingForPeer")
      }

      override fun onPeerJoined(peerId: String) {
        sendEvent("peerJoined") {
          putString("peerId", peerId)
        }
      }

      override fun onPeerLeft(peerId: String) {
        sendEvent("peerLeft") {
          putString("peerId", peerId)
        }
      }

      override fun onParticipantJoined(peerId: String) {
        sendEvent("participantJoined") {
          putString("peerId", peerId)
        }
      }

      override fun onParticipantLeft(peerId: String, reason: String) {
        sendEvent("participantLeft") {
          putString("peerId", peerId)
          putString("reason", reason)
        }
      }

      override fun onParticipantUpdated(peerId: String, micEnabled: Boolean, cameraEnabled: Boolean) {
        sendEvent("participantUpdated") {
          putString("peerId", peerId)
          putBoolean("micEnabled", micEnabled)
          putBoolean("cameraEnabled", cameraEnabled)
        }
      }

      override fun onLocalStream(stream: MediaStream) {
        sendEvent("localStream")
      }

      override fun onRemoteStream(stream: MediaStream) {
        sendEvent("remoteStream")
      }

      override fun onRemoteStreamForPeer(peerId: String, stream: MediaStream) {
        sendEvent("remoteStream") {
          putString("peerId", peerId)
        }
      }

      override fun onLocalAudioMuted(muted: Boolean) {
        sendEvent("localAudioMuted") {
          putBoolean("muted", muted)
        }
      }

      override fun onLocalVideoEnabled(enabled: Boolean) {
        sendEvent("localVideoEnabled") {
          putBoolean("enabled", enabled)
        }
      }

      override fun onSpeakerphoneChanged(enabled: Boolean) {
        sendEvent("speakerphoneChanged") {
          putBoolean("enabled", enabled)
        }
      }

      override fun onConnectionStateChanged(state: PeerConnection.PeerConnectionState) {
        sendEvent("connectionStateChanged") {
          putString("state", state.name.lowercase())
        }
      }

      override fun onRtcConnectionIndicatorChanged(indicator: RtcServiceSdk.ConnectionIndicator) {
        sendEvent("connectionIndicatorChanged") {
          putString("state", indicator.name.lowercase())
        }
      }

      override fun onError(message: String) {
        sendEvent("error") {
          putString("message", message)
        }
      }
    }
  }

  private fun sendEvent(event: String, block: WritableMap.() -> Unit = {}) {
    val map = Arguments.createMap().apply {
      putString("event", event)
      block()
    }

    reactContext?.emitDeviceEvent(EVENT_NAME, map)
  }

  private fun ReadableMap.stringValue(key: String): String {
    return if (hasKey(key) && !isNull(key)) getString(key).orEmpty() else ""
  }

  private fun ReadableMap.booleanValue(key: String, defaultValue: Boolean): Boolean {
    return if (hasKey(key) && !isNull(key)) getBoolean(key) else defaultValue
  }
}
