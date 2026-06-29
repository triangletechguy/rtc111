package com.rtcapp.rtcdashboardsdk

import com.rtcone.sdk.RtcDashboardSession
import com.rtcone.sdk.RtcServiceSdk
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord

private const val MODULE_NAME = "RtcDashboardSdk"
private const val EVENT_NAME = "onRtcEvent"

@OptimizedRecord
data class RtcTokenOptions(
  @Field val accessToken: String,
  @Field val rtcMode: String? = null
) : Record

@OptimizedRecord
data class RtcStartOptions(
  @Field val accessToken: String,
  @Field val roomId: String? = null,
  @Field val appId: String? = null,
  @Field val appKey: String? = null,
  @Field val signalingUrl: String? = null,
  @Field val rtcMode: String? = null,
  @Field val speakerOn: Boolean? = true
) : Record

@OptimizedRecord
data class RtcMutedOptions(
  @Field val muted: Boolean = false
) : Record

@OptimizedRecord
data class RtcEnabledOptions(
  @Field val enabled: Boolean = true
) : Record

class RtcDashboardSdkModule : Module() {
  private var session: RtcDashboardSession? = null

  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)

    Events(EVENT_NAME)

    AsyncFunction("parseToken") { options: RtcTokenOptions ->
      tokenInfoToMap(RtcDashboardSession.parseToken(options.accessToken.trim()))
    }

    AsyncFunction("requiredAndroidPermissions") { options: RtcTokenOptions ->
      RtcDashboardSession.requiredAndroidPermissions(options.accessToken.trim(), clean(options.rtcMode))
    }

    AsyncFunction("start") { options: RtcStartOptions ->
      val token = options.accessToken.trim()

      if (token.isBlank()) {
        throw IllegalArgumentException("RTC access token is required.")
      }

      session?.release()
      session = RtcDashboardSession.start(
        context = context.applicationContext,
        accessToken = token,
        roomId = clean(options.roomId),
        signalingUrl = clean(options.signalingUrl) ?: RtcServiceSdk.DEFAULT_SIGNALING_URL,
        listener = createListener(),
        appId = clean(options.appId),
        appKey = clean(options.appKey),
        rtcMode = clean(options.rtcMode)
      ).also { startedSession ->
        options.speakerOn?.let(startedSession::setSpeakerphoneOn)
      }

      val tokenInfo = RtcDashboardSession.parseToken(token)
      val resolvedRoomId = clean(options.roomId) ?: tokenInfo.roomId
      val resolvedRtcMode = clean(options.rtcMode) ?: tokenInfo.rtcMode

      mapOf(
        "started" to true,
        "nativeAvailable" to true,
        "appId" to (clean(options.appId) ?: tokenInfo.appId),
        "appKey" to (clean(options.appKey) ?: tokenInfo.appKey),
        "roomId" to resolvedRoomId,
        "rtcMode" to resolvedRtcMode,
        "signalingUrl" to (clean(options.signalingUrl) ?: RtcServiceSdk.DEFAULT_SIGNALING_URL),
        "message" to "RTC session started from native SDK."
      )
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("leaveRoom") {
      session?.leaveRoom()
      emit("left")
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("release") {
      session?.release()
      session = null
      emit("released")
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("muteLocalAudio") { options: RtcMutedOptions ->
      session?.muteLocalAudio(options.muted)
      emit("localAudioMuted", mapOf("muted" to options.muted))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setLocalVideoEnabled") { options: RtcEnabledOptions ->
      session?.setLocalVideoEnabled(options.enabled)
      emit("localVideoEnabled", mapOf("enabled" to options.enabled))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setSpeakerphoneOn") { options: RtcEnabledOptions ->
      session?.setSpeakerphoneOn(options.enabled)
      emit("speakerphoneChanged", mapOf("enabled" to options.enabled))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("switchCamera") {
      session?.switchCamera() ?: false
    }.runOnQueue(Queues.MAIN)
  }

  private fun createListener(): RtcDashboardSession.Listener {
    return object : RtcDashboardSession.Listener {
      override fun onStatusChanged(status: String) {
        emit("status", mapOf("status" to status))
      }

      override fun onConnected(roomId: String) {
        emit("connected", mapOf("roomId" to roomId))
      }

      override fun onDisconnected(reason: String) {
        emit("disconnected", mapOf("reason" to reason))
      }

      override fun onParticipantCountChanged(count: Int) {
        emit("participantCountChanged", mapOf("count" to count))
      }

      override fun onLocalAudioMuted(muted: Boolean) {
        emit("localAudioMuted", mapOf("muted" to muted))
      }

      override fun onLocalVideoEnabled(enabled: Boolean) {
        emit("localVideoEnabled", mapOf("enabled" to enabled))
      }

      override fun onSpeakerphoneChanged(enabled: Boolean) {
        emit("speakerphoneChanged", mapOf("enabled" to enabled))
      }

      override fun onCameraSwitched(isFrontCamera: Boolean) {
        emit("cameraSwitched", mapOf("isFrontCamera" to isFrontCamera))
      }

      override fun onError(message: String) {
        emit("error", mapOf("message" to message))
      }
    }
  }

  private fun emit(type: String, extra: Map<String, Any?> = emptyMap()) {
    sendEvent(EVENT_NAME, mapOf("type" to type) + extra)
  }

  private fun tokenInfoToMap(tokenInfo: RtcServiceSdk.AccessTokenInfo): Map<String, Any?> {
    return mapOf(
      "appId" to tokenInfo.appId,
      "appKey" to tokenInfo.appKey,
      "roomId" to tokenInfo.roomId,
      "userId" to tokenInfo.userId,
      "externalUserId" to tokenInfo.externalUserId,
      "role" to tokenInfo.role,
      "rtcMode" to tokenInfo.rtcMode,
      "permissions" to tokenInfo.permissions,
      "expiresAtEpochSeconds" to tokenInfo.expiresAtEpochSeconds,
      "isExpired" to tokenInfo.isExpired()
    )
  }
}

private fun clean(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }
