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
        val videoWidth: Int = 1280,
        val videoHeight: Int = 720,
        val videoFps: Int = 30,
        val iceServers: List<PeerConnection.IceServer> = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
        )
    )

    interface Listener {
        fun onConnected(socketId: String) {}
        fun onDisconnected(reason: String) {}
        fun onRoomJoined(roomId: String) {}
        fun onRoomLeft(roomId: String) {}
        fun onRoomFull() {}
        fun onRoomError(message: String) {}
        fun onRoomState(participantCount: Int) {}
        fun onWaitingForPeer() {}
        fun onPeerJoined(peerId: String) {}
        fun onPeerLeft(peerId: String) {}
        fun onParticipantUpdated(peerId: String, micEnabled: Boolean, cameraEnabled: Boolean) {}
        fun onLocalStream(stream: MediaStream) {}
        fun onRemoteStream(stream: MediaStream) {}
        fun onLocalAudioMuted(muted: Boolean) {}
        fun onLocalVideoEnabled(enabled: Boolean) {}
        fun onSpeakerphoneChanged(enabled: Boolean) {}
        fun onConnectionStateChanged(state: PeerConnection.PeerConnectionState) {}
        fun onError(message: String) {}
    }

    private val eglBase = EglBase.create()
    private val pendingIceCandidates = mutableListOf<IceCandidate>()

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
    private var speakerEnabled = true

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

        val options = IO.Options().apply {
            auth = mapOf("token" to config.accessToken)
            transports = arrayOf("websocket", "polling")
        }

        socket = IO.socket(config.signalingUrl, options).also { socket ->
            bindSocketEvents(socket)
            socket.connect()
        }
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
        socket?.emit(
            "room:join",
            JSONObject()
                .put("roomId", roomId)
                .put("micEnabled", micEnabled)
                .put("cameraEnabled", cameraEnabled)
                .put("speakerEnabled", speakerEnabled)
        )
        listener.onRoomJoined(roomId)
    }

    fun startLocalMedia() {
        if (localStream != null) {
            localStream?.let { listener.onLocalStream(it) }
            return
        }

        val factory = getPeerConnectionFactory()
        val stream = factory.createLocalMediaStream("local-${UUID.randomUUID()}")

        if (config.enableAudio) {
            audioSource = factory.createAudioSource(MediaConstraints())
            audioTrack = factory.createAudioTrack("audio-${UUID.randomUUID()}", audioSource)
            audioTrack?.setEnabled(micEnabled)
            stream.addTrack(audioTrack)
        }

        if (config.enableVideo) {
            val capturer = createCameraCapturer()

            if (capturer == null) {
                listener.onError("No camera capturer is available")
            } else {
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

                videoTrack = factory.createVideoTrack("video-${UUID.randomUUID()}", source)
                videoTrack?.setEnabled(cameraEnabled)
                localRenderer?.let { videoTrack?.addSink(it) }
                stream.addTrack(videoTrack)
            }
        }

        localStream = stream
        listener.onLocalStream(stream)
    }

    fun leaveRoom() {
        socket?.emit("room:leave")
        closePeerConnection()
        listener.onRoomLeft(config.roomId)
    }

    fun muteLocalAudio(muted: Boolean) {
        micEnabled = !muted
        audioTrack?.setEnabled(micEnabled)
        emitMediaState()
        listener.onLocalAudioMuted(muted)
    }

    fun setLocalVideoEnabled(enabled: Boolean) {
        cameraEnabled = enabled
        videoTrack?.setEnabled(enabled)
        emitMediaState()
        listener.onLocalVideoEnabled(enabled)
    }

    fun setSpeakerphoneOn(enabled: Boolean) {
        speakerEnabled = enabled

        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager?.isSpeakerphoneOn = enabled

        emitMediaState()
        listener.onSpeakerphoneChanged(enabled)
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        closePeerConnection()
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
            listener.onConnected(socket.id())
        }

        socket.on(Socket.EVENT_DISCONNECT) { args ->
            listener.onDisconnected(args.firstOrNull()?.toString() ?: "disconnected")
        }

        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            listener.onError(args.firstOrNull()?.toString() ?: "Unable to connect")
        }

        socket.on("room:error") { args ->
            val message = (args.firstOrNull() as? JSONObject)?.optString("message")
                ?: "Unable to join room"
            listener.onRoomError(message)
        }

        socket.on("room:full") {
            listener.onRoomFull()
        }

        socket.on("room:left") { args ->
            val roomId = (args.firstOrNull() as? JSONObject)?.optString("roomId")
                ?: config.roomId
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
            val firstPeerId = users?.takeIf { it.length() > 0 }?.getString(0)

            if (firstPeerId == null) {
                listener.onWaitingForPeer()
                return@on
            }

            createOffer(firstPeerId)
        }

        socket.on("user-joined") { args ->
            val peerId = args.firstOrNull()?.toString() ?: return@on
            remotePeerId = peerId
            listener.onPeerJoined(peerId)
        }

        socket.on("user-left") { args ->
            val peerId = args.firstOrNull()?.toString() ?: return@on

            if (peerId == remotePeerId) {
                closePeerConnection()
                listener.onPeerLeft(peerId)
            }
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
        val connection = peerConnection ?: return

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
                val connection = peerConnection ?: createPeerConnection(peerId)
                val description = SessionDescription(
                    SessionDescription.Type.OFFER,
                    signal.getString("sdp")
                )

                connection.setRemoteDescription(object : EmptySdpObserver() {
                    override fun onSetSuccess() {
                        flushPendingIceCandidates(connection)
                        createAnswer(peerId)
                    }

                    override fun onSetFailure(error: String?) {
                        listener.onError(error ?: "Unable to set remote offer")
                    }
                }, description)
            }

            "answer" -> {
                val connection = peerConnection ?: return
                val description = SessionDescription(
                    SessionDescription.Type.ANSWER,
                    signal.getString("sdp")
                )

                connection.setRemoteDescription(object : EmptySdpObserver() {
                    override fun onSetSuccess() {
                        flushPendingIceCandidates(connection)
                    }

                    override fun onSetFailure(error: String?) {
                        listener.onError(error ?: "Unable to set remote answer")
                    }
                }, description)
            }

            "ice" -> {
                val connection = peerConnection ?: return
                val candidate = IceCandidate(
                    signal.getString("sdpMid"),
                    signal.getInt("sdpMLineIndex"),
                    signal.getString("candidate")
                )

                if (connection.remoteDescription != null) {
                    connection.addIceCandidate(candidate)
                } else {
                    pendingIceCandidates.add(candidate)
                }
            }
        }
    }

    private fun createPeerConnection(peerId: String): PeerConnection {
        startLocalMedia()

        if (peerConnection != null && remotePeerId == peerId) {
            return peerConnection!!
        }

        closePeerConnection()
        remotePeerId = peerId

        val rtcConfiguration = PeerConnection.RTCConfiguration(config.iceServers)
        val connection = getPeerConnectionFactory().createPeerConnection(
            rtcConfiguration,
            object : PeerConnection.Observer {
                override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {}
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
                    attachRemoteStream(stream)
                }

                override fun onRemoveStream(stream: MediaStream?) {}
                override fun onDataChannel(dataChannel: DataChannel?) {}
                override fun onRenegotiationNeeded() {}

                override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
                    streams?.firstOrNull()?.let { attachRemoteStream(it) }
                }

                override fun onTrack(transceiver: RtpTransceiver?) {
                    val track = transceiver?.receiver?.track()

                    if (track is VideoTrack) {
                        remoteRenderer?.let { track.addSink(it) }
                    }
                }

                override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
                    newState?.let { listener.onConnectionStateChanged(it) }
                }
            }
        ) ?: throw IllegalStateException("Unable to create PeerConnection")

        localStream?.let { stream ->
            val streamIds = listOf(stream.id)

            stream.audioTracks.forEach { connection.addTrack(it, streamIds) }
            stream.videoTracks.forEach { connection.addTrack(it, streamIds) }
        }

        peerConnection = connection
        return connection
    }

    private fun attachRemoteStream(stream: MediaStream) {
        remoteRenderer?.let { renderer ->
            stream.videoTracks.firstOrNull()?.addSink(renderer)
        }
        listener.onRemoteStream(stream)
    }

    private fun flushPendingIceCandidates(connection: PeerConnection) {
        pendingIceCandidates.toList().forEach { connection.addIceCandidate(it) }
        pendingIceCandidates.clear()
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
                .put("speakerEnabled", speakerEnabled)
        )
    }

    private fun closePeerConnection() {
        peerConnection?.close()
        peerConnection?.dispose()
        peerConnection = null
        remotePeerId = null
        pendingIceCandidates.clear()
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
