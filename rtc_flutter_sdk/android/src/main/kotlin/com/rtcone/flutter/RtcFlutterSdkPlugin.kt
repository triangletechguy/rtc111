package com.rtcone.flutter

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.View
import com.rtcone.sdk.RtcDashboardSession
import com.rtcone.sdk.RtcServiceSdk
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.PluginRegistry
import io.flutter.plugin.common.StandardMessageCodec
import io.flutter.plugin.platform.PlatformView
import io.flutter.plugin.platform.PlatformViewFactory
import java.util.Locale
import org.webrtc.MediaStream
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer

class RtcFlutterSdkPlugin :
    FlutterPlugin,
    MethodChannel.MethodCallHandler,
    ActivityAware,
    PluginRegistry.RequestPermissionsResultListener {

    private val channelName = "com.rtcone.sdk/rtc_flutter_sdk"
    private val localVideoViewType = "com.rtcone.sdk/rtc_flutter_sdk/local_video_view"
    private val permissionRequestCode = 57041
    private val mainHandler = Handler(Looper.getMainLooper())

    private lateinit var channel: MethodChannel
    private lateinit var appContext: Context

    private var activity: Activity? = null
    private var activityBinding: ActivityPluginBinding? = null
    private var session: RtcDashboardSession? = null
    private var pendingStart: PendingStart? = null
    private var localVideoViewFactory: RtcLocalVideoViewFactory? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        appContext = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, channelName)
        channel.setMethodCallHandler(this)

        localVideoViewFactory = RtcLocalVideoViewFactory { session?.rawSdk() }
            .also { factory ->
                binding.platformViewRegistry.registerViewFactory(localVideoViewType, factory)
            }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
        releaseSession()
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding.activity
        activityBinding = binding
        binding.addRequestPermissionsResultListener(this)
    }

    override fun onDetachedFromActivityForConfigChanges() {
        detachActivity()
    }

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
        onAttachedToActivity(binding)
    }

    override fun onDetachedFromActivity() {
        detachActivity()
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "start" -> handleStart(call, result)
            "requiredAndroidPermissions" -> handleRequiredPermissions(call, result)
            "parseToken" -> handleParseToken(call, result)
            "muteLocalAudio" -> withSession(result) {
                muteLocalAudio(call.argument<Boolean>("muted") ?: false)
                result.success(null)
            }
            "setSpeakerphoneOn" -> withSession(result) {
                setSpeakerphoneOn(call.argument<Boolean>("enabled") ?: true)
                result.success(null)
            }
            "setLocalVideoEnabled" -> withSession(result) {
                setLocalVideoEnabled(call.argument<Boolean>("enabled") ?: true)
                result.success(null)
            }
            "switchCamera" -> withSession(result) {
                result.success(switchCamera())
            }
            "setNoiseCancellationEnabled" -> withSession(result) {
                setNoiseCancellationEnabled(call.argument<Boolean>("enabled") ?: true)
                result.success(null)
            }
            "sendMessage" -> withSession(result) {
                sendMessage(call.argument<String>("text").orEmpty())
                result.success(null)
            }
            "leaveRoom" -> {
                session?.leaveRoom()
                result.success(null)
            }
            "release" -> {
                releaseSession()
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ): Boolean {
        if (requestCode != permissionRequestCode) {
            return false
        }

        val start = pendingStart ?: return true
        pendingStart = null

        val denied = permissions.filterIndexed { index, _ ->
            grantResults.getOrNull(index) != PackageManager.PERMISSION_GRANTED
        }

        if (denied.isNotEmpty()) {
            val message = "Required RTC permissions were denied: ${denied.joinToString()}"
            start.result.error("RTC_PERMISSION_DENIED", message, denied)
            emitRtcEvent("error", mapOf("message" to message))
            return true
        }

        startRtcAfterPermissions(start)
        return true
    }

    private fun handleStart(call: MethodCall, result: MethodChannel.Result) {
        val accessToken = call.argument<String>("accessToken")?.trim().orEmpty()

        if (accessToken.isBlank()) {
            result.error("RTC_TOKEN_MISSING", "RTC access token is required", null)
            return
        }

        val signalingUrl = call.argument<String>("signalingUrl")
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: RtcDashboardSession.rawDefaultSignalingUrl()
        val appId = call.argument<String>("appId")?.trim()?.takeIf { it.isNotBlank() }
        val appKey = call.argument<String>("appKey")?.trim()?.takeIf { it.isNotBlank() }
        val roomId = call.argument<String>("roomId")?.trim()?.takeIf { it.isNotBlank() }
        val rtcMode = call.argument<String>("rtcMode")?.trim()?.takeIf { it.isNotBlank() }
        val speakerOn = call.argument<Boolean>("speakerOn") ?: true
        val tokenInfo = try {
            RtcDashboardSession.parseToken(accessToken)
        } catch (error: IllegalArgumentException) {
            val message = error.message ?: "Invalid RTC access token"
            result.error("RTC_TOKEN_INVALID", message, null)
            emitRtcEvent("error", mapOf("message" to message))
            return
        }

        try {
            com.rtcone.sdk.RtcServiceSdk.validateProjectCredentials(accessToken, appId, appKey)
        } catch (error: IllegalArgumentException) {
            val message = error.message ?: "Invalid RTC project credentials"
            result.error("RTC_PROJECT_INVALID", message, null)
            emitRtcEvent("error", mapOf("message" to message))
            return
        }

        val requiredPermissions = try {
            RtcDashboardSession.requiredAndroidPermissions(accessToken)
                .ifEmpty { requiredPermissionsForMode(rtcMode ?: tokenInfo.rtcMode) }
        } catch (error: IllegalArgumentException) {
            val message = error.message ?: "Invalid RTC access token"
            result.error("RTC_TOKEN_INVALID", message, null)
            emitRtcEvent("error", mapOf("message" to message))
            return
        }
        val missingPermissions = requiredPermissions.filter { permission ->
            appContext.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED
        }
        val start = PendingStart(
            accessToken = accessToken,
            appId = appId,
            appKey = appKey,
            roomId = roomId,
            signalingUrl = signalingUrl,
            speakerOn = speakerOn,
            tokenInfo = tokenInfo,
            result = result
        )

        if (missingPermissions.isNotEmpty()) {
            val currentActivity = activity

            if (currentActivity == null) {
                result.error(
                    "RTC_ACTIVITY_MISSING",
                    "An Android Activity is required to request RTC permissions",
                    missingPermissions
                )
                return
            }

            pendingStart = start
            currentActivity.requestPermissions(
                missingPermissions.toTypedArray(),
                permissionRequestCode
            )
            return
        }

        startRtcAfterPermissions(start)
    }

    private fun handleRequiredPermissions(
        call: MethodCall,
        result: MethodChannel.Result
    ) {
        val accessToken = call.argument<String>("accessToken").orEmpty()

        try {
            result.success(RtcDashboardSession.requiredAndroidPermissions(accessToken))
        } catch (error: IllegalArgumentException) {
            result.error(
                "RTC_TOKEN_INVALID",
                error.message ?: "Invalid RTC access token",
                null
            )
        }
    }

    private fun handleParseToken(call: MethodCall, result: MethodChannel.Result) {
        val accessToken = call.argument<String>("accessToken").orEmpty()

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

    private fun startRtcAfterPermissions(start: PendingStart) {
        releaseSession()

        try {
            val nextSession = RtcDashboardSession.start(
                context = appContext,
                accessToken = start.accessToken,
                roomId = start.roomId,
                signalingUrl = start.signalingUrl,
                listener = createListener(),
                appId = start.appId,
                appKey = start.appKey
            )

            session = nextSession
            nextSession.setSpeakerphoneOn(start.speakerOn)
            localVideoViewFactory?.attachToSession(nextSession.rawSdk())
            start.result.success(
                mapOf(
                    "started" to true,
                    "appId" to (start.appId ?: start.tokenInfo.appId ?: ""),
                    "appKey" to (start.appKey ?: start.tokenInfo.appKey ?: ""),
                    "roomId" to (start.roomId ?: start.tokenInfo.roomId ?: ""),
                    "rtcMode" to (start.tokenInfo.rtcMode ?: ""),
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
                emitRtcEvent(
                    "cameraSwitched",
                    mapOf("isFrontCamera" to isFrontCamera)
                )
            }

            override fun onError(message: String) {
                emitRtcEvent("error", mapOf("message" to message))
            }
        }
    }

    private fun withSession(
        result: MethodChannel.Result,
        block: RtcDashboardSession.() -> Unit
    ) {
        val currentSession = session

        if (currentSession == null) {
            result.error("RTC_NOT_STARTED", "RTC session has not been started", null)
            return
        }

        currentSession.block()
    }

    private fun releaseSession() {
        localVideoViewFactory?.detachFromSession(releaseRenderer = true)
        session?.leaveRoom()
        session?.release()
        session = null
    }

    private fun detachActivity() {
        activityBinding?.removeRequestPermissionsResultListener(this)
        activityBinding = null
        activity = null
    }

    private fun emitRtcEvent(event: String, payload: Map<String, Any?> = emptyMap()) {
        val data = mutableMapOf<String, Any?>("event" to event)
        data.putAll(payload)

        mainHandler.post {
            if (::channel.isInitialized) {
                channel.invokeMethod("onRtcEvent", data)
            }
        }
    }

    private fun requiredPermissionsForMode(rtcMode: String?): List<String> {
        val normalizedMode = rtcMode.orEmpty().lowercase(Locale.US)
        val permissions = mutableListOf(Manifest.permission.RECORD_AUDIO)

        if (
            normalizedMode.contains("video") ||
            normalizedMode.contains("live") ||
            normalizedMode.contains("screen")
        ) {
            permissions.add(Manifest.permission.CAMERA)
        }

        return permissions.distinct()
    }

    private fun tokenInfoToMap(
        tokenInfo: com.rtcone.sdk.RtcServiceSdk.AccessTokenInfo
    ): Map<String, Any?> {
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
        val signalingUrl: String,
        val speakerOn: Boolean,
        val tokenInfo: com.rtcone.sdk.RtcServiceSdk.AccessTokenInfo,
        val result: MethodChannel.Result
    )
}

private fun RtcDashboardSession.Companion.rawDefaultSignalingUrl(): String {
    return com.rtcone.sdk.RtcServiceSdk.DEFAULT_SIGNALING_URL
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
    private val renderer = SurfaceViewRenderer(context)
    private var attachedSdk: RtcServiceSdk? = null
    private var rendererInitialized = false

    init {
        renderer.setBackgroundColor(Color.BLACK)
        renderer.setEnableHardwareScaler(true)
        renderer.setMirror(creationParams.booleanParam("mirror", defaultValue = true))
        renderer.setScalingType(
            when (creationParams.stringParam("fit", defaultValue = "cover")) {
                "contain" -> RendererCommon.ScalingType.SCALE_ASPECT_FIT
                else -> RendererCommon.ScalingType.SCALE_ASPECT_FILL
            }
        )
    }

    override fun getView(): View = renderer

    fun attachTo(sdk: RtcServiceSdk?) {
        if (attachedSdk === sdk) {
            return
        }

        detachFromSdk(releaseRenderer = true)
        attachedSdk = sdk

        if (sdk != null) {
            sdk.attachLocalRenderer(renderer, initializeRenderer = !rendererInitialized)
            rendererInitialized = true
        }
    }

    fun detachFromSdk(releaseRenderer: Boolean = false) {
        attachedSdk?.detachLocalRenderer(renderer, releaseRenderer = false)
        attachedSdk = null

        if (releaseRenderer && rendererInitialized) {
            renderer.release()
            rendererInitialized = false
        }
    }

    override fun dispose() {
        detachFromSdk(releaseRenderer = true)
        onDispose(this)
    }
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
