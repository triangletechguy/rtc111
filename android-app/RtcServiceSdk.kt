import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.projection.MediaProjection
import android.util.Base64
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera1Enumerator
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraEnumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SessionDescription
import org.webrtc.SdpObserver
import org.webrtc.SurfaceTextureHelper
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoSink
import org.webrtc.VideoTrack
import org.webrtc.audio.AudioDeviceModule
import org.webrtc.audio.AudioProcessingComponentOptions
import org.webrtc.audio.AudioProcessingMode
import org.webrtc.audio.AudioProcessingOptions
import org.webrtc.audio.JavaAudioDeviceModule
import java.nio.charset.Charset
import java.util.Locale
import java.util.UUID

class RtcServiceSdk(
    private val context: Context,
    private val config: Config,
    private val listener: Listener
) {

    data class Config(
        val signalingUrl: String,
        val accessToken: String,
        val roomId: String,
        val enableAudio: Boolean = true,
        val enableVideo: Boolean = true,
        val enableNoiseCancellation: Boolean = true,
        val videoWidth: Int = 1280,
        val videoHeight: Int = 720,
        val videoFps: Int = 30,
        val rtcMode: String = if (enableVideo) "video" else "voice",
        val iceServers: List<PeerConnection.IceServer> = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
        ),
        val appId: String? = RtcServiceSdk.DEFAULT_APP_ID,
        val appKey: String? = RtcServiceSdk.DEFAULT_APP_KEY
    ) {
        init {
            RtcServiceSdk.validateProjectCredentials(accessToken, appId, appKey)
        }

        companion object {
            fun audioRoom(
                signalingUrl: String,
                accessToken: String,
                roomId: String,
                iceServers: List<PeerConnection.IceServer> = listOf(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
                )
            ): Config = Config(
                signalingUrl = signalingUrl,
                accessToken = accessToken,
                roomId = roomId,
                enableAudio = true,
                enableVideo = false,
                enableNoiseCancellation = true,
                rtcMode = "voice",
                iceServers = iceServers
            )

            fun voiceCall(
                signalingUrl: String,
                accessToken: String,
                roomId: String,
                iceServers: List<PeerConnection.IceServer> = listOf(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
                )
            ): Config = audioRoom(signalingUrl, accessToken, roomId, iceServers)

            fun groupVoice(
                signalingUrl: String,
                accessToken: String,
                roomId: String,
                iceServers: List<PeerConnection.IceServer> = listOf(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
                )
            ): Config = audioRoom(signalingUrl, accessToken, roomId, iceServers)

            fun videoCall(
                signalingUrl: String,
                accessToken: String,
                roomId: String,
                iceServers: List<PeerConnection.IceServer> = listOf(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
                )
            ): Config = Config(
                signalingUrl = signalingUrl,
                accessToken = accessToken,
                roomId = roomId,
                enableAudio = true,
                enableVideo = true,
                rtcMode = "video",
                iceServers = iceServers
            )

            fun oneToOneVideoCall(
                signalingUrl: String,
                accessToken: String,
                roomId: String,
                iceServers: List<PeerConnection.IceServer> = listOf(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
                )
            ): Config = videoCall(signalingUrl, accessToken, roomId, iceServers)

            fun groupVideo(
                signalingUrl: String,
                accessToken: String,
                roomId: String,
                iceServers: List<PeerConnection.IceServer> = listOf(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
                )
            ): Config = videoCall(signalingUrl, accessToken, roomId, iceServers)

            fun soloVideoLive(
                signalingUrl: String,
                accessToken: String,
                roomId: String,
                iceServers: List<PeerConnection.IceServer> = listOf(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
                )
            ): Config = videoCall(signalingUrl, accessToken, roomId, iceServers)

            fun livePk(
                signalingUrl: String,
                accessToken: String,
                roomId: String,
                iceServers: List<PeerConnection.IceServer> = listOf(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
                )
            ): Config = videoCall(signalingUrl, accessToken, roomId, iceServers)

            fun screenShare(
                signalingUrl: String,
                accessToken: String,
                roomId: String,
                iceServers: List<PeerConnection.IceServer> = listOf(
                    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
                )
            ): Config = videoCall(signalingUrl, accessToken, roomId, iceServers)

            fun dashboardToken(
                accessToken: String,
                roomId: String? = null,
                signalingUrl: String = RtcServiceSdk.DEFAULT_SIGNALING_URL,
                iceServers: List<PeerConnection.IceServer> = RtcServiceSdk.defaultIceServers(),
                appId: String? = null,
                appKey: String? = null,
                rtcMode: String? = null
            ): Config {
                val tokenInfo = RtcServiceSdk.parseAccessToken(accessToken)
                val resolvedRoomId = roomId?.takeIf { it.isNotBlank() }
                    ?: tokenInfo.roomId?.takeIf { it.isNotBlank() }
                    ?: throw IllegalArgumentException("Room id is required when the RTC token does not include roomId")
                val resolvedRtcMode = rtcMode?.trim()?.takeIf { it.isNotBlank() }
                    ?: tokenInfo.rtcMode

                val enableVideo = RtcServiceSdk.shouldEnableVideo(tokenInfo, resolvedRtcMode)
                val enableAudio = RtcServiceSdk.shouldEnableAudio(tokenInfo)

                return Config(
                    signalingUrl = signalingUrl,
                    accessToken = accessToken,
                    roomId = resolvedRoomId,
                    enableAudio = enableAudio,
                    enableVideo = enableVideo,
                    enableNoiseCancellation = enableAudio,
                    rtcMode = resolvedRtcMode ?: if (enableVideo) "video" else "voice",
                    iceServers = iceServers,
                    appId = appId ?: RtcServiceSdk.DEFAULT_APP_ID,
                    appKey = appKey ?: RtcServiceSdk.DEFAULT_APP_KEY
                )
            }
        }
    }

    data class AccessTokenInfo(
        val rawToken: String,
        val appId: String?,
        val appKey: String?,
        val roomId: String?,
        val userId: String?,
        val externalUserId: String?,
        val role: String?,
        val rtcMode: String?,
        val permissions: List<String>,
        val issuedAtEpochSeconds: Long?,
        val expiresAtEpochSeconds: Long?,
        val issuer: String?,
        val subject: String?,
        val tokenId: String?,
        val claims: JSONObject
    ) {
        fun isExpired(nowMillis: Long = System.currentTimeMillis(), skewSeconds: Long = 30): Boolean {
            val expiresAt = expiresAtEpochSeconds ?: return false
            return nowMillis >= (expiresAt - skewSeconds).coerceAtLeast(0) * 1000
        }

        fun hasPermission(permission: String): Boolean {
            return permissions.any { it.equals(permission, ignoreCase = true) }
        }
    }

    data class VideoEffects(
        val filter: String = "none",
        val aiFilter: String = "none",
        val sticker: String = "",
        val faceDetectEnabled: Boolean = false,
        val beautyEnabled: Boolean = false,
        val beautyLevel: Int = 0,
        val smoothingLevel: Int = 0,
        val whiteningLevel: Int = 0,
        val eyeLevel: Int = 0,
        val faceSlimLevel: Int = 0,
        val makeup: JSONObject = JSONObject()
    ) {
        fun toJson(): JSONObject {
            return JSONObject()
                .put("filter", filter.ifBlank { "none" })
                .put("aiFilter", aiFilter.ifBlank { "none" })
                .put("sticker", sticker)
                .put("faceDetectEnabled", faceDetectEnabled)
                .put("beautyEnabled", beautyEnabled)
                .put("beautyLevel", clamp(beautyLevel))
                .put("smoothingLevel", clamp(smoothingLevel))
                .put("whiteningLevel", clamp(whiteningLevel))
                .put("eyeLevel", clamp(eyeLevel))
                .put("faceSlimLevel", clamp(faceSlimLevel))
                .put("makeup", JSONObject(makeup.toString()))
        }

        companion object {
            fun natural(
                beautyLevel: Int = 65,
                smoothingLevel: Int = 55,
                whiteningLevel: Int = 35,
                eyeLevel: Int = 20,
                faceSlimLevel: Int = 20
            ): VideoEffects = VideoEffects(
                filter = "soft",
                aiFilter = "portrait",
                faceDetectEnabled = true,
                beautyEnabled = true,
                beautyLevel = beautyLevel,
                smoothingLevel = smoothingLevel,
                whiteningLevel = whiteningLevel,
                eyeLevel = eyeLevel,
                faceSlimLevel = faceSlimLevel
            )

            fun glam(
                lipstick: String = "rose",
                blush: String = "peach",
                beautyLevel: Int = 75
            ): VideoEffects = VideoEffects(
                filter = "glow",
                aiFilter = "portrait",
                faceDetectEnabled = true,
                beautyEnabled = true,
                beautyLevel = beautyLevel,
                smoothingLevel = 65,
                whiteningLevel = 45,
                eyeLevel = 35,
                faceSlimLevel = 30,
                makeup = JSONObject()
                    .put("lipstick", lipstick)
                    .put("blush", blush)
                    .put("contour", "soft")
            )

            fun sticker(sticker: String, filter: String = "soft"): VideoEffects = natural()
                .copy(filter = filter, sticker = sticker)

            private fun clamp(level: Int): Int = level.coerceIn(0, 100)
        }
    }

    interface VideoEffectProcessor {
        fun onVideoEffectsChanged(effects: JSONObject)
    }

    enum class ConnectionIndicator {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        JOINING_ROOM,
        IN_ROOM,
        WAITING_FOR_PEER,
        PEER_CONNECTING,
        PEER_CONNECTED,
        RECONNECTING,
        FAILED
    }

    interface Listener {
        fun onConnected(socketId: String) {}
        fun onDisconnected(reason: String) {}
        fun onJoiningRoom(roomId: String) {}
        fun onRoomJoined(roomId: String) {}
        fun onRoomLeft(roomId: String) {}
        fun onRoomFull() {}
        fun onRoomError(message: String) {}
        fun onRoomState(participantCount: Int) {}
        fun onRoomUpdated(room: JSONObject) {}
        fun onRoomEntryNotification(event: JSONObject) {}
        fun onRoomKicked(event: JSONObject) {}
        fun onRoomKickHistory(event: JSONObject) {}
        fun onRoomLiked(event: JSONObject) {}
        fun onRoomShared(event: JSONObject) {}
        fun onWaitingForPeer() {}
        fun onPeerJoined(peerId: String) {}
        fun onPeerLeft(peerId: String) {}
        fun onParticipantJoined(peerId: String) {}
        fun onParticipantLeft(peerId: String, reason: String) {}
        fun onParticipantUpdated(peerId: String, micEnabled: Boolean, cameraEnabled: Boolean) {}
        fun onParticipantMicMuted(event: JSONObject) {}
        fun onMessageHistory(event: JSONObject) {}
        fun onMessageReceived(message: JSONObject) {}
        fun onMessageUpdated(message: JSONObject) {}
        fun onMessageBlocked(event: JSONObject) {}
        fun onMessageError(event: JSONObject) {}
        fun onCommentReceived(comment: JSONObject) {}
        fun onCommentCleaned(event: JSONObject) {}
        fun onGiftHistory(event: JSONObject) {}
        fun onGiftReceived(gift: JSONObject) {}
        fun onChatBanStateChanged(event: JSONObject) {}
        fun onChatBanHistory(event: JSONObject) {}
        fun onUserBlockUpdated(event: JSONObject) {}
        fun onYoutubeStateChanged(state: JSONObject) {}
        fun onYoutubeError(message: String) {}
        fun onSecurityChecked(result: JSONObject) {}
        fun onSecurityIncident(incident: JSONObject) {}
        fun onScreenShareStateChanged(peerId: String, enabled: Boolean) {}
        fun onVideoEffectsChanged(peerId: String, effects: JSONObject) {}
        fun onLocalScreenShareStarted() {}
        fun onLocalScreenShareStopped() {}
        fun onLocalVideoEffectsChanged(effects: JSONObject) {}
        fun onLivePkStateChanged(state: JSONObject) {}
        fun onLocalStream(stream: MediaStream) {}
        fun onRemoteStream(stream: MediaStream) {}
        fun onRemoteStreamForPeer(peerId: String, stream: MediaStream) {}
        fun onLocalAudioMuted(muted: Boolean) {}
        fun onNoiseCancellationChanged(enabled: Boolean) {}
        fun onLocalVideoEnabled(enabled: Boolean) {}
        fun onCameraSwitched(isFrontCamera: Boolean) {}
        fun onLocalMediaStateChanged(micEnabled: Boolean, cameraEnabled: Boolean, speakerEnabled: Boolean) {}
        fun onSpeakerphoneChanged(enabled: Boolean) {}
        fun onConnectionStateChanged(state: PeerConnection.PeerConnectionState) {}
        fun onRtcConnectionIndicatorChanged(indicator: ConnectionIndicator) {}
        fun onError(message: String) {}
    }

    private val eglBase = EglBase.create()
    private val pendingIceCandidatesByPeer = mutableMapOf<String, MutableList<IceCandidate>>()
    private val peerConnections = mutableMapOf<String, PeerConnection>()
    private val remoteVideoTracks = mutableSetOf<VideoTrack>()
    private val videoCaptureFormats = listOf(
        VideoCaptureFormat(1280, 720, 30),
        VideoCaptureFormat(960, 540, 30),
        VideoCaptureFormat(640, 480, 30),
        VideoCaptureFormat(640, 360, 30),
        VideoCaptureFormat(320, 240, 15)
    )

    private var socket: Socket? = null
    private var audioDeviceModule: AudioDeviceModule? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var localStream: MediaStream? = null
    private var remotePeerId: String? = null
    private var localRenderer: SurfaceViewRenderer? = null
    private var remoteRenderer: SurfaceViewRenderer? = null
    private var localVideoSink: VideoSink? = null
    private var remoteVideoSink: VideoSink? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var videoCapturer: VideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var audioSource: AudioSource? = null
    private var videoTrack: VideoTrack? = null
    private var audioTrack: AudioTrack? = null
    private var micEnabled = config.enableAudio
    private var cameraEnabled = config.enableVideo
    private var noiseCancellationEnabled = config.enableNoiseCancellation
    private var speakerEnabled = true
    private var screenShareEnabled = false
    private var videoEffects = createDefaultVideoEffects()
    private var currentRoomId: String? = null
    private var joiningRoomId: String? = null
    private var autoJoinRoomId: String? = null
    private var pendingLeaveRoomId: String? = null
    private var connectionIndicator = ConnectionIndicator.DISCONNECTED
    private var videoEffectProcessor: VideoEffectProcessor? = null

    private data class CapturedVideoTrack(
        val capturer: VideoCapturer,
        val source: VideoSource,
        val textureHelper: SurfaceTextureHelper,
        val track: VideoTrack
    )

    private data class VideoCaptureFormat(
        val width: Int,
        val height: Int,
        val fps: Int
    )

    fun attachRenderers(
        localRenderer: SurfaceViewRenderer?,
        remoteRenderer: SurfaceViewRenderer?,
        initializeRenderers: Boolean = true
    ) {
        attachLocalRenderer(localRenderer, initializeRenderers)
        attachRemoteRenderer(remoteRenderer, initializeRenderers)
    }

    @JvmOverloads
    fun attachLocalRenderer(
        renderer: SurfaceViewRenderer?,
        initializeRenderer: Boolean = true
    ) {
        val previousRenderer = localRenderer

        if (previousRenderer === renderer) {
            return
        }

        previousRenderer?.let { detachLocalVideoSink(it) }
        localRenderer = renderer

        renderer?.let {
            if (initializeRenderer) {
                it.init(eglBase.eglBaseContext, null)
            }
            attachLocalVideoSink(it)
        }
    }

    @JvmOverloads
    fun attachRemoteRenderer(
        renderer: SurfaceViewRenderer?,
        initializeRenderer: Boolean = true
    ) {
        val previousRenderer = remoteRenderer

        if (previousRenderer === renderer) {
            return
        }

        previousRenderer?.let { detachRemoteVideoSink(it) }
        remoteRenderer = renderer

        renderer?.let { rendererView ->
            if (initializeRenderer) {
                rendererView.init(eglBase.eglBaseContext, null)
            }
            attachRemoteVideoSink(rendererView)
        }
    }

    fun attachLocalVideoSink(sink: VideoSink?) {
        val previousSink = localVideoSink

        if (previousSink === sink) {
            return
        }

        previousSink?.let { videoTrack?.removeSink(it) }
        localVideoSink = sink
        sink?.let { videoTrack?.addSink(it) }
    }

    fun attachRemoteVideoSink(sink: VideoSink?) {
        val previousSink = remoteVideoSink

        if (previousSink === sink) {
            return
        }

        previousSink?.let { removeRemoteVideoSink(it) }
        remoteVideoSink = sink
        sink?.let { nextSink ->
            remoteVideoTracks.forEach { track -> track.addSink(nextSink) }
        }
    }

    @JvmOverloads
    fun detachRenderers(releaseRenderers: Boolean = false) {
        localRenderer?.let { detachLocalRenderer(it, releaseRenderers) }
        remoteRenderer?.let { detachRemoteRenderer(it, releaseRenderers) }
    }

    @JvmOverloads
    fun detachLocalRenderer(
        renderer: SurfaceViewRenderer,
        releaseRenderer: Boolean = false
    ) {
        if (localRenderer !== renderer) {
            return
        }

        detachLocalVideoSink(renderer)
        localRenderer = null

        if (releaseRenderer) {
            renderer.release()
        }
    }

    @JvmOverloads
    fun detachRemoteRenderer(
        renderer: SurfaceViewRenderer,
        releaseRenderer: Boolean = false
    ) {
        if (remoteRenderer !== renderer) {
            return
        }

        detachRemoteVideoSink(renderer)
        remoteRenderer = null

        if (releaseRenderer) {
            renderer.release()
        }
    }

    fun detachLocalVideoSink(sink: VideoSink) {
        if (localVideoSink !== sink) {
            return
        }

        videoTrack?.removeSink(sink)
        localVideoSink = null
    }

    fun detachRemoteVideoSink(sink: VideoSink) {
        if (remoteVideoSink !== sink) {
            return
        }

        removeRemoteVideoSink(sink)
        remoteVideoSink = null
    }

    fun accessTokenInfo(): AccessTokenInfo {
        return parseAccessToken(config.accessToken)
    }

    fun requiredAndroidPermissions(): List<String> {
        return requiredAndroidPermissions(config)
    }

    fun missingRequiredAndroidPermissions(): List<String> {
        return requiredAndroidPermissions().filter { permission ->
            context.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED
        }
    }

    fun hasRequiredAndroidPermissions(): Boolean {
        return missingRequiredAndroidPermissions().isEmpty()
    }

    @JvmOverloads
    fun start(initialEffects: JSONObject? = null) {
        val roomId = config.roomId

        if (roomId.isBlank()) {
            listener.onRoomError("Room id is required")
            return
        }

        when (RtcServiceSdk.normalizeRtcMode(config.rtcMode)) {
            "voice",
            "audio",
            "voice_call",
            "one_to_one_voice",
            "one_to_one_voice_call",
            "group_voice",
            "group_voice_chat",
            "youtube",
            "youtube_room" -> connectAndJoin(roomId)
            "solo_video_live",
            "solo_live" -> connectAndJoinSoloVideoLive(roomId, initialEffects)
            "live_pk",
            "pk" -> connectAndJoinLivePkRoom(roomId, initialEffects)
            else -> {
                if (config.enableVideo) {
                    connectAndJoinVideoCall(roomId, initialEffects)
                } else {
                    connectAndJoin(roomId)
                }
            }
        }
    }

    fun connect() {
        if (config.accessToken.isBlank()) {
            listener.onError("Access token must be provided by host app code (not UI)")
            return
        }

        if (socket?.connected() == true) {
            listener.onConnected(socket?.id().orEmpty())
            return
        }

        updateConnectionIndicator(ConnectionIndicator.CONNECTING)

        val options = IO.Options().apply {
            auth = mapOf("token" to config.accessToken)
            transports = arrayOf("websocket", "polling")
        }

        socket = IO.socket(config.signalingUrl, options).also { socket ->
            bindSocketEvents(socket)
            socket.connect()
        }
    }

    fun connectAndJoin(roomId: String = config.roomId) {
        if (roomId.isBlank()) {
            listener.onRoomError("Room id is required")
            return
        }

        if (!ensureLocalMediaStarted()) {
            return
        }

        autoJoinRoomId = roomId

        if (socket?.connected() == true) {
            autoJoinRoomId = null
            joinRoom(roomId)
            return
        }

        connect()
    }

    fun connectAndJoinVideoCall(roomId: String = config.roomId, initialEffects: JSONObject? = null) {
        prepareVideoRoom(initialEffects)
        connectAndJoin(roomId)
    }

    fun connectAndJoinOneToOneVideoCall(roomId: String = config.roomId, initialEffects: JSONObject? = null) {
        connectAndJoinVideoCall(roomId, initialEffects)
    }

    fun connectAndJoinSoloVideoLive(roomId: String = config.roomId, initialEffects: JSONObject? = null) {
        prepareVideoRoom(initialEffects)
        connectAndJoin(roomId)
    }

    fun connectAndJoinLivePkRoom(roomId: String = config.roomId, initialEffects: JSONObject? = null) {
        prepareVideoRoom(initialEffects)
        connectAndJoin(roomId)
    }

    fun joinAudioRoom(roomId: String = config.roomId) {
        cameraEnabled = false
        videoTrack?.setEnabled(false)
        listener.onLocalVideoEnabled(false)
        emitMediaState()
        joinRoom(roomId)
    }

    fun joinVoiceCall(roomId: String = config.roomId) {
        joinAudioRoom(roomId)
    }

    fun joinGroupVoiceRoom(roomId: String = config.roomId) {
        joinAudioRoom(roomId)
    }

    fun joinYoutubeRoom(roomId: String = config.roomId) {
        joinAudioRoom(roomId)
    }

    fun joinVideoRoom(roomId: String = config.roomId, initialEffects: JSONObject? = null) {
        prepareVideoRoom(initialEffects)
        joinRoom(roomId)
    }

    fun joinVideoCall(roomId: String = config.roomId, initialEffects: JSONObject? = null) {
        joinVideoRoom(roomId, initialEffects)
    }

    fun joinOneToOneVideoCall(roomId: String = config.roomId, initialEffects: JSONObject? = null) {
        joinVideoCall(roomId, initialEffects)
    }

    fun joinGroupVideoRoom(roomId: String = config.roomId, initialEffects: JSONObject? = null) {
        joinVideoRoom(roomId, initialEffects)
    }

    fun joinSoloVideoLive(roomId: String = config.roomId, initialEffects: JSONObject? = null) {
        joinVideoRoom(roomId, initialEffects)
    }

    fun joinLivePkRoom(roomId: String = config.roomId, initialEffects: JSONObject? = null) {
        joinVideoRoom(roomId, initialEffects)
    }

    fun joinRoom(roomId: String = config.roomId) {
        if (roomId.isBlank()) {
            listener.onRoomError("Room id is required")
            return
        }

        if (socket?.connected() != true) {
            listener.onError("Connect before joining a room")
            return
        }

        if (!ensureLocalMediaStarted()) {
            return
        }

        joiningRoomId = roomId
        updateConnectionIndicator(ConnectionIndicator.JOINING_ROOM)
        socket?.emit(
            "room:join",
            JSONObject()
                .put("roomId", roomId)
                .put("rtcMode", config.rtcMode)
                .put("rtc_mode", config.rtcMode)
                .put("micEnabled", micEnabled)
                .put("cameraEnabled", cameraEnabled)
                .put("noiseCancellationEnabled", noiseCancellationEnabled)
                .put("screenShareEnabled", screenShareEnabled)
                .put("videoEffects", videoEffects)
                .put("speakerEnabled", speakerEnabled)
        )
        listener.onJoiningRoom(roomId)
    }

    fun startLocalMedia() {
        ensureLocalMediaStarted()
    }

    private fun ensureLocalMediaStarted(): Boolean {
        if (localStream != null) {
            localStream?.let { listener.onLocalStream(it) }
            return true
        }

        val missingPermissions = missingRequiredAndroidPermissions()

        if (missingPermissions.isNotEmpty()) {
            listener.onError("Missing Android runtime permissions: ${missingPermissions.joinToString(", ")}")
            return false
        }

        val factory = getPeerConnectionFactory()
        val stream = factory.createLocalMediaStream("local-${UUID.randomUUID()}")

        if (config.enableAudio) {
            val audio = try {
                createLocalAudioTrack(factory)
            } catch (error: Exception) {
                listener.onError(error.message ?: "Unable to start microphone capture")
                return false
            }
            stream.addTrack(audio)
        }

        if (config.enableVideo && cameraEnabled) {
            val video = createLocalVideoTrack(factory)

            if (video == null) {
                listener.onError("Unable to start camera capture")
                return false
            }

            stream.addTrack(video)
        }

        localStream = stream
        listener.onLocalStream(stream)
        return true
    }

    fun leaveRoom() {
        val roomId = currentRoomId ?: joiningRoomId ?: config.roomId
        pendingLeaveRoomId = roomId
        socket?.emit("room:leave")
        closePeerConnection()

        if (socket?.connected() != true) {
            currentRoomId = null
            joiningRoomId = null
            pendingLeaveRoomId = null
            listener.onRoomLeft(roomId)
            updateConnectionIndicator(ConnectionIndicator.DISCONNECTED)
        }
    }

    fun muteLocalAudio(muted: Boolean) {
        micEnabled = !muted
        audioTrack?.setEnabled(micEnabled)
        audioDeviceModule?.setMicrophoneMute(muted)
        emitMediaState()
        listener.onLocalAudioMuted(muted)
    }

    fun setNoiseCancellationEnabled(enabled: Boolean) {
        val changed = noiseCancellationEnabled != enabled
        noiseCancellationEnabled = enabled

        if (localStream != null && config.enableAudio) {
            val applied = audioTrack?.let { applyAudioProcessingOptions(it) } == true

            if (!applied && changed) {
                replaceLocalAudioTrack()
            }

            if (!applied && enabled) {
                listener.onError("Noise cancellation is not available on this Android audio path")
            }
        }

        emitMediaState()
        listener.onNoiseCancellationChanged(enabled)
    }

    fun setLocalVideoEnabled(enabled: Boolean) {
        if (enabled && !config.enableVideo) {
            listener.onError("Video is disabled in this SDK config")
            return
        }

        cameraEnabled = enabled

        if (enabled && videoTrack == null) {
            val factory = getPeerConnectionFactory()
            val track = createLocalVideoTrack(factory)

            if (track == null) {
                cameraEnabled = false
                emitMediaState()
                listener.onLocalVideoEnabled(false)
                return
            }

            track.let {
                val stream = localStream

                if (stream != null) {
                    stream.addTrack(it)
                    peerConnections.values.forEach { connection ->
                        connection.addTrack(it, listOf(stream.id))
                    }
                    peerConnections.keys.toList().forEach { createOffer(it) }
                }
            }
        }

        videoTrack?.setEnabled(enabled)
        emitMediaState()
        listener.onLocalVideoEnabled(enabled)
    }

    fun switchCamera(): Boolean {
        if (!config.enableVideo) {
            listener.onError("Video is disabled in this SDK config")
            return false
        }

        val cameraCapturer = videoCapturer as? CameraVideoCapturer

        if (cameraCapturer == null) {
            listener.onError("No camera capturer is available")
            return false
        }

        cameraCapturer.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
            override fun onCameraSwitchDone(isFrontCamera: Boolean) {
                listener.onCameraSwitched(isFrontCamera)
            }

            override fun onCameraSwitchError(error: String?) {
                listener.onError(error ?: "Unable to switch camera")
            }
        })

        return true
    }

    fun setScreenShareEnabled(enabled: Boolean) {
        screenShareEnabled = enabled
        emitScreenShareState(enabled)
    }

    fun startScreenShare(
        mediaProjectionPermissionResultData: Intent,
        mediaProjectionCallback: MediaProjection.Callback,
        width: Int = config.videoWidth,
        height: Int = config.videoHeight,
        fps: Int = config.videoFps
    ): Boolean {
        return startScreenShare(
            ScreenCapturerAndroid(mediaProjectionPermissionResultData, mediaProjectionCallback),
            width,
            height,
            fps
        )
    }

    fun startScreenShare(
        screenCapturer: VideoCapturer,
        width: Int = config.videoWidth,
        height: Int = config.videoHeight,
        fps: Int = config.videoFps
    ): Boolean {
        if (!config.enableVideo) {
            listener.onError("Video is disabled in this SDK config")
            return false
        }

        cameraEnabled = true
        val replaced = replaceLocalVideoTrack(screenCapturer, width, height, fps)

        if (replaced) {
            screenShareEnabled = true
            emitScreenShareState(true)
            listener.onLocalScreenShareStarted()
        }

        return replaced
    }

    fun stopScreenShare(
        width: Int = config.videoWidth,
        height: Int = config.videoHeight,
        fps: Int = config.videoFps
    ): Boolean {
        if (!screenShareEnabled) {
            return true
        }

        val cameraCapturer = createCameraCapturer()

        if (cameraCapturer == null) {
            listener.onError("No camera capturer is available")
            return false
        }

        val replaced = replaceLocalVideoTrack(cameraCapturer, width, height, fps)

        if (replaced) {
            screenShareEnabled = false
            emitScreenShareState(false)
            listener.onLocalScreenShareStopped()
        }

        return replaced
    }

    fun setCameraCapturer(
        capturer: VideoCapturer,
        width: Int = config.videoWidth,
        height: Int = config.videoHeight,
        fps: Int = config.videoFps
    ): Boolean {
        if (!config.enableVideo) {
            listener.onError("Video is disabled in this SDK config")
            return false
        }

        cameraEnabled = true
        val replaced = replaceLocalVideoTrack(capturer, width, height, fps)

        if (replaced && screenShareEnabled) {
            screenShareEnabled = false
            emitScreenShareState(false)
            listener.onLocalScreenShareStopped()
        }

        return replaced
    }

    fun setVideoEffectProcessor(processor: VideoEffectProcessor?) {
        videoEffectProcessor = processor
        processor?.onVideoEffectsChanged(JSONObject(videoEffects.toString()))
    }

    fun setVideoEffects(effects: JSONObject) {
        videoEffects = mergeJsonObjects(videoEffects, effects)
        videoEffectProcessor?.onVideoEffectsChanged(JSONObject(videoEffects.toString()))
        socket?.emit("video:effects", videoEffects)
        emitMediaState()
        listener.onLocalVideoEffectsChanged(JSONObject(videoEffects.toString()))
    }

    fun setVideoEffects(effects: VideoEffects) {
        setVideoEffects(effects.toJson())
    }

    fun setVideoFilter(filter: String) {
        setVideoEffects(JSONObject().put("filter", filter.ifBlank { "none" }))
    }

    fun setAiFilter(aiFilter: String) {
        setVideoEffects(JSONObject().put("aiFilter", aiFilter.ifBlank { "none" }))
    }

    fun setSticker(sticker: String) {
        setVideoEffects(JSONObject().put("sticker", sticker))
    }

    fun setFaceDetectEnabled(enabled: Boolean) {
        setVideoEffects(JSONObject().put("faceDetectEnabled", enabled))
    }

    fun setBeautyEnabled(enabled: Boolean, beautyLevel: Int = if (enabled) 65 else 0) {
        setVideoEffects(
            JSONObject()
                .put("beautyEnabled", enabled)
                .put("beautyLevel", clampEffectLevel(beautyLevel))
        )
    }

    fun setBeautyLevels(
        beautyLevel: Int = 65,
        smoothingLevel: Int = 55,
        whiteningLevel: Int = 35,
        eyeLevel: Int = 20,
        faceSlimLevel: Int = 20
    ) {
        setVideoEffects(
            JSONObject()
                .put("beautyEnabled", true)
                .put("faceDetectEnabled", true)
                .put("beautyLevel", clampEffectLevel(beautyLevel))
                .put("smoothingLevel", clampEffectLevel(smoothingLevel))
                .put("whiteningLevel", clampEffectLevel(whiteningLevel))
                .put("eyeLevel", clampEffectLevel(eyeLevel))
                .put("faceSlimLevel", clampEffectLevel(faceSlimLevel))
        )
    }

    fun setBeautyMakeup(makeup: JSONObject) {
        setVideoEffects(
            JSONObject()
                .put("beautyEnabled", true)
                .put("faceDetectEnabled", true)
                .put("makeup", JSONObject(makeup.toString()))
        )
    }

    fun applyLiveBeautyPreset(preset: String = "natural") {
        val effects = when (preset.trim().lowercase()) {
            "glam", "makeup" -> VideoEffects.glam()
            "sticker", "cute" -> VideoEffects.sticker("crown")
            "clear", "off", "none" -> VideoEffects()
            else -> VideoEffects.natural()
        }

        setVideoEffects(effects)
    }

    fun clearVideoEffects() {
        videoEffects = createDefaultVideoEffects()
        videoEffectProcessor?.onVideoEffectsChanged(JSONObject(videoEffects.toString()))
        socket?.emit("video:effects", videoEffects)
        emitMediaState()
        listener.onLocalVideoEffectsChanged(JSONObject(videoEffects.toString()))
    }

    fun setSpeakerphoneOn(enabled: Boolean) {
        speakerEnabled = enabled
        configureAudioForCall()
        emitMediaState()
        listener.onSpeakerphoneChanged(enabled)
    }

    fun setYoutubeVideo(
        videoIdOrUrl: String,
        title: String? = null,
        positionSeconds: Double = 0.0,
        playbackState: String = "ready"
    ) {
        val payload = JSONObject()
            .put("positionSeconds", positionSeconds)
            .put("playbackState", playbackState)

        if (videoIdOrUrl.startsWith("http://") || videoIdOrUrl.startsWith("https://")) {
            payload.put("videoUrl", videoIdOrUrl)
        } else {
            payload.put("videoId", videoIdOrUrl)
        }

        title?.takeIf { it.isNotBlank() }?.let { payload.put("title", it) }
        updateYoutubeState(payload)
    }

    fun playYoutube(positionSeconds: Double? = null) {
        updateYoutubeState(
            JSONObject()
                .put("playbackState", "playing")
                .apply {
                    positionSeconds?.let { put("positionSeconds", it) }
                }
        )
    }

    fun pauseYoutube(positionSeconds: Double? = null) {
        updateYoutubeState(
            JSONObject()
                .put("playbackState", "paused")
                .apply {
                    positionSeconds?.let { put("positionSeconds", it) }
                }
        )
    }

    fun stopYoutube(positionSeconds: Double? = null) {
        updateYoutubeState(
            JSONObject()
                .put("playbackState", "stopped")
                .apply {
                    positionSeconds?.let { put("positionSeconds", it) }
                }
        )
    }

    fun seekYoutube(positionSeconds: Double) {
        updateYoutubeState(JSONObject().put("positionSeconds", positionSeconds))
    }

    fun updateYoutubeState(payload: JSONObject) {
        socket?.emit("youtube:update", payload)
    }

    fun updateLivePkState(payload: JSONObject) {
        socket?.emit("live:pk:update", payload)
    }

    fun startLivePk(opponentUserId: String? = null, metadata: JSONObject? = null) {
        val payload = JSONObject()
            .put("status", if (opponentUserId.isNullOrBlank()) "matching" else "active")

        opponentUserId?.takeIf { it.isNotBlank() }?.let { payload.put("opponentUserId", it) }
        metadata?.let { payload.put("metadata", it) }
        updateLivePkState(payload)
    }

    fun updateLivePkScore(hostScore: Int, opponentScore: Int, metadata: JSONObject? = null) {
        val payload = JSONObject()
            .put("status", "active")
            .put("hostScore", hostScore)
            .put("opponentScore", opponentScore)

        metadata?.let { payload.put("metadata", it) }
        updateLivePkState(payload)
    }

    fun endLivePk(metadata: JSONObject? = null) {
        val payload = JSONObject().put("status", "ended")

        metadata?.let { payload.put("metadata", it) }
        updateLivePkState(payload)
    }

    fun checkSecurity(text: String, category: String = "text") {
        socket?.emit(
            "security:check",
            JSONObject()
                .put("text", text)
                .put("category", category)
        )
    }

    fun reportSecurityIncident(
        message: String,
        category: String = "manual_report",
        targetUserId: String? = null,
        severity: String? = null,
        blocked: Boolean? = null,
        metadata: JSONObject? = null
    ) {
        val payload = JSONObject()
            .put("message", message)
            .put("category", category)

        targetUserId?.takeIf { it.isNotBlank() }?.let { payload.put("targetUserId", it) }
        severity?.takeIf { it.isNotBlank() }?.let { payload.put("severity", it) }
        blocked?.let { payload.put("blocked", it) }
        metadata?.let { payload.put("metadata", it) }

        socket?.emit("security:report", payload)
    }

    fun sendMessage(text: String, replyToMessageId: String? = null, metadata: JSONObject? = null) {
        val payload = JSONObject()
            .put("kind", "message")
            .put("text", text)

        replyToMessageId?.takeIf { it.isNotBlank() }?.let { payload.put("replyToMessageId", it) }
        metadata?.let { payload.put("metadata", it) }
        socket?.emit("message:send", payload)
    }

    fun replyToMessage(messageId: String, text: String, metadata: JSONObject? = null) {
        sendMessage(text, messageId, metadata)
    }

    fun sendComment(text: String, replyToMessageId: String? = null, metadata: JSONObject? = null) {
        val payload = JSONObject().put("text", text)

        replyToMessageId?.takeIf { it.isNotBlank() }?.let { payload.put("replyToMessageId", it) }
        metadata?.let { payload.put("metadata", it) }
        socket?.emit("comment:send", payload)
    }

    fun replyToComment(messageId: String, text: String, metadata: JSONObject? = null) {
        sendComment(text, messageId, metadata)
    }

    fun sendVoiceMessage(
        mediaUrl: String,
        durationSeconds: Double = 0.0,
        mimeType: String = "audio/webm",
        replyToMessageId: String? = null,
        metadata: JSONObject? = null
    ) {
        val payload = JSONObject()
            .put("kind", "voice")
            .put("mediaUrl", mediaUrl)
            .put("durationSeconds", durationSeconds)
            .put("mimeType", mimeType)

        replyToMessageId?.takeIf { it.isNotBlank() }?.let { payload.put("replyToMessageId", it) }
        metadata?.let { payload.put("metadata", it) }
        socket?.emit("message:send", payload)
    }

    fun sendImageMessage(
        mediaUrl: String,
        caption: String = "",
        mimeType: String? = null,
        replyToMessageId: String? = null,
        metadata: JSONObject? = null
    ) {
        val payload = JSONObject()
            .put("kind", "image")
            .put("mediaUrl", mediaUrl)
            .put("text", caption)

        mimeType?.takeIf { it.isNotBlank() }?.let { payload.put("mimeType", it) }
        replyToMessageId?.takeIf { it.isNotBlank() }?.let { payload.put("replyToMessageId", it) }
        metadata?.let { payload.put("metadata", it) }
        socket?.emit("message:send", payload)
    }

    fun requestMessageHistory(limit: Int = 50) {
        socket?.emit("message:list", JSONObject().put("limit", limit))
    }

    fun unsendMessage(messageId: String) {
        socket?.emit("message:unsend", JSONObject().put("messageId", messageId))
    }

    fun deleteMessage(messageId: String, forMe: Boolean = false) {
        socket?.emit(
            "message:delete",
            JSONObject()
                .put("messageId", messageId)
                .put("forMe", forMe)
        )
    }

    fun sendGift(
        giftId: String,
        name: String,
        assetUrl: String,
        assetType: String? = null,
        quantity: Int = 1,
        receiverUserId: String? = null,
        metadata: JSONObject? = null
    ) {
        val payload = JSONObject()
            .put("giftId", giftId)
            .put("name", name)
            .put("assetUrl", assetUrl)
            .put("quantity", quantity)

        assetType?.takeIf { it.isNotBlank() }?.let { payload.put("assetType", it) }
        receiverUserId?.takeIf { it.isNotBlank() }?.let { payload.put("receiverUserId", it) }
        metadata?.let { payload.put("metadata", it) }
        socket?.emit("gift:send", payload)
    }

    fun updateRoomProfile(name: String? = null, profilePictureUrl: String? = null) {
        val payload = JSONObject()

        name?.takeIf { it.isNotBlank() }?.let { payload.put("name", it) }
        profilePictureUrl?.takeIf { it.isNotBlank() }?.let { payload.put("profilePictureUrl", it) }
        socket?.emit("room:profile:update", payload)
    }

    fun updateRoomSettings(settings: JSONObject) {
        socket?.emit("room:settings:update", settings)
    }

    fun updateRoomMicAmount(maxMicCount: Int) {
        updateRoomSettings(JSONObject().put("maxMicCount", maxMicCount))
    }

    fun setPrivateRoomPassword(password: String) {
        updateRoomSettings(
            JSONObject()
                .put("privacyType", "private")
                .put("password", password)
        )
    }

    fun clearPrivateRoomPassword() {
        updateRoomSettings(
            JSONObject()
                .put("privacyType", "public")
                .put("clearPassword", true)
        )
    }

    fun setRoomEntryNotificationEnabled(enabled: Boolean) {
        updateRoomSettings(JSONObject().put("entryNotificationsEnabled", enabled))
    }

    fun setRoomTheme(theme: JSONObject) {
        socket?.emit("room:theme:update", JSONObject().put("theme", theme))
    }

    fun setRoomAnnouncement(text: String, pinned: Boolean = true) {
        socket?.emit(
            "room:announcement:update",
            JSONObject()
                .put("text", text)
                .put("pinned", pinned)
        )
    }

    fun updateRoomAdmins(admins: JSONArray = JSONArray(), superAdmins: JSONArray = JSONArray()) {
        socket?.emit(
            "room:admins:update",
            JSONObject()
                .put("admins", admins)
                .put("superAdmins", superAdmins)
        )
    }

    fun kickUserFromRoom(
        targetUserId: String? = null,
        targetSocketId: String? = null,
        reason: String? = null,
        permanent: Boolean = false,
        durationSeconds: Int = 0,
        metadata: JSONObject? = null
    ) {
        val payload = JSONObject()
            .put("permanent", permanent)
            .put("durationSeconds", durationSeconds)

        targetUserId?.takeIf { it.isNotBlank() }?.let { payload.put("targetUserId", it) }
        targetSocketId?.takeIf { it.isNotBlank() }?.let { payload.put("targetSocketId", it) }
        reason?.takeIf { it.isNotBlank() }?.let { payload.put("reason", it) }
        metadata?.let { payload.put("metadata", it) }
        socket?.emit("room:kick", payload)
    }

    fun requestKickHistory() {
        socket?.emit("room:kick:history:list", JSONObject())
    }

    fun editKickHistory(historyId: String, updates: JSONObject) {
        socket?.emit("room:kick:history:update", JSONObject(updates.toString()).put("id", historyId))
    }

    fun cleanComments(targetUserId: String? = null) {
        val payload = JSONObject()

        targetUserId?.takeIf { it.isNotBlank() }?.let { payload.put("targetUserId", it) }
        socket?.emit("room:comments:clean", payload)
    }

    fun muteUserMic(targetUserId: String? = null, targetSocketId: String? = null, enabled: Boolean = false) {
        val payload = JSONObject().put("enabled", enabled)

        targetUserId?.takeIf { it.isNotBlank() }?.let { payload.put("targetUserId", it) }
        targetSocketId?.takeIf { it.isNotBlank() }?.let { payload.put("targetSocketId", it) }
        socket?.emit("participant:mic:mute", payload)
    }

    fun setChatBan(
        targetUserId: String,
        enabled: Boolean = true,
        reason: String? = null,
        permanent: Boolean = false,
        durationSeconds: Int = 0,
        metadata: JSONObject? = null
    ) {
        val payload = JSONObject()
            .put("targetUserId", targetUserId)
            .put("enabled", enabled)
            .put("permanent", permanent)
            .put("durationSeconds", durationSeconds)

        reason?.takeIf { it.isNotBlank() }?.let { payload.put("reason", it) }
        metadata?.let { payload.put("metadata", it) }
        socket?.emit("chat:ban", payload)
    }

    fun requestChatBanHistory() {
        socket?.emit("chat:ban:history:list", JSONObject())
    }

    fun editChatBanHistory(historyId: String, updates: JSONObject) {
        socket?.emit("chat:ban:history:update", JSONObject(updates.toString()).put("id", historyId))
    }

    fun likeRoom() {
        socket?.emit("room:like", JSONObject())
    }

    fun shareRoom(target: String? = null) {
        val payload = JSONObject()

        target?.takeIf { it.isNotBlank() }?.let { payload.put("target", it) }
        socket?.emit("room:share", payload)
    }

    fun blockUser(blockedUserId: String, reason: String? = null, metadata: JSONObject? = null) {
        val payload = JSONObject().put("blockedUserId", blockedUserId)

        reason?.takeIf { it.isNotBlank() }?.let { payload.put("reason", it) }
        metadata?.let { payload.put("metadata", it) }
        socket?.emit("user:block", payload)
    }

    fun unblockUser(blockedUserId: String, reason: String? = null, metadata: JSONObject? = null) {
        val payload = JSONObject().put("blockedUserId", blockedUserId)

        reason?.takeIf { it.isNotBlank() }?.let { payload.put("reason", it) }
        metadata?.let { payload.put("metadata", it) }
        socket?.emit("user:unblock", payload)
    }

    fun requestBlockedUsers() {
        socket?.emit("user:block:list", JSONObject())
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        currentRoomId = null
        joiningRoomId = null
        autoJoinRoomId = null
        pendingLeaveRoomId = null
        closePeerConnection()
        updateConnectionIndicator(ConnectionIndicator.DISCONNECTED)
    }

    fun release() {
        disconnect()

        try {
            videoCapturer?.stopCapture()
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }

        videoCapturer?.dispose()
        videoCapturer = null

        detachRenderers(releaseRenderers = true)
        localVideoSink?.let { detachLocalVideoSink(it) }
        remoteVideoSink?.let { detachRemoteVideoSink(it) }

        videoTrack?.dispose()
        videoTrack = null

        audioTrack?.dispose()
        audioTrack = null

        videoSource?.dispose()
        videoSource = null

        audioSource?.dispose()
        audioSource = null

        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null

        localStream?.dispose()
        localStream = null

        peerConnectionFactory?.dispose()
        peerConnectionFactory = null

        audioDeviceModule?.release()
        audioDeviceModule = null

        eglBase.release()
    }

    private fun bindSocketEvents(socket: Socket) {
        socket.on(Socket.EVENT_CONNECT) {
            updateConnectionIndicator(ConnectionIndicator.CONNECTED)
            listener.onConnected(socket.id())

            autoJoinRoomId?.let { roomId ->
                autoJoinRoomId = null
                joinRoom(roomId)
            }
        }

        socket.on(Socket.EVENT_DISCONNECT) { args ->
            currentRoomId = null
            joiningRoomId = null
            pendingLeaveRoomId = null
            updateConnectionIndicator(ConnectionIndicator.DISCONNECTED)
            listener.onDisconnected(args.firstOrNull()?.toString() ?: "disconnected")
        }

        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            updateConnectionIndicator(ConnectionIndicator.FAILED)
            listener.onError(args.firstOrNull()?.toString() ?: "Unable to connect")
        }

        socket.on("room:error") { args ->
            joiningRoomId = null
            updateConnectionIndicator(if (currentRoomId == null) ConnectionIndicator.CONNECTED else ConnectionIndicator.IN_ROOM)
            val message = (args.firstOrNull() as? JSONObject)?.optString("message")
                ?: "Unable to join room"
            listener.onRoomError(message)
        }

        socket.on("room:full") { args ->
            joiningRoomId = null
            updateConnectionIndicator(if (currentRoomId == null) ConnectionIndicator.CONNECTED else ConnectionIndicator.IN_ROOM)
            val payload = args.firstOrNull() as? JSONObject
            listener.onRoomFull()
            payload?.optString("message")?.takeIf { it.isNotBlank() }?.let { listener.onRoomError(it) }
        }

        socket.on("room:joined") { args ->
            val payload = args.firstOrNull() as? JSONObject
            val room = payload?.optJSONObject("room")
            val participant = payload?.optJSONObject("participant")
            val state = payload?.optJSONObject("state")
            val roomId = room?.optString("id")?.takeIf { it.isNotBlank() }
                ?: participant?.optString("roomId")?.takeIf { it.isNotBlank() }
                ?: joiningRoomId
                ?: config.roomId

            currentRoomId = roomId
            joiningRoomId = null
            pendingLeaveRoomId = null
            updateConnectionIndicator(ConnectionIndicator.IN_ROOM)
            listener.onRoomJoined(roomId)
            state?.let { listener.onRoomState(it.optInt("participantCount")) }
        }

        socket.on("room:left") { args ->
            val roomId = (args.firstOrNull() as? JSONObject)?.optString("roomId")
                ?: pendingLeaveRoomId
                ?: currentRoomId
                ?: config.roomId
            currentRoomId = null
            joiningRoomId = null
            pendingLeaveRoomId = null
            updateConnectionIndicator(if (socket.connected()) ConnectionIndicator.CONNECTED else ConnectionIndicator.DISCONNECTED)
            listener.onRoomLeft(roomId)
        }

        socket.on("room:state") { args ->
            val state = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomState(state.optInt("participantCount"))
        }

        socket.on("room:updated") { args ->
            val room = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomUpdated(room)
        }

        socket.on("room:profile") { args ->
            val room = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomUpdated(room)
        }

        socket.on("room:settings") { args ->
            val room = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomUpdated(room)
        }

        socket.on("room:theme") { args ->
            val room = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomUpdated(room)
        }

        socket.on("room:announcement") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomUpdated(JSONObject().put("announcement", event))
        }

        socket.on("room:admins") { args ->
            val room = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomUpdated(room)
        }

        socket.on("room:entry") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomEntryNotification(event)
        }

        socket.on("room:kicked") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomKicked(event)
        }

        socket.on("room:kick:history") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomKickHistory(event)
        }

        socket.on("room:like") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomLiked(event)
        }

        socket.on("room:share") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onRoomShared(event)
        }

        socket.on("participant:updated") { args ->
            val participant = args.firstOrNull() as? JSONObject ?: return@on
            listener.onParticipantUpdated(
                participant.optString("socketId"),
                participant.optBoolean("micEnabled"),
                participant.optBoolean("cameraEnabled")
            )
        }

        socket.on("participant:mic:muted") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onParticipantMicMuted(event)
        }

        socket.on("message:history") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onMessageHistory(event)
        }

        socket.on("message:received") { args ->
            val message = args.firstOrNull() as? JSONObject ?: return@on
            listener.onMessageReceived(message)
        }

        socket.on("message:updated") { args ->
            val message = args.firstOrNull() as? JSONObject ?: return@on
            listener.onMessageUpdated(message)
        }

        socket.on("message:unsent") { args ->
            val message = args.firstOrNull() as? JSONObject ?: return@on
            listener.onMessageUpdated(message)
        }

        socket.on("message:deleted") { args ->
            val message = args.firstOrNull() as? JSONObject ?: return@on
            listener.onMessageUpdated(message)
        }

        socket.on("message:blocked") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onMessageBlocked(event)
        }

        socket.on("message:error") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onMessageError(event)
        }

        socket.on("comment:received") { args ->
            val comment = args.firstOrNull() as? JSONObject ?: return@on
            listener.onCommentReceived(comment)
        }

        socket.on("comment:cleaned") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onCommentCleaned(event)
        }

        socket.on("gift:history") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onGiftHistory(event)
        }

        socket.on("gift:received") { args ->
            val gift = args.firstOrNull() as? JSONObject ?: return@on
            listener.onGiftReceived(gift)
        }

        socket.on("chat:ban") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onChatBanStateChanged(event)
        }

        socket.on("chat:ban:history") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onChatBanHistory(event)
        }

        socket.on("user:block:updated") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onUserBlockUpdated(event)
        }

        socket.on("user:block:history") { args ->
            val event = args.firstOrNull() as? JSONObject ?: return@on
            listener.onUserBlockUpdated(event)
        }

        socket.on("existing-users") { args ->
            val users = args.firstOrNull() as? JSONArray

            if (users == null || users.length() == 0) {
                updateConnectionIndicator(ConnectionIndicator.WAITING_FOR_PEER)
                listener.onWaitingForPeer()
                return@on
            }

            updateConnectionIndicator(ConnectionIndicator.PEER_CONNECTING)
            for (index in 0 until users.length()) {
                createOffer(users.getString(index))
            }
        }

        socket.on("user-joined") { args ->
            val peerId = args.firstOrNull()?.toString() ?: return@on
            remotePeerId = peerId
            updateConnectionIndicator(ConnectionIndicator.PEER_CONNECTING)
            listener.onPeerJoined(peerId)
            listener.onParticipantJoined(peerId)
        }

        socket.on("user-left") { args ->
            val peerId = args.firstOrNull()?.toString() ?: return@on

            closePeerConnection(peerId)
            updateConnectionIndicator(if (peerConnections.isEmpty()) ConnectionIndicator.WAITING_FOR_PEER else ConnectionIndicator.PEER_CONNECTED)
            listener.onPeerLeft(peerId)
        }

        socket.on("participant:left") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            val participant = payload.optJSONObject("participant") ?: return@on
            listener.onParticipantLeft(
                participant.optString("socketId"),
                payload.optString("reason")
            )
        }

        socket.on("youtube:state") { args ->
            val state = args.firstOrNull() as? JSONObject ?: return@on
            listener.onYoutubeStateChanged(state)
        }

        socket.on("youtube:error") { args ->
            val payload = args.firstOrNull() as? JSONObject
            listener.onYoutubeError(payload?.optString("message") ?: "Unable to update YouTube room")
        }

        socket.on("screen:state") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            val participant = payload.optJSONObject("participant")
            listener.onScreenShareStateChanged(
                participant?.optString("socketId").orEmpty(),
                payload.optBoolean("screenShareEnabled")
            )
        }

        socket.on("video:effects") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            val participant = payload.optJSONObject("participant")
            val effects = payload.optJSONObject("effects") ?: JSONObject()
            listener.onVideoEffectsChanged(participant?.optString("socketId").orEmpty(), effects)
        }

        socket.on("live:pk:state") { args ->
            val state = args.firstOrNull() as? JSONObject ?: return@on
            listener.onLivePkStateChanged(state)
        }

        socket.on("security:checked") { args ->
            val result = args.firstOrNull() as? JSONObject ?: return@on
            listener.onSecurityChecked(result)
        }

        socket.on("security:incident") { args ->
            val incident = args.firstOrNull() as? JSONObject ?: return@on
            listener.onSecurityIncident(incident)
        }

        socket.on("signal") { args ->
            val envelope = args.firstOrNull() as? JSONObject ?: return@on
            val from = envelope.optString("from")
            val data = envelope.optJSONObject("data")

            if (from.isBlank() || data == null) {
                return@on
            }

            handleSignal(from, data)
        }
    }

    private fun createOffer(peerId: String) {
        val connection = createPeerConnection(peerId)

        connection.createOffer(object : EmptySdpObserver() {
            override fun onCreateSuccess(description: SessionDescription?) {
                if (description == null) {
                    listener.onError("Offer creation returned an empty description")
                    return
                }

                connection.setLocalDescription(object : EmptySdpObserver() {}, description)

                emitSignal(
                    peerId,
                    JSONObject()
                        .put("type", "offer")
                        .put("sdp", description.description)
                )
            }

            override fun onCreateFailure(error: String?) {
                listener.onError(error ?: "Unable to create offer")
            }
        }, MediaConstraints())
    }

    private fun createAnswer(peerId: String) {
        val connection = peerConnections[peerId] ?: return

        connection.createAnswer(object : EmptySdpObserver() {
            override fun onCreateSuccess(description: SessionDescription?) {
                if (description == null) {
                    listener.onError("Answer creation returned an empty description")
                    return
                }

                connection.setLocalDescription(object : EmptySdpObserver() {}, description)

                emitSignal(
                    peerId,
                    JSONObject()
                        .put("type", "answer")
                        .put("sdp", description.description)
                )
            }

            override fun onCreateFailure(error: String?) {
                listener.onError(error ?: "Unable to create answer")
            }
        }, MediaConstraints())
    }

    private fun handleSignal(peerId: String, signal: JSONObject) {
        when (signal.optString("type")) {
            "offer" -> {
                val connection = createPeerConnection(peerId)
                val description = SessionDescription(
                    SessionDescription.Type.OFFER,
                    signal.getString("sdp")
                )

                connection.setRemoteDescription(object : EmptySdpObserver() {
                    override fun onSetSuccess() {
                        flushPendingIceCandidates(peerId, connection)
                        createAnswer(peerId)
                    }

                    override fun onSetFailure(error: String?) {
                        listener.onError(error ?: "Unable to set remote offer")
                    }
                }, description)
            }

            "answer" -> {
                val connection = peerConnections[peerId] ?: return
                val description = SessionDescription(
                    SessionDescription.Type.ANSWER,
                    signal.getString("sdp")
                )

                connection.setRemoteDescription(object : EmptySdpObserver() {
                    override fun onSetSuccess() {
                        flushPendingIceCandidates(peerId, connection)
                    }

                    override fun onSetFailure(error: String?) {
                        listener.onError(error ?: "Unable to set remote answer")
                    }
                }, description)
            }

            "ice" -> {
                val connection = peerConnections[peerId]
                val candidate = IceCandidate(
                    signal.getString("sdpMid"),
                    signal.getInt("sdpMLineIndex"),
                    signal.getString("candidate")
                )

                if (connection?.remoteDescription != null) {
                    connection.addIceCandidate(candidate)
                } else {
                    getPendingIceCandidates(peerId).add(candidate)
                }
            }
        }
    }

    private fun createPeerConnection(peerId: String): PeerConnection {
        startLocalMedia()

        peerConnections[peerId]?.let {
            return it
        }

        remotePeerId = peerId
        updateConnectionIndicator(ConnectionIndicator.PEER_CONNECTING)

        val rtcConfiguration = PeerConnection.RTCConfiguration(config.iceServers)
        val connection = getPeerConnectionFactory().createPeerConnection(
            rtcConfiguration,
            object : PeerConnection.Observer {
                override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                    when (state) {
                        PeerConnection.IceConnectionState.CONNECTED,
                        PeerConnection.IceConnectionState.COMPLETED -> updateConnectionIndicator(ConnectionIndicator.PEER_CONNECTED)
                        PeerConnection.IceConnectionState.FAILED -> handlePeerConnectionFailed(peerId)
                        PeerConnection.IceConnectionState.DISCONNECTED -> updateConnectionIndicator(ConnectionIndicator.RECONNECTING)
                        PeerConnection.IceConnectionState.CLOSED -> updateConnectionIndicator(
                            if (currentRoomId == null) ConnectionIndicator.CONNECTED else ConnectionIndicator.IN_ROOM
                        )
                        else -> {}
                    }
                }
                override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}

                override fun onIceCandidate(candidate: IceCandidate?) {
                    candidate ?: return

                    emitSignal(
                        peerId,
                        JSONObject()
                            .put("type", "ice")
                            .put("sdpMid", candidate.sdpMid)
                            .put("sdpMLineIndex", candidate.sdpMLineIndex)
                            .put("candidate", candidate.sdp)
                    )
                }

                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
                override fun onAddStream(stream: MediaStream?) {
                    stream ?: return
                    attachRemoteStream(peerId, stream)
                }

                override fun onRemoveStream(stream: MediaStream?) {}
                override fun onDataChannel(dataChannel: DataChannel?) {}
                override fun onRenegotiationNeeded() {}

                override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
                    streams?.firstOrNull()?.let { attachRemoteStream(peerId, it) }
                }

                override fun onTrack(transceiver: RtpTransceiver?) {
                    val track = transceiver?.receiver?.track()

                    if (track is VideoTrack) {
                        attachRemoteVideoTrack(track)
                    }
                }

                override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
                    when (newState) {
                        PeerConnection.PeerConnectionState.CONNECTED -> updateConnectionIndicator(ConnectionIndicator.PEER_CONNECTED)
                        PeerConnection.PeerConnectionState.CONNECTING -> updateConnectionIndicator(ConnectionIndicator.PEER_CONNECTING)
                        PeerConnection.PeerConnectionState.FAILED -> handlePeerConnectionFailed(peerId)
                        PeerConnection.PeerConnectionState.DISCONNECTED -> updateConnectionIndicator(ConnectionIndicator.RECONNECTING)
                        PeerConnection.PeerConnectionState.CLOSED -> updateConnectionIndicator(
                            if (currentRoomId == null) ConnectionIndicator.CONNECTED else ConnectionIndicator.IN_ROOM
                        )
                        else -> {}
                    }
                    if (
                        newState != PeerConnection.PeerConnectionState.FAILED &&
                        newState != PeerConnection.PeerConnectionState.CLOSED
                    ) {
                        newState?.let { listener.onConnectionStateChanged(it) }
                    }
                }
            }
        ) ?: throw IllegalStateException("Unable to create PeerConnection")

        localStream?.let { stream ->
            val streamIds = listOf(stream.id)

            stream.audioTracks.forEach { connection.addTrack(it, streamIds) }
            stream.videoTracks.forEach { connection.addTrack(it, streamIds) }
        }

        peerConnections[peerId] = connection
        if (peerConnection == null) {
            peerConnection = connection
        }
        return connection
    }

    private fun attachRemoteStream(peerId: String, stream: MediaStream) {
        stream.videoTracks.forEach { attachRemoteVideoTrack(it) }
        listener.onRemoteStream(stream)
        listener.onRemoteStreamForPeer(peerId, stream)
    }

    private fun handlePeerConnectionFailed(peerId: String) {
        closePeerConnection(peerId)
        updateConnectionIndicator(
            when {
                currentRoomId == null -> ConnectionIndicator.CONNECTED
                peerConnections.isEmpty() -> ConnectionIndicator.WAITING_FOR_PEER
                else -> ConnectionIndicator.PEER_CONNECTED
            }
        )
    }

    private fun attachRemoteVideoTrack(track: VideoTrack) {
        if (remoteVideoTracks.add(track)) {
            remoteVideoSink?.let { track.addSink(it) }
        }
    }

    private fun removeRemoteVideoSink(sink: VideoSink) {
        remoteVideoTracks.forEach { track -> track.removeSink(sink) }
    }

    private fun flushPendingIceCandidates(peerId: String, connection: PeerConnection) {
        getPendingIceCandidates(peerId).toList().forEach { connection.addIceCandidate(it) }
        pendingIceCandidatesByPeer.remove(peerId)
    }

    private fun emitSignal(peerId: String, data: JSONObject) {
        socket?.emit(
            "signal",
            JSONObject()
                .put("to", peerId)
                .put("data", data)
        )
    }

    private fun emitMediaState() {
        socket?.emit(
            "media:state",
            JSONObject()
                .put("micEnabled", micEnabled)
                .put("cameraEnabled", cameraEnabled)
                .put("noiseCancellationEnabled", noiseCancellationEnabled)
                .put("screenShareEnabled", screenShareEnabled)
                .put("videoEffects", videoEffects)
                .put("speakerEnabled", speakerEnabled)
        )
        listener.onLocalMediaStateChanged(micEnabled, cameraEnabled, speakerEnabled)
    }

    private fun closePeerConnection(peerId: String? = null) {
        if (peerId == null) {
            remoteVideoSink?.let { removeRemoteVideoSink(it) }
            remoteVideoTracks.clear()
            peerConnections.values.toList().forEach { connection ->
                connection.close()
                connection.dispose()
            }
            peerConnections.clear()
            peerConnection = null
            remotePeerId = null
            pendingIceCandidatesByPeer.clear()
            return
        }

        peerConnections.remove(peerId)?.let { connection ->
            connection.close()
            connection.dispose()
        }
        pendingIceCandidatesByPeer.remove(peerId)

        if (remotePeerId == peerId) {
            remotePeerId = peerConnections.keys.firstOrNull()
            peerConnection = remotePeerId?.let { peerConnections[it] }
        }
    }

    private fun getPeerConnectionFactory(): PeerConnectionFactory {
        peerConnectionFactory?.let { return it }

        initializePeerConnectionFactory(context)
        configureAudioForCall()

        val encoderFactory = DefaultVideoEncoderFactory(
            eglBase.eglBaseContext,
            true,
            true
        )
        val decoderFactory = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        val audioModule = createAudioDeviceModule()

        return PeerConnectionFactory.builder()
            .setAudioDeviceModule(audioModule)
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()
            .also { peerConnectionFactory = it }
    }

    private fun createCameraCapturer(): VideoCapturer? {
        val enumerators = buildList<CameraEnumerator> {
            if (Camera2Enumerator.isSupported(context)) {
                add(Camera2Enumerator(context))
            }
            add(Camera1Enumerator(false))
        }

        enumerators.forEach { enumerator ->
            val deviceNames = enumerator.deviceNames

            deviceNames
                .filter { enumerator.isFrontFacing(it) }
                .forEach { deviceName ->
                    enumerator.createCapturer(deviceName, null)?.let { return it }
                }

            deviceNames
                .filterNot { enumerator.isFrontFacing(it) }
                .forEach { deviceName ->
                    enumerator.createCapturer(deviceName, null)?.let { return it }
                }
        }

        listener.onError("No Android camera capturer is available")
        return null
    }

    private fun createAudioDeviceModule(): AudioDeviceModule {
        audioDeviceModule?.let { return it }

        return JavaAudioDeviceModule.builder(context)
            .setUseHardwareAcousticEchoCanceler(JavaAudioDeviceModule.isBuiltInAcousticEchoCancelerSupported())
            .setUseHardwareNoiseSuppressor(false)
            .setAudioRecordErrorCallback(object : JavaAudioDeviceModule.AudioRecordErrorCallback {
                override fun onWebRtcAudioRecordInitError(errorMessage: String) {
                    listener.onError("Microphone init failed: $errorMessage")
                }

                override fun onWebRtcAudioRecordStartError(
                    errorCode: JavaAudioDeviceModule.AudioRecordStartErrorCode,
                    errorMessage: String
                ) {
                    listener.onError("Microphone start failed: $errorMessage")
                }

                override fun onWebRtcAudioRecordError(errorMessage: String) {
                    listener.onError("Microphone failed: $errorMessage")
                }
            })
            .setAudioTrackErrorCallback(object : JavaAudioDeviceModule.AudioTrackErrorCallback {
                override fun onWebRtcAudioTrackInitError(errorMessage: String) {
                    listener.onError("Speaker init failed: $errorMessage")
                }

                override fun onWebRtcAudioTrackStartError(
                    errorCode: JavaAudioDeviceModule.AudioTrackStartErrorCode,
                    errorMessage: String
                ) {
                    listener.onError("Speaker start failed: $errorMessage")
                }

                override fun onWebRtcAudioTrackError(errorMessage: String) {
                    listener.onError("Speaker failed: $errorMessage")
                }
            })
            .createAudioDeviceModule()
            .also { audioDeviceModule = it }
    }

    private fun createLocalAudioTrack(factory: PeerConnectionFactory): AudioTrack {
        configureAudioForCall()
        audioDeviceModule?.setMicrophoneMute(!micEnabled)
        audioDeviceModule?.setSpeakerMute(false)

        val source = factory.createAudioSource(createAudioConstraints())
        val track = factory.createAudioTrack("audio-${UUID.randomUUID()}", source)

        audioSource = source
        audioTrack = track
        if (!applyAudioProcessingOptions(track) && noiseCancellationEnabled) {
            listener.onError("Noise cancellation is not available on this Android audio path")
        }
        track.setEnabled(micEnabled)
        return track
    }

    private fun applyAudioProcessingOptions(track: AudioTrack): Boolean {
        if (setAudioProcessingOptions(track, preferSoftwareNoiseSuppression = true)) {
            return true
        }

        return setAudioProcessingOptions(track, preferSoftwareNoiseSuppression = false)
    }

    private fun setAudioProcessingOptions(
        track: AudioTrack,
        preferSoftwareNoiseSuppression: Boolean
    ): Boolean {
        return try {
            track.setAudioProcessingOptions(
                createAudioProcessingOptions(preferSoftwareNoiseSuppression)
            ).isSuccess()
        } catch (_: Throwable) {
            false
        }
    }

    private fun createAudioProcessingOptions(
        preferSoftwareNoiseSuppression: Boolean
    ): AudioProcessingOptions {
        val noiseMode = if (preferSoftwareNoiseSuppression) {
            AudioProcessingMode.SOFTWARE
        } else {
            AudioProcessingMode.AUTOMATIC
        }

        return AudioProcessingOptions(
            AudioProcessingComponentOptions(true, AudioProcessingMode.AUTOMATIC),
            AudioProcessingComponentOptions(noiseCancellationEnabled, noiseMode),
            AudioProcessingComponentOptions(true, AudioProcessingMode.AUTOMATIC),
            AudioProcessingComponentOptions(noiseCancellationEnabled, AudioProcessingMode.AUTOMATIC)
        )
    }

    private fun replaceLocalAudioTrack() {
        val stream = localStream ?: return
        val oldTrack = audioTrack
        val oldSource = audioSource
        val nextTrack = createLocalAudioTrack(getPeerConnectionFactory())

        oldTrack?.let { stream.removeTrack(it) }
        stream.addTrack(nextTrack)
        peerConnections.values.forEach { connection ->
            connection.senders
                .firstOrNull { it.track()?.kind() == "audio" }
                ?.setTrack(nextTrack, false)
        }

        oldTrack?.dispose()
        oldSource?.dispose()
        peerConnections.keys.toList().forEach { createOffer(it) }
    }

    private fun prepareVideoRoom(initialEffects: JSONObject?) {
        cameraEnabled = true

        initialEffects?.let {
            videoEffects = mergeJsonObjects(videoEffects, it)
            val effectsSnapshot = JSONObject(videoEffects.toString())
            videoEffectProcessor?.onVideoEffectsChanged(effectsSnapshot)
            listener.onLocalVideoEffectsChanged(JSONObject(effectsSnapshot.toString()))
        }
    }

    private fun emitScreenShareState(enabled: Boolean) {
        socket?.emit(
            "screen:state",
            JSONObject()
                .put("enabled", enabled)
                .put("screenShareEnabled", enabled)
        )
        emitMediaState()
    }

    private fun createAudioConstraints(): MediaConstraints {
        return MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googHighpassFilter", noiseCancellationEnabled.toString()))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", noiseCancellationEnabled.toString()))
        }
    }

    private fun getPendingIceCandidates(peerId: String): MutableList<IceCandidate> {
        return pendingIceCandidatesByPeer.getOrPut(peerId) { mutableListOf() }
    }

    private fun createDefaultVideoEffects(): JSONObject {
        return VideoEffects().toJson()
    }

    private fun mergeJsonObjects(base: JSONObject, updates: JSONObject): JSONObject {
        val merged = JSONObject(base.toString())
        val keys = updates.keys()

        while (keys.hasNext()) {
            val key = keys.next()
            val value = when (key) {
                "beautyLevel",
                "smoothingLevel",
                "whiteningLevel",
                "eyeLevel",
                "faceSlimLevel" -> clampEffectLevel(updates.optInt(key, merged.optInt(key)))
                "makeup" -> (updates.optJSONObject(key) ?: JSONObject())
                else -> updates.opt(key)
            }

            merged.put(key, value)
        }

        return merged
    }

    private fun clampEffectLevel(level: Int): Int = level.coerceIn(0, 100)

    private fun createLocalVideoTrack(factory: PeerConnectionFactory): VideoTrack? {
        videoTrack?.let { return it }

        val captureFormats = buildList {
            add(VideoCaptureFormat(config.videoWidth, config.videoHeight, config.videoFps))
            videoCaptureFormats.forEach { format ->
                if (none { it == format }) {
                    add(format)
                }
            }
        }
        var lastError: String? = null
        var capturedTrack: CapturedVideoTrack? = null

        for (format in captureFormats) {
            val capturer = createCameraCapturer() ?: return null
            val nextTrack = createCapturedVideoTrack(
                factory = factory,
                capturer = capturer,
                width = format.width,
                height = format.height,
                fps = format.fps,
                reportErrors = false
            )

            if (nextTrack != null) {
                capturedTrack = nextTrack
                break
            }

            lastError = "Camera failed at ${format.width}x${format.height}@${format.fps}"
        }

        val readyTrack = capturedTrack

        if (readyTrack == null) {
            listener.onError(lastError ?: "Unable to start camera capture")
            return null
        }

        videoCapturer = readyTrack.capturer
        surfaceTextureHelper = readyTrack.textureHelper
        videoSource = readyTrack.source

        return readyTrack.track.also { track ->
            videoTrack = track
            track.setEnabled(cameraEnabled)
            localVideoSink?.let { track.addSink(it) }
        }
    }

    private fun replaceLocalVideoTrack(
        capturer: VideoCapturer,
        width: Int,
        height: Int,
        fps: Int
    ): Boolean {
        val factory = getPeerConnectionFactory()
        val stream = ensureLocalStream(factory)
        val capturedTrack = createCapturedVideoTrack(factory, capturer, width, height, fps) ?: return false

        val oldCapturer = videoCapturer
        val oldSource = videoSource
        val oldTextureHelper = surfaceTextureHelper
        val oldTrack = videoTrack
        val nextTrack = capturedTrack.track

        nextTrack.setEnabled(cameraEnabled)
        localVideoSink?.let { nextTrack.addSink(it) }

        oldTrack?.let { track ->
            localVideoSink?.let { track.removeSink(it) }
            stream.removeTrack(track)
        }
        stream.addTrack(nextTrack)

        videoCapturer = capturedTrack.capturer
        videoSource = capturedTrack.source
        surfaceTextureHelper = capturedTrack.textureHelper
        videoTrack = nextTrack

        var needsRenegotiation = false
        peerConnections.values.forEach { connection ->
            val sender = connection.senders.firstOrNull { it.track()?.kind() == "video" }

            if (sender == null) {
                connection.addTrack(nextTrack, listOf(stream.id))
                needsRenegotiation = true
            } else if (!sender.setTrack(nextTrack, false)) {
                needsRenegotiation = true
            }
        }

        disposeCapturedVideo(oldCapturer, oldSource, oldTextureHelper, oldTrack)

        if (needsRenegotiation) {
            peerConnections.keys.toList().forEach { createOffer(it) }
        }

        listener.onLocalStream(stream)
        listener.onLocalVideoEnabled(cameraEnabled)
        return true
    }

    private fun ensureLocalStream(factory: PeerConnectionFactory): MediaStream {
        localStream?.let { return it }

        val stream = factory.createLocalMediaStream("local-${UUID.randomUUID()}")

        if (config.enableAudio && audioTrack == null) {
            stream.addTrack(createLocalAudioTrack(factory))
        }

        localStream = stream
        listener.onLocalStream(stream)
        return stream
    }

    private fun createCapturedVideoTrack(
        factory: PeerConnectionFactory,
        capturer: VideoCapturer,
        width: Int,
        height: Int,
        fps: Int,
        reportErrors: Boolean = true
    ): CapturedVideoTrack? {
        val textureHelper = SurfaceTextureHelper.create(
            if (capturer.isScreencast) "RtcServiceScreenCaptureThread" else "RtcServiceCameraCaptureThread",
            eglBase.eglBaseContext
        )
        val source = factory.createVideoSource(capturer.isScreencast)

        try {
            capturer.initialize(textureHelper, context, source.capturerObserver)
            capturer.startCapture(width, height, fps)
        } catch (error: Exception) {
            if (reportErrors) {
                listener.onError(error.message ?: "Unable to start video capture at ${width}x${height}@${fps}")
            }
            disposeCapturedVideo(capturer, source, textureHelper, null)
            return null
        }

        val track = factory.createVideoTrack("video-${UUID.randomUUID()}", source)
        return CapturedVideoTrack(capturer, source, textureHelper, track)
    }

    private fun disposeCapturedVideo(
        capturer: VideoCapturer?,
        source: VideoSource?,
        textureHelper: SurfaceTextureHelper?,
        track: VideoTrack?
    ) {
        try {
            capturer?.stopCapture()
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        } catch (_: Exception) {
        }

        try {
            capturer?.dispose()
        } catch (_: Exception) {
        }

        track?.dispose()
        source?.dispose()
        textureHelper?.dispose()
    }

    private fun configureAudioForCall() {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return

        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = speakerEnabled
    }

    private fun updateConnectionIndicator(indicator: ConnectionIndicator) {
        if (connectionIndicator == indicator) {
            return
        }

        connectionIndicator = indicator
        listener.onRtcConnectionIndicatorChanged(indicator)
    }

    private open class EmptySdpObserver : SdpObserver {
        override fun onCreateSuccess(description: SessionDescription?) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(error: String?) {}
        override fun onSetFailure(error: String?) {}
    }

    companion object {
        const val DEFAULT_SIGNALING_URL = "https://funint.online"
        const val DEFAULT_APP_ID = "test000"
        const val DEFAULT_APP_KEY = "rtc_app_47e10be169ed47b88166aef86510dab6"

        @Volatile
        private var factoryInitialized = false

        @JvmStatic
        fun defaultIceServers(): List<PeerConnection.IceServer> {
            return listOf(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer())
        }

        @JvmStatic
        fun parseAccessToken(accessToken: String): AccessTokenInfo {
            val parts = accessToken.split(".")

            if (parts.size < 2 || parts[1].isBlank()) {
                throw IllegalArgumentException("RTC access token must be a JWT")
            }

            val payloadBytes = Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
            val payload = JSONObject(payloadBytes.toString(Charset.forName("UTF-8")))

            return AccessTokenInfo(
                rawToken = accessToken,
                appId = payload.optNullableString("appId", "app_id"),
                appKey = payload.optNullableString("appKey", "app_key"),
                roomId = payload.optNullableString("roomId", "room_id"),
                userId = payload.optNullableString("userId", "user_id", "sub"),
                externalUserId = payload.optNullableString("externalUserId", "external_user_id"),
                role = payload.optNullableString("role"),
                rtcMode = payload.optNullableString("rtcMode", "rtc_mode"),
                permissions = payload.optStringList("permissions"),
                issuedAtEpochSeconds = payload.optNullableLong("iat"),
                expiresAtEpochSeconds = payload.optNullableLong("exp"),
                issuer = payload.optNullableString("iss"),
                subject = payload.optNullableString("sub"),
                tokenId = payload.optNullableString("jti", "tokenId", "token_id"),
                claims = payload
            )
        }

        @JvmStatic
        fun validateProjectCredentials(
            accessToken: String,
            expectedAppId: String? = null,
            expectedAppKey: String? = null
        ) {
            val tokenInfo = parseAccessToken(accessToken)
            val normalizedExpectedAppId = expectedAppId?.trim()?.takeIf { it.isNotBlank() }
            val normalizedExpectedAppKey = expectedAppKey?.trim()?.takeIf { it.isNotBlank() }

            if (
                normalizedExpectedAppId != null &&
                !tokenInfo.appId.isNullOrBlank() &&
                tokenInfo.appId != normalizedExpectedAppId
            ) {
                throw IllegalArgumentException("RTC access token app_id does not match the initialized App ID")
            }

            if (
                normalizedExpectedAppKey != null &&
                !tokenInfo.appKey.isNullOrBlank() &&
                tokenInfo.appKey != normalizedExpectedAppKey
            ) {
                throw IllegalArgumentException("RTC access token app_key does not match the initialized App Key")
            }
        }

        @JvmStatic
        fun requiredAndroidPermissions(config: Config): List<String> {
            return buildList {
                if (config.enableAudio) {
                    add(Manifest.permission.RECORD_AUDIO)
                }

                if (config.enableVideo) {
                    add(Manifest.permission.CAMERA)
                }
            }.distinct()
        }

        @JvmStatic
        fun requiredAndroidPermissionsForToken(accessToken: String): List<String> {
            val tokenInfo = parseAccessToken(accessToken)
            return requiredAndroidPermissionsForToken(accessToken, tokenInfo.rtcMode)
        }

        @JvmStatic
        fun requiredAndroidPermissionsForToken(
            accessToken: String,
            rtcMode: String?
        ): List<String> {
            val tokenInfo = parseAccessToken(accessToken)
            return buildList {
                if (shouldEnableAudio(tokenInfo)) {
                    add(Manifest.permission.RECORD_AUDIO)
                }

                if (shouldEnableVideo(tokenInfo, rtcMode)) {
                    add(Manifest.permission.CAMERA)
                }
            }.distinct()
        }

        @JvmStatic
        @JvmOverloads
        fun fromDashboardToken(
            context: Context,
            accessToken: String,
            roomId: String,
            listener: Listener,
            signalingUrl: String = DEFAULT_SIGNALING_URL,
            rtcMode: String? = null
        ): RtcServiceSdk {
            return RtcServiceSdk(
                context = context,
                config = Config.dashboardToken(
                    signalingUrl = signalingUrl,
                    accessToken = accessToken,
                    roomId = roomId,
                    rtcMode = rtcMode
                ),
                listener = listener
            )
        }

        @JvmStatic
        @JvmOverloads
        fun fromDashboardToken(
            context: Context,
            accessToken: String,
            listener: Listener,
            signalingUrl: String = DEFAULT_SIGNALING_URL,
            rtcMode: String? = null
        ): RtcServiceSdk {
            return RtcServiceSdk(
                context = context,
                config = Config.dashboardToken(
                    signalingUrl = signalingUrl,
                    accessToken = accessToken,
                    rtcMode = rtcMode
                ),
                listener = listener
            )
        }

        @JvmStatic
        @JvmOverloads
        fun startWithDashboardToken(
            context: Context,
            accessToken: String,
            roomId: String,
            listener: Listener,
            signalingUrl: String = DEFAULT_SIGNALING_URL,
            initialEffects: JSONObject? = null,
            rtcMode: String? = null
        ): RtcServiceSdk {
            return fromDashboardToken(context, accessToken, roomId, listener, signalingUrl, rtcMode)
                .also { it.start(initialEffects) }
        }

        @JvmStatic
        @JvmOverloads
        fun startWithDashboardToken(
            context: Context,
            accessToken: String,
            listener: Listener,
            signalingUrl: String = DEFAULT_SIGNALING_URL,
            initialEffects: JSONObject? = null,
            rtcMode: String? = null
        ): RtcServiceSdk {
            return fromDashboardToken(context, accessToken, listener, signalingUrl, rtcMode)
                .also { it.start(initialEffects) }
        }

        internal fun shouldEnableAudio(tokenInfo: AccessTokenInfo): Boolean {
            if (tokenInfo.permissions.isEmpty()) {
                return true
            }

            return tokenInfo.hasPermission("publish_audio")
        }

        internal fun shouldEnableVideo(
            tokenInfo: AccessTokenInfo,
            rtcModeOverride: String? = null
        ): Boolean {
            val rtcMode = rtcModeOverride?.trim()?.takeIf { it.isNotBlank() }
                ?: tokenInfo.rtcMode
                ?: return tokenInfo.hasPermission("publish_video")

            if (isAudioOnlyRtcMode(rtcMode)) {
                return false
            }

            return tokenInfo.permissions.isEmpty()
                || tokenInfo.hasPermission("publish_video")
                || tokenInfo.hasPermission("screen_share")
        }

        internal fun isAudioOnlyRtcMode(rtcMode: String): Boolean {
            return when (normalizeRtcMode(rtcMode)) {
                "voice",
                "audio",
                "voice_call",
                "one_to_one_voice",
                "one_to_one_voice_call",
                "group_voice",
                "group_voice_chat",
                "youtube",
                "youtube_room" -> true
                else -> false
            }
        }

        internal fun normalizeRtcMode(rtcMode: String): String {
            return rtcMode.trim().lowercase(Locale.US).replace("-", "_")
        }

        private fun initializePeerConnectionFactory(context: Context) {
            if (factoryInitialized) {
                return
            }

            synchronized(this) {
                if (!factoryInitialized) {
                    PeerConnectionFactory.initialize(
                        PeerConnectionFactory.InitializationOptions.builder(context)
                            .createInitializationOptions()
                    )
                    factoryInitialized = true
                }
            }
        }

        private fun JSONObject.optNullableString(vararg names: String): String? {
            for (name in names) {
                val value = opt(name)

                if (value != null && value != JSONObject.NULL) {
                    val text = value.toString()

                    if (text.isNotBlank()) {
                        return text
                    }
                }
            }

            return null
        }

        private fun JSONObject.optNullableLong(name: String): Long? {
            if (!has(name) || isNull(name)) {
                return null
            }

            return try {
                optLong(name)
            } catch (_: Exception) {
                null
            }
        }

        private fun JSONObject.optStringList(name: String): List<String> {
            val array = optJSONArray(name) ?: return emptyList()
            val values = mutableListOf<String>()

            for (index in 0 until array.length()) {
                val value = array.opt(index)?.toString()?.takeIf { it.isNotBlank() }

                if (value != null) {
                    values.add(value)
                }
            }

            return values
        }
    }
}
