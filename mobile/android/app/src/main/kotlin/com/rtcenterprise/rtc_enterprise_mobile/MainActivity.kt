package com.rtcenterprise.rtc_enterprise_mobile

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.View
import com.rtcone.sdk.RtcDashboardSession
import com.rtcone.sdk.RtcServiceSdk
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.StandardMessageCodec
import io.flutter.plugin.platform.PlatformView
import io.flutter.plugin.platform.PlatformViewFactory
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.MediaStream
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer

class MainActivity : FlutterActivity() {
    private val channelName = "funint_online_sdk"
    private val localVideoViewType = "funint_online_sdk/local_video_view"
    private val remoteVideoViewType = "funint_online_sdk/remote_video_view"
    private val permissionRequestCode = 57042
    private val screenShareRequestCode = 57043
    private val mainHandler = Handler(Looper.getMainLooper())

    private var channel: MethodChannel? = null
    private var session: RtcDashboardSession? = null
    private var pendingStart: PendingStart? = null
    private var pendingScreenShare: PendingScreenShare? = null
    private var localVideoViewFactory: RtcLocalVideoViewFactory? = null
    private var remoteVideoViewFactory: RtcRemoteVideoViewFactory? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        localVideoViewFactory = RtcLocalVideoViewFactory { session?.rawSdk() }
            .also { factory ->
                flutterEngine
                    .platformViewsController
                    .registry
                    .registerViewFactory(localVideoViewType, factory)
            }
        remoteVideoViewFactory = RtcRemoteVideoViewFactory { session?.rawSdk() }
            .also { factory ->
                flutterEngine
                    .platformViewsController
                    .registry
                    .registerViewFactory(remoteVideoViewType, factory)
            }

        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
        channel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "getIntegrationStatus" -> handleIntegrationStatus(result)
                "requiredAndroidPermissions" -> handleRequiredPermissions(call, result)
                "parseToken" -> handleParseToken(call, result)
                "startSession" -> handleStartSession(call, result)
                "leaveSession" -> {
                    releaseSession()
                    result.success(null)
                }
                "setMicEnabled" -> withSession(result) {
                    muteLocalAudio(!call.boolArg("enabled", true))
                    null
                }
                "setSpeakerphoneOn" -> withSession(result) {
                    setSpeakerphoneOn(call.boolArg("enabled", true))
                    null
                }
                "setLocalVideoEnabled" -> withSession(result) {
                    val enabled = call.boolArg("enabled", true)
                    setLocalVideoEnabled(enabled)
                    if (enabled) refreshVideoRendererBindings(rawSdk())
                    null
                }
                "refreshVideoRenderers" -> withRawSdk(result) {
                    refreshVideoRendererBindings(this)
                    null
                }
                "setNoiseCancellationEnabled" -> withSession(result) {
                    val enabled = call.boolArg("enabled", true)
                    setNoiseCancellationEnabled(enabled)
                    emitRtcEvent("noiseCancellationChanged", mapOf("enabled" to enabled))
                    null
                }
                "switchCamera" -> withSession(result) {
                    switchCamera()
                }
                "sendMessage" -> withRawSdk(result) {
                    sendMessage(
                        call.stringArg("text"),
                        call.stringArg("type", "text"),
                        jsonObjectFromAny(call.rawArg("metadata"))
                    )
                    null
                }
                "sendComment" -> withRawSdk(result) {
                    sendComment(
                        call.stringArg("text"),
                        call.stringArg("type", "text"),
                        jsonObjectFromAny(call.rawArg("metadata"))
                    )
                    null
                }
                "startScreenShare" -> handleStartScreenShare(call, result)
                "stopScreenShare" -> withRawSdk(result) {
                    val stopped = stopScreenShare(
                        call.intArg("width", 720),
                        call.intArg("height", 1280),
                        call.intArg("fps", 15)
                    )
                    emitRtcEvent("localScreenShareStopped", mapOf("enabled" to false))
                    stopped
                }
                "setScreenShareEnabled" -> withRawSdk(result) {
                    val enabled = call.boolArg("enabled", true)
                    setScreenShareEnabled(enabled)
                    emitRtcEvent("screenShareStateChanged", mapOf("enabled" to enabled))
                    null
                }
                "setVideoEffects" -> withRawSdk(result) {
                    val effects = jsonObjectFromAny(call.rawArg("effects"))
                    setVideoEffects(effects)
                    emitRtcEvent("localVideoEffectsChanged", mapOf("effects" to effects.toChannelMap()))
                    null
                }
                "setVideoFilter" -> withRawSdk(result) {
                    val filter = call.stringArg("filter")
                    setVideoFilter(filter)
                    emitRtcEvent("localVideoFilterChanged", mapOf("filter" to filter))
                    null
                }
                "setAiFilter" -> withRawSdk(result) {
                    val filter = call.stringArg("filter")
                    setAiFilter(filter)
                    emitRtcEvent("localAiFilterChanged", mapOf("filter" to filter))
                    null
                }
                "setSticker" -> withRawSdk(result) {
                    val sticker = call.stringArg("sticker")
                    setSticker(sticker)
                    emitRtcEvent("localStickerChanged", mapOf("sticker" to sticker))
                    null
                }
                "setFaceDetectEnabled" -> withRawSdk(result) {
                    val enabled = call.boolArg("enabled", true)
                    setFaceDetectEnabled(enabled)
                    emitRtcEvent("faceDetectChanged", mapOf("enabled" to enabled))
                    null
                }
                "setBeautyEnabled" -> withRawSdk(result) {
                    val enabled = call.boolArg("enabled", true)
                    val level = call.intArg("level", 50)
                    setBeautyEnabled(enabled, level.coerceIn(0, 100))
                    emitRtcEvent(
                        "beautyChanged",
                        mapOf("enabled" to enabled, "level" to level.coerceIn(0, 100))
                    )
                    null
                }
                "setBeautyLevels" -> withRawSdk(result) {
                    setBeautyLevels(
                        call.intArg("beautyLevel", 50).coerceIn(0, 100),
                        call.intArg("smoothingLevel", 50).coerceIn(0, 100),
                        call.intArg("whiteningLevel", 40).coerceIn(0, 100),
                        call.intArg("eyeLevel", 20).coerceIn(0, 100),
                        call.intArg("faceSlimLevel", 20).coerceIn(0, 100)
                    )
                    emitRtcEvent("beautyLevelsChanged")
                    null
                }
                "setBeautyMakeup" -> withRawSdk(result) {
                    val makeup = jsonObjectFromAny(call.rawArg("makeup"))
                    setBeautyMakeup(makeup)
                    emitRtcEvent("beautyMakeupChanged", mapOf("makeup" to makeup.toChannelMap()))
                    null
                }
                "applyLiveBeautyPreset" -> withRawSdk(result) {
                    val preset = call.stringArg("preset", "natural")
                    applyLiveBeautyPreset(preset)
                    emitRtcEvent("beautyPresetApplied", mapOf("preset" to preset))
                    null
                }
                "clearVideoEffects" -> withRawSdk(result) {
                    clearVideoEffects()
                    emitRtcEvent("localVideoEffectsChanged", mapOf("effects" to emptyMap<String, Any?>()))
                    null
                }
                "setYoutubeVideo" -> withRawSdk(result) {
                    val videoId = call.stringArg("videoId")
                    val title = call.stringArg("title", "YouTube video")
                    val volume = call.doubleArg("volume", 1.0).coerceIn(0.0, 1.0)
                    val thumbnailUrl = call.stringArg("thumbnailUrl")
                    setYoutubeVideo(videoId, title, volume, thumbnailUrl)
                    emitRtcEvent(
                        "youtubeVideoChanged",
                        mapOf(
                            "videoId" to videoId,
                            "title" to title,
                            "volume" to volume,
                            "thumbnailUrl" to thumbnailUrl
                        )
                    )
                    null
                }
                "playYoutube" -> withRawSdk(result) {
                    val position = call.nullableDoubleArg("positionSeconds")
                    playYoutube(position)
                    emitRtcEvent(
                        "youtubePlaybackChanged",
                        mapOf("playing" to true, "positionSeconds" to position)
                    )
                    null
                }
                "pauseYoutube" -> withRawSdk(result) {
                    val position = call.nullableDoubleArg("positionSeconds")
                    pauseYoutube(position)
                    emitRtcEvent(
                        "youtubePlaybackChanged",
                        mapOf("playing" to false, "positionSeconds" to position)
                    )
                    null
                }
                "stopYoutube" -> withRawSdk(result) {
                    val position = call.nullableDoubleArg("positionSeconds")
                    stopYoutube(position)
                    emitRtcEvent(
                        "youtubePlaybackChanged",
                        mapOf("playing" to false, "positionSeconds" to position, "stopped" to true)
                    )
                    null
                }
                "seekYoutube" -> withRawSdk(result) {
                    val position = call.doubleArg("positionSeconds", 0.0).coerceAtLeast(0.0)
                    seekYoutube(position)
                    emitRtcEvent("youtubeSeekChanged", mapOf("positionSeconds" to position))
                    null
                }
                "updateYoutubeState" -> withRawSdk(result) {
                    val state = jsonObjectFromAny(call.rawArg("state"))
                    updateYoutubeState(state)
                    emitRtcEvent("youtubeStateChanged", mapOf("state" to state.toChannelMap()))
                    null
                }
                "likeRoom" -> withRawSdk(result) {
                    likeRoom()
                    null
                }
                "shareRoom" -> withRawSdk(result) {
                    shareRoom(call.stringArg("target", "app"))
                    null
                }
                "requestMessageHistory" -> withRawSdk(result) {
                    requestMessageHistory(call.intArg("limit", 50).coerceIn(1, 200))
                    null
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode != permissionRequestCode) return

        val start = pendingStart ?: return
        pendingStart = null

        val denied = permissions.filterIndexed { index, _ ->
            grantResults.getOrNull(index) != PackageManager.PERMISSION_GRANTED
        }

        if (denied.isNotEmpty()) {
            val message = "Required RTC permissions were denied: ${denied.joinToString()}"
            start.result.error("RTC_PERMISSION_DENIED", message, denied)
            emitRtcEvent("error", mapOf("message" to message))
            return
        }

        startRtcAfterPermissions(start)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == screenShareRequestCode) {
            handleScreenShareActivityResult(resultCode, data)
            return
        }

        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onDestroy() {
        releaseSession()
        pendingScreenShare?.result?.error(
            "RTC_SCREEN_SHARE_CANCELLED",
            "Screen share request was cancelled because the Activity was destroyed",
            null
        )
        pendingScreenShare = null
        channel?.setMethodCallHandler(null)
        channel = null
        super.onDestroy()
    }

    private fun handleIntegrationStatus(result: MethodChannel.Result) {
        result.success(
            mapOf(
                "available" to true,
                "sdk" to "funint.online.aar",
                "signalingUrl" to RtcServiceSdk.DEFAULT_SIGNALING_URL,
                "localVideoViewType" to localVideoViewType,
                "remoteVideoViewType" to remoteVideoViewType,
                "permissions" to requiredPermissionsForMode("video"),
                "features" to listOf(
                    "audio",
                    "video",
                    "localRenderer",
                    "remoteRenderer",
                    "screenShare",
                    "noiseCancellation",
                    "videoFilter",
                    "aiFilter",
                    "beauty",
                    "faceDetect",
                    "chat",
                    "youtube"
                ),
                "message" to "Native Funint bridge ready"
            )
        )
    }

    private fun handleRequiredPermissions(
        call: MethodCall,
        result: MethodChannel.Result
    ) {
        val accessToken = call.stringArg("accessToken")
        val rtcMode = call.stringArg("rtcMode").takeIf { it.isNotBlank() }

        try {
            result.success(RtcDashboardSession.requiredAndroidPermissions(accessToken, rtcMode))
        } catch (error: IllegalArgumentException) {
            result.error(
                "RTC_TOKEN_INVALID",
                error.message ?: "Invalid RTC access token",
                null
            )
        }
    }

    private fun handleParseToken(call: MethodCall, result: MethodChannel.Result) {
        val accessToken = call.stringArg("accessToken")

        try {
            result.success(tokenInfoToMap(RtcDashboardSession.parseToken(accessToken)))
        } catch (error: IllegalArgumentException) {
            result.error(
                "RTC_TOKEN_INVALID",
                error.message ?: "Invalid RTC access token",
                null
            )
        }
    }

    private fun handleStartSession(call: MethodCall, result: MethodChannel.Result) {
        val accessToken = call.stringArg("accessToken")
        if (accessToken.isBlank()) {
            result.error("RTC_TOKEN_MISSING", "RTC access token is required", null)
            return
        }

        val appId = call.stringArg("appId").takeIf { it.isNotBlank() }
        val appKey = call.stringArg("appKey").takeIf { it.isNotBlank() }
        val roomId = call.stringArg("roomId").takeIf { it.isNotBlank() }
        val rtcMode = call.stringArg("rtcMode").takeIf { it.isNotBlank() }
        val signalingUrl = call.stringArg(
            "signalingUrl",
            RtcServiceSdk.DEFAULT_SIGNALING_URL
        )
        val speakerOn = call.boolArg("speakerOn", true)

        val tokenInfo = try {
            RtcDashboardSession.parseToken(accessToken)
        } catch (error: IllegalArgumentException) {
            val message = error.message ?: "Invalid RTC access token"
            result.error("RTC_TOKEN_INVALID", message, null)
            emitRtcEvent("error", mapOf("message" to message))
            return
        }

        try {
            RtcServiceSdk.validateProjectCredentials(accessToken, appId, appKey)
        } catch (error: IllegalArgumentException) {
            val message = error.message ?: "Invalid RTC project credentials"
            result.error("RTC_PROJECT_INVALID", message, null)
            emitRtcEvent("error", mapOf("message" to message))
            return
        }

        val requiredPermissions = try {
            RtcDashboardSession.requiredAndroidPermissions(accessToken, rtcMode)
                .ifEmpty { requiredPermissionsForMode(rtcMode ?: tokenInfo.rtcMode) }
        } catch (error: IllegalArgumentException) {
            val message = error.message ?: "Invalid RTC access token"
            result.error("RTC_TOKEN_INVALID", message, null)
            emitRtcEvent("error", mapOf("message" to message))
            return
        }

        val missingPermissions = requiredPermissions.filter { permission ->
            checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED
        }

        val start = PendingStart(
            accessToken = accessToken,
            appId = appId,
            appKey = appKey,
            roomId = roomId,
            rtcMode = rtcMode,
            signalingUrl = signalingUrl,
            speakerOn = speakerOn,
            tokenInfo = tokenInfo,
            result = result
        )

        if (missingPermissions.isNotEmpty()) {
            pendingStart = start
            requestPermissions(missingPermissions.toTypedArray(), permissionRequestCode)
            return
        }

        startRtcAfterPermissions(start)
    }

    private fun startRtcAfterPermissions(start: PendingStart) {
        releaseSession()

        try {
            val nextSession = RtcDashboardSession.start(
                context = applicationContext,
                accessToken = start.accessToken,
                roomId = start.roomId,
                signalingUrl = start.signalingUrl,
                listener = createListener(),
                appId = start.appId,
                appKey = start.appKey,
                rtcMode = start.rtcMode
            )

            session = nextSession
            nextSession.setSpeakerphoneOn(start.speakerOn)
            nextSession.rawSdk().setVideoEffectProcessor(
                object : RtcServiceSdk.VideoEffectProcessor {
                    override fun onVideoEffectsChanged(effects: JSONObject) {
                        emitRtcEvent(
                            "localVideoEffectsChanged",
                            mapOf("effects" to effects.toChannelMap())
                        )
                    }
                }
            )
            localVideoViewFactory?.attachToSession(nextSession.rawSdk())
            remoteVideoViewFactory?.attachToSession(nextSession.rawSdk())
            refreshVideoRendererBindings(nextSession.rawSdk())
            start.result.success(
                mapOf(
                    "started" to true,
                    "appId" to (start.appId ?: start.tokenInfo.appId ?: ""),
                    "appKey" to (start.appKey ?: start.tokenInfo.appKey ?: ""),
                    "roomId" to (start.roomId ?: start.tokenInfo.roomId ?: ""),
                    "rtcMode" to (start.rtcMode ?: start.tokenInfo.rtcMode ?: ""),
                    "signalingUrl" to start.signalingUrl
                )
            )
        } catch (error: IllegalArgumentException) {
            val message = error.message ?: "Invalid RTC start request"
            start.result.error("RTC_START_FAILED", message, null)
            emitRtcEvent("error", mapOf("message" to message))
        } catch (error: IllegalStateException) {
            val message = error.message ?: "RTC start failed"
            start.result.error("RTC_START_FAILED", message, null)
            emitRtcEvent("error", mapOf("message" to message))
        } catch (error: Throwable) {
            val message = error.message ?: error.javaClass.simpleName
            start.result.error("RTC_START_FAILED", message, null)
            emitRtcEvent("error", mapOf("message" to message))
        }
    }

    private fun handleStartScreenShare(call: MethodCall, result: MethodChannel.Result) {
        if (session?.rawSdk() == null) {
            result.error("RTC_NOT_STARTED", "RTC session has not been started", null)
            return
        }

        if (pendingScreenShare != null) {
            result.error("RTC_SCREEN_SHARE_PENDING", "A screen share request is already pending", null)
            return
        }

        val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
        if (manager == null) {
            result.error(
                "RTC_SCREEN_SHARE_UNAVAILABLE",
                "Android media projection service is unavailable",
                null
            )
            return
        }

        pendingScreenShare = PendingScreenShare(
            width = call.intArg("width", 720),
            height = call.intArg("height", 1280),
            fps = call.intArg("fps", 15),
            result = result
        )
        startActivityForResult(manager.createScreenCaptureIntent(), screenShareRequestCode)
    }

    private fun handleScreenShareActivityResult(resultCode: Int, data: Intent?) {
        val pending = pendingScreenShare ?: return
        pendingScreenShare = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            pending.result.error(
                "RTC_SCREEN_SHARE_CANCELLED",
                "Screen share permission was cancelled",
                null
            )
            emitRtcEvent("localScreenShareStopped", mapOf("enabled" to false))
            return
        }

        val currentSdk = session?.rawSdk()
        if (currentSdk == null) {
            pending.result.error("RTC_NOT_STARTED", "RTC session has not been started", null)
            return
        }

        try {
            val projectionCallback = object : MediaProjection.Callback() {
                override fun onStop() {
                    emitRtcEvent("localScreenShareStopped", mapOf("enabled" to false))
                }
            }
            val started = currentSdk.startScreenShare(
                data,
                projectionCallback,
                pending.width,
                pending.height,
                pending.fps
            )
            emitRtcEvent(
                if (started) "localScreenShareStarted" else "localScreenShareRejected",
                mapOf("enabled" to started)
            )
            pending.result.success(started)
        } catch (error: Throwable) {
            val message = error.message ?: error.javaClass.simpleName
            pending.result.error("RTC_SCREEN_SHARE_FAILED", message, null)
            emitRtcEvent("error", mapOf("message" to message))
        }
    }

    private fun createListener(): RtcDashboardSession.Listener {
        return object : RtcDashboardSession.Listener {
            override fun onStatusChanged(status: String) {
                emitRtcEvent("statusChanged", mapOf("status" to status))
            }

            override fun onConnected(roomId: String) {
                emitRtcEvent("connected", mapOf("roomId" to roomId))
            }

            override fun onDisconnected(reason: String) {
                emitRtcEvent("disconnected", mapOf("reason" to reason))
            }

            override fun onParticipantCountChanged(count: Int) {
                emitRtcEvent("participantCountChanged", mapOf("count" to count))
            }

            override fun onRemoteStream(peerId: String, stream: MediaStream) {
                emitRtcEvent("remoteStream", mapOf("peerId" to peerId))
            }

            override fun onLocalAudioMuted(muted: Boolean) {
                emitRtcEvent("localAudioMuted", mapOf("muted" to muted))
            }

            override fun onLocalVideoEnabled(enabled: Boolean) {
                emitRtcEvent("localVideoEnabled", mapOf("enabled" to enabled))
            }

            override fun onSpeakerphoneChanged(enabled: Boolean) {
                emitRtcEvent("speakerphoneChanged", mapOf("enabled" to enabled))
            }

            override fun onCameraSwitched(isFrontCamera: Boolean) {
                emitRtcEvent("cameraSwitched", mapOf("isFrontCamera" to isFrontCamera))
            }

            override fun onError(message: String) {
                emitRtcEvent("error", mapOf("message" to message))
            }
        }
    }

    private fun withSession(
        result: MethodChannel.Result,
        block: RtcDashboardSession.() -> Any?
    ) {
        val currentSession = session

        if (currentSession == null) {
            result.error("RTC_NOT_STARTED", "RTC session has not been started", null)
            return
        }

        try {
            result.success(currentSession.block())
        } catch (error: Throwable) {
            result.error("RTC_COMMAND_FAILED", error.message ?: error.javaClass.simpleName, null)
        }
    }

    private fun withRawSdk(
        result: MethodChannel.Result,
        block: RtcServiceSdk.() -> Any?
    ) {
        val currentSdk = session?.rawSdk()

        if (currentSdk == null) {
            result.error("RTC_NOT_STARTED", "RTC session has not been started", null)
            return
        }

        try {
            result.success(currentSdk.block())
        } catch (error: Throwable) {
            result.error("RTC_COMMAND_FAILED", error.message ?: error.javaClass.simpleName, null)
        }
    }

    private fun releaseSession() {
        localVideoViewFactory?.detachFromSession(releaseRenderer = true)
        remoteVideoViewFactory?.detachFromSession(releaseRenderer = true)
        session?.leaveRoom()
        session?.release()
        session = null
    }

    private fun refreshVideoRendererBindings(sdk: RtcServiceSdk? = session?.rawSdk()) {
        localVideoViewFactory?.rebindToSession(sdk)
        remoteVideoViewFactory?.rebindToSession(sdk)
    }

    private fun emitRtcEvent(event: String, payload: Map<String, Any?> = emptyMap()) {
        val data = mutableMapOf<String, Any?>("event" to event)
        data.putAll(payload)

        mainHandler.post {
            channel?.invokeMethod("onRtcEvent", data)
        }
    }

    private fun requiredPermissionsForMode(rtcMode: String?): List<String> {
        val normalizedMode = rtcMode.orEmpty().lowercase(Locale.US)
        val permissions = mutableListOf(Manifest.permission.RECORD_AUDIO)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT)
        }

        if (
            normalizedMode.contains("video") ||
            normalizedMode.contains("live") ||
            normalizedMode.contains("screen")
        ) {
            permissions.add(Manifest.permission.CAMERA)
        }

        return permissions.distinct()
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
            "issuedAtEpochSeconds" to tokenInfo.issuedAtEpochSeconds,
            "expiresAtEpochSeconds" to tokenInfo.expiresAtEpochSeconds,
            "issuer" to tokenInfo.issuer,
            "subject" to tokenInfo.subject,
            "tokenId" to tokenInfo.tokenId,
            "isExpired" to tokenInfo.isExpired()
        )
    }

    private data class PendingStart(
        val accessToken: String,
        val appId: String?,
        val appKey: String?,
        val roomId: String?,
        val rtcMode: String?,
        val signalingUrl: String,
        val speakerOn: Boolean,
        val tokenInfo: RtcServiceSdk.AccessTokenInfo,
        val result: MethodChannel.Result
    )

    private data class PendingScreenShare(
        val width: Int,
        val height: Int,
        val fps: Int,
        val result: MethodChannel.Result
    )
}

private class RtcLocalVideoViewFactory(
    private val sdkProvider: () -> RtcServiceSdk?
) : PlatformViewFactory(StandardMessageCodec.INSTANCE) {
    private val activeViews = mutableSetOf<RtcLocalVideoPlatformView>()

    override fun create(context: Context, viewId: Int, args: Any?): PlatformView {
        val creationParams = args as? Map<*, *>
        return RtcLocalVideoPlatformView(
            context = context,
            creationParams = creationParams,
            onDispose = { activeViews.remove(it) }
        ).also { view ->
            activeViews.add(view)
            view.attachTo(sdkProvider())
        }
    }

    fun attachToSession(sdk: RtcServiceSdk?) {
        activeViews.toList().forEach { view -> view.attachTo(sdk) }
    }

    fun rebindToSession(sdk: RtcServiceSdk?) {
        activeViews.toList().forEach { view -> view.rebindTo(sdk) }
    }

    fun detachFromSession(releaseRenderer: Boolean) {
        activeViews.toList().forEach { view ->
            view.detachFromSdk(releaseRenderer = releaseRenderer)
        }
    }
}

private class RtcRemoteVideoViewFactory(
    private val sdkProvider: () -> RtcServiceSdk?
) : PlatformViewFactory(StandardMessageCodec.INSTANCE) {
    private val activeViews = mutableSetOf<RtcRemoteVideoPlatformView>()

    override fun create(context: Context, viewId: Int, args: Any?): PlatformView {
        val creationParams = args as? Map<*, *>
        return RtcRemoteVideoPlatformView(
            context = context,
            creationParams = creationParams,
            onDispose = { activeViews.remove(it) }
        ).also { view ->
            activeViews.add(view)
            view.attachTo(sdkProvider())
        }
    }

    fun attachToSession(sdk: RtcServiceSdk?) {
        activeViews.toList().forEach { view -> view.attachTo(sdk) }
    }

    fun rebindToSession(sdk: RtcServiceSdk?) {
        activeViews.toList().forEach { view -> view.rebindTo(sdk) }
    }

    fun detachFromSession(releaseRenderer: Boolean) {
        activeViews.toList().forEach { view ->
            view.detachFromSdk(releaseRenderer = releaseRenderer)
        }
    }
}

private class RtcLocalVideoPlatformView(
    context: Context,
    creationParams: Map<*, *>?,
    private val onDispose: (RtcLocalVideoPlatformView) -> Unit
) : PlatformView {
    private val renderer = RtcSurfaceVideoRenderer(
        context = context,
        mirror = creationParams.booleanParam("mirror", defaultValue = true),
        fit = creationParams.stringParam("fit", defaultValue = "cover")
    )
    private var attachedSdk: RtcServiceSdk? = null

    override fun getView(): View = renderer

    fun attachTo(sdk: RtcServiceSdk?) {
        if (attachedSdk === sdk) return

        detachFromSdk(releaseRenderer = attachedSdk != null)
        attachedSdk = sdk
        sdk?.attachLocalRenderer(renderer)
    }

    fun rebindTo(sdk: RtcServiceSdk?) {
        attachTo(sdk)
        val currentSdk = attachedSdk ?: return
        currentSdk.detachLocalVideoSink(renderer)
        currentSdk.attachLocalVideoSink(renderer)
    }

    fun detachFromSdk(releaseRenderer: Boolean = false) {
        val currentSdk = attachedSdk

        if (currentSdk != null) {
            currentSdk.detachLocalRenderer(renderer, releaseRenderer)
        } else if (releaseRenderer) {
            renderer.release()
        }

        attachedSdk = null
    }

    override fun dispose() {
        detachFromSdk(releaseRenderer = true)
        onDispose(this)
    }
}

private class RtcRemoteVideoPlatformView(
    context: Context,
    creationParams: Map<*, *>?,
    private val onDispose: (RtcRemoteVideoPlatformView) -> Unit
) : PlatformView {
    private val renderer = RtcSurfaceVideoRenderer(
        context = context,
        mirror = creationParams.booleanParam("mirror", defaultValue = false),
        fit = creationParams.stringParam("fit", defaultValue = "cover")
    )
    private var attachedSdk: RtcServiceSdk? = null

    override fun getView(): View = renderer

    fun attachTo(sdk: RtcServiceSdk?) {
        if (attachedSdk === sdk) return

        detachFromSdk(releaseRenderer = attachedSdk != null)
        attachedSdk = sdk
        sdk?.attachRemoteRenderer(renderer)
    }

    fun rebindTo(sdk: RtcServiceSdk?) {
        attachTo(sdk)
        val currentSdk = attachedSdk ?: return
        currentSdk.detachRemoteVideoSink(renderer)
        currentSdk.attachRemoteVideoSink(renderer)
    }

    fun detachFromSdk(releaseRenderer: Boolean = false) {
        val currentSdk = attachedSdk

        if (currentSdk != null) {
            currentSdk.detachRemoteRenderer(renderer, releaseRenderer)
        } else if (releaseRenderer) {
            renderer.release()
        }

        attachedSdk = null
    }

    override fun dispose() {
        detachFromSdk(releaseRenderer = true)
        onDispose(this)
    }
}

private class RtcSurfaceVideoRenderer(
    context: Context,
    mirror: Boolean,
    fit: String
) : SurfaceViewRenderer(context) {
    init {
        setMirror(mirror)
        setEnableHardwareScaler(true)
        setScalingType(
            when (fit.lowercase(Locale.US)) {
                "contain" -> RendererCommon.ScalingType.SCALE_ASPECT_FIT
                else -> RendererCommon.ScalingType.SCALE_ASPECT_FILL
            }
        )
        holder.setFormat(android.graphics.PixelFormat.OPAQUE)
        if (mirror) {
            setZOrderMediaOverlay(true)
        }
    }
}

private fun MethodCall.rawArg(name: String): Any? {
    return (arguments as? Map<*, *>)?.get(name)
}

private fun MethodCall.boolArg(name: String, defaultValue: Boolean): Boolean {
    val value = rawArg(name) ?: return defaultValue
    return when (value) {
        is Boolean -> value
        is String -> value.toBooleanStrictOrNull() ?: defaultValue
        is Number -> value.toInt() != 0
        else -> defaultValue
    }
}

private fun MethodCall.intArg(name: String, defaultValue: Int): Int {
    val value = rawArg(name) ?: return defaultValue
    return when (value) {
        is Number -> value.toInt()
        is String -> value.toIntOrNull() ?: defaultValue
        else -> defaultValue
    }
}

private fun MethodCall.doubleArg(name: String, defaultValue: Double): Double {
    val value = rawArg(name) ?: return defaultValue
    return when (value) {
        is Number -> value.toDouble()
        is String -> value.toDoubleOrNull() ?: defaultValue
        else -> defaultValue
    }
}

private fun MethodCall.nullableDoubleArg(name: String): Double? {
    val value = rawArg(name) ?: return null
    return when (value) {
        is Number -> value.toDouble()
        is String -> value.toDoubleOrNull()
        else -> null
    }
}

private fun MethodCall.stringArg(name: String, defaultValue: String = ""): String {
    return rawArg(name)?.toString()?.trim()?.takeIf { it.isNotBlank() } ?: defaultValue
}

private fun Map<*, *>?.booleanParam(name: String, defaultValue: Boolean): Boolean {
    val value = this?.get(name) ?: return defaultValue
    return when (value) {
        is Boolean -> value
        is String -> value.toBooleanStrictOrNull() ?: defaultValue
        else -> defaultValue
    }
}

private fun Map<*, *>?.stringParam(name: String, defaultValue: String): String {
    return this?.get(name)?.toString()?.takeIf { it.isNotBlank() } ?: defaultValue
}

private fun jsonObjectFromAny(value: Any?): JSONObject {
    return when (value) {
        null -> JSONObject()
        is JSONObject -> value
        is String -> value.takeIf { it.isNotBlank() }?.let { JSONObject(it) } ?: JSONObject()
        is Map<*, *> -> JSONObject().also { output ->
            value.forEach { (key, nestedValue) ->
                if (key != null) {
                    output.put(key.toString(), jsonValueForSdk(nestedValue))
                }
            }
        }
        else -> JSONObject()
    }
}

private fun jsonValueForSdk(value: Any?): Any {
    return when (value) {
        null -> JSONObject.NULL
        is Map<*, *> -> jsonObjectFromAny(value)
        is Iterable<*> -> JSONArray().also { output ->
            value.forEach { output.put(jsonValueForSdk(it)) }
        }
        is Array<*> -> JSONArray().also { output ->
            value.forEach { output.put(jsonValueForSdk(it)) }
        }
        else -> value
    }
}

private fun JSONObject.toChannelMap(): Map<String, Any?> {
    val output = mutableMapOf<String, Any?>()
    keys().forEach { key ->
        output[key] = jsonValueForChannel(opt(key))
    }
    return output
}

private fun jsonValueForChannel(value: Any?): Any? {
    return when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> value.toChannelMap()
        is JSONArray -> List(value.length()) { index -> jsonValueForChannel(value.opt(index)) }
        else -> value
    }
}
