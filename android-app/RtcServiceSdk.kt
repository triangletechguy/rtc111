import android.content.Context
import android.media.AudioManager
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
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
import org.webrtc.SessionDescription
import org.webrtc.SdpObserver
import org.webrtc.SurfaceTextureHelper
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
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
        val iceServers: List<PeerConnection.IceServer> = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
        )
    ) {
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
                iceServers = iceServers
            )

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
        }
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
        fun onWaitingForPeer() {}
        fun onPeerJoined(peerId: String) {}
        fun onPeerLeft(peerId: String) {}
        fun onParticipantJoined(peerId: String) {}
        fun onParticipantLeft(peerId: String, reason: String) {}
        fun onParticipantUpdated(peerId: String, micEnabled: Boolean, cameraEnabled: Boolean) {}
        fun onYoutubeStateChanged(state: JSONObject) {}
        fun onYoutubeError(message: String) {}
        fun onSecurityChecked(result: JSONObject) {}
        fun onSecurityIncident(incident: JSONObject) {}
        fun onScreenShareStateChanged(peerId: String, enabled: Boolean) {}
        fun onVideoEffectsChanged(peerId: String, effects: JSONObject) {}
        fun onLivePkStateChanged(state: JSONObject) {}
        fun onLocalStream(stream: MediaStream) {}
        fun onRemoteStream(stream: MediaStream) {}
        fun onRemoteStreamForPeer(peerId: String, stream: MediaStream) {}
        fun onLocalAudioMuted(muted: Boolean) {}
        fun onNoiseCancellationChanged(enabled: Boolean) {}
        fun onLocalVideoEnabled(enabled: Boolean) {}
        fun onLocalMediaStateChanged(micEnabled: Boolean, cameraEnabled: Boolean, speakerEnabled: Boolean) {}
        fun onSpeakerphoneChanged(enabled: Boolean) {}
        fun onConnectionStateChanged(state: PeerConnection.PeerConnectionState) {}
        fun onRtcConnectionIndicatorChanged(indicator: ConnectionIndicator) {}
        fun onError(message: String) {}
    }

    private val eglBase = EglBase.create()
    private val pendingIceCandidatesByPeer = mutableMapOf<String, MutableList<IceCandidate>>()
    private val peerConnections = mutableMapOf<String, PeerConnection>()

    private var socket: Socket? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var localStream: MediaStream? = null
    private var remotePeerId: String? = null
    private var localRenderer: SurfaceViewRenderer? = null
    private var remoteRenderer: SurfaceViewRenderer? = null
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

    fun attachRenderers(
        localRenderer: SurfaceViewRenderer?,
        remoteRenderer: SurfaceViewRenderer?,
        initializeRenderers: Boolean = true
    ) {
        this.localRenderer = localRenderer
        this.remoteRenderer = remoteRenderer

        if (initializeRenderers) {
            localRenderer?.init(eglBase.eglBaseContext, null)
            remoteRenderer?.init(eglBase.eglBaseContext, null)
        }

        localRenderer?.let { videoTrack?.addSink(it) }
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

        autoJoinRoomId = roomId

        if (socket?.connected() == true) {
            autoJoinRoomId = null
            joinRoom(roomId)
            return
        }

        connect()
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

    fun joinVideoRoom(roomId: String = config.roomId) {
        cameraEnabled = true
        joinRoom(roomId)
    }

    fun joinVideoCall(roomId: String = config.roomId) {
        joinVideoRoom(roomId)
    }

    fun joinGroupVideoRoom(roomId: String = config.roomId) {
        joinVideoRoom(roomId)
    }

    fun joinSoloVideoLive(roomId: String = config.roomId) {
        joinVideoRoom(roomId)
    }

    fun joinLivePkRoom(roomId: String = config.roomId) {
        joinVideoRoom(roomId)
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

        startLocalMedia()
        joiningRoomId = roomId
        updateConnectionIndicator(ConnectionIndicator.JOINING_ROOM)
        socket?.emit(
            "room:join",
            JSONObject()
                .put("roomId", roomId)
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
        if (localStream != null) {
            localStream?.let { listener.onLocalStream(it) }
            return
        }

        val factory = getPeerConnectionFactory()
        val stream = factory.createLocalMediaStream("local-${UUID.randomUUID()}")

        if (config.enableAudio) {
            stream.addTrack(createLocalAudioTrack(factory))
        }

        if (config.enableVideo && cameraEnabled) {
            createLocalVideoTrack(factory)?.let { stream.addTrack(it) }
        }

        localStream = stream
        listener.onLocalStream(stream)
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
        emitMediaState()
        listener.onLocalAudioMuted(muted)
    }

    fun setNoiseCancellationEnabled(enabled: Boolean) {
        noiseCancellationEnabled = enabled

        if (localStream != null && config.enableAudio) {
            replaceLocalAudioTrack()
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
            createLocalVideoTrack(factory)?.let { track ->
                val stream = localStream

                if (stream != null) {
                    stream.addTrack(track)
                    peerConnections.values.forEach { connection ->
                        connection.addTrack(track, listOf(stream.id))
                    }
                    peerConnections.keys.toList().forEach { createOffer(it) }
                }
            }
        }

        videoTrack?.setEnabled(enabled)
        emitMediaState()
        listener.onLocalVideoEnabled(enabled)
    }

    fun setScreenShareEnabled(enabled: Boolean) {
        screenShareEnabled = enabled
        socket?.emit(
            "screen:state",
            JSONObject()
                .put("enabled", enabled)
                .put("screenShareEnabled", enabled)
        )
        emitMediaState()
    }

    fun setVideoEffects(effects: JSONObject) {
        videoEffects = mergeJsonObjects(videoEffects, effects)
        socket?.emit("video:effects", videoEffects)
        emitMediaState()
    }

    fun setSpeakerphoneOn(enabled: Boolean) {
        speakerEnabled = enabled

        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager?.isSpeakerphoneOn = enabled

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

        localRenderer?.let { videoTrack?.removeSink(it) }
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

        localRenderer?.release()
        remoteRenderer?.release()
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

        socket.on("participant:updated") { args ->
            val participant = args.firstOrNull() as? JSONObject ?: return@on
            listener.onParticipantUpdated(
                participant.optString("socketId"),
                participant.optBoolean("micEnabled"),
                participant.optBoolean("cameraEnabled")
            )
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
                        PeerConnection.IceConnectionState.FAILED -> updateConnectionIndicator(ConnectionIndicator.FAILED)
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
                        remoteRenderer?.let { track.addSink(it) }
                    }
                }

                override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
                    when (newState) {
                        PeerConnection.PeerConnectionState.CONNECTED -> updateConnectionIndicator(ConnectionIndicator.PEER_CONNECTED)
                        PeerConnection.PeerConnectionState.CONNECTING -> updateConnectionIndicator(ConnectionIndicator.PEER_CONNECTING)
                        PeerConnection.PeerConnectionState.FAILED -> updateConnectionIndicator(ConnectionIndicator.FAILED)
                        PeerConnection.PeerConnectionState.DISCONNECTED -> updateConnectionIndicator(ConnectionIndicator.RECONNECTING)
                        PeerConnection.PeerConnectionState.CLOSED -> updateConnectionIndicator(
                            if (currentRoomId == null) ConnectionIndicator.CONNECTED else ConnectionIndicator.IN_ROOM
                        )
                        else -> {}
                    }
                    newState?.let { listener.onConnectionStateChanged(it) }
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
        remoteRenderer?.let { renderer ->
            stream.videoTracks.firstOrNull()?.addSink(renderer)
        }
        listener.onRemoteStream(stream)
        listener.onRemoteStreamForPeer(peerId, stream)
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

        val encoderFactory = DefaultVideoEncoderFactory(
            eglBase.eglBaseContext,
            true,
            true
        )
        val decoderFactory = DefaultVideoDecoderFactory(eglBase.eglBaseContext)

        return PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()
            .also { peerConnectionFactory = it }
    }

    private fun createCameraCapturer(): VideoCapturer? {
        val enumerator = Camera2Enumerator(context)
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

        return null
    }

    private fun createLocalAudioTrack(factory: PeerConnectionFactory): AudioTrack {
        val source = factory.createAudioSource(createAudioConstraints())
        val track = factory.createAudioTrack("audio-${UUID.randomUUID()}", source)

        audioSource = source
        audioTrack = track
        track.setEnabled(micEnabled)
        return track
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

    private fun createAudioConstraints(): MediaConstraints {
        return MediaConstraints().apply {
            optional.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            optional.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            optional.add(MediaConstraints.KeyValuePair("googHighpassFilter", noiseCancellationEnabled.toString()))
            optional.add(MediaConstraints.KeyValuePair("googNoiseSuppression", noiseCancellationEnabled.toString()))
        }
    }

    private fun getPendingIceCandidates(peerId: String): MutableList<IceCandidate> {
        return pendingIceCandidatesByPeer.getOrPut(peerId) { mutableListOf() }
    }

    private fun createDefaultVideoEffects(): JSONObject {
        return JSONObject()
            .put("filter", "none")
            .put("aiFilter", "none")
            .put("sticker", "")
            .put("faceDetectEnabled", false)
            .put("beautyEnabled", false)
            .put("beautyLevel", 0)
            .put("smoothingLevel", 0)
            .put("whiteningLevel", 0)
            .put("eyeLevel", 0)
            .put("faceSlimLevel", 0)
            .put("makeup", JSONObject())
    }

    private fun mergeJsonObjects(base: JSONObject, updates: JSONObject): JSONObject {
        val merged = JSONObject(base.toString())
        val keys = updates.keys()

        while (keys.hasNext()) {
            val key = keys.next()
            merged.put(key, updates.opt(key))
        }

        return merged
    }

    private fun createLocalVideoTrack(factory: PeerConnectionFactory): VideoTrack? {
        videoTrack?.let { return it }

        val capturer = createCameraCapturer()

        if (capturer == null) {
            listener.onError("No camera capturer is available")
            return null
        }

        val textureHelper = SurfaceTextureHelper.create(
            "RtcServiceCaptureThread",
            eglBase.eglBaseContext
        )
        val source = factory.createVideoSource(capturer.isScreencast)

        videoCapturer = capturer
        surfaceTextureHelper = textureHelper
        videoSource = source

        capturer.initialize(textureHelper, context, source.capturerObserver)
        capturer.startCapture(config.videoWidth, config.videoHeight, config.videoFps)

        return factory.createVideoTrack("video-${UUID.randomUUID()}", source).also { track ->
            videoTrack = track
            track.setEnabled(cameraEnabled)
            localRenderer?.let { track.addSink(it) }
        }
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
        @Volatile
        private var factoryInitialized = false

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
    }
}
