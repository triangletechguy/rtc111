import org.json.JSONObject
import org.webrtc.*

class RTCClient(
    private val factory: PeerConnectionFactory
) {

    private lateinit var peerManager: PeerConnectionManager
    private lateinit var localStream: MediaStream

    private var peerConnection: PeerConnection? = null

    fun init(onLocalStream: (MediaStream) -> Unit) {

        peerManager = PeerConnectionManager(factory)

        val audioSource = factory.createAudioSource(MediaConstraints())
        val videoSource = factory.createVideoSource(false)

        val audioTrack = factory.createAudioTrack("audio", audioSource)
        val videoTrack = factory.createVideoTrack("video", videoSource)

        localStream = factory.createLocalMediaStream("local")
        localStream.addTrack(audioTrack)
        localStream.addTrack(videoTrack)

        onLocalStream(localStream)
    }

    /**
     * CREATE OFFER (caller)
     */
    fun createOffer(to: String) {

        val connection = createPeer(to)

        connection.createOffer(object : SdpObserver {

            override fun onCreateSuccess(desc: SessionDescription) {

                connection.setLocalDescription(this, desc)

                val obj = JSONObject()
                obj.put("type", "offer")
                obj.put("sdp", desc.description)

                emitSignal(to, obj)
            }

            override fun onSetSuccess() {}
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(p0: String?) {}

        }, MediaConstraints())
    }

    /**
     * HANDLE SIGNAL (offer/answer/ice)
     */
    fun handleSignal(from: String, data: JSONObject) {

        when (data.getString("type")) {

            "offer" -> {

                val sdp = SessionDescription(
                    SessionDescription.Type.OFFER,
                    data.getString("sdp")
                )

                val connection = peerConnection ?: createPeer(from)

                connection.setRemoteDescription(object : SdpObserver {

                    override fun onSetSuccess() {

                        createAnswer(from)
                    }

                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onSetFailure(p0: String?) {}
                    override fun onCreateFailure(p0: String?) {}

                }, sdp)
            }

            "answer" -> {

                val sdp = SessionDescription(
                    SessionDescription.Type.ANSWER,
                    data.getString("sdp")
                )

                peerConnection?.setRemoteDescription(object : SdpObserver {

                    override fun onSetSuccess() {}
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onSetFailure(p0: String?) {}
                    override fun onCreateFailure(p0: String?) {}

                }, sdp)
            }

            "ice" -> {

                peerConnection?.addIceCandidate(
                    IceCandidate(
                        data.getString("sdpMid"),
                        data.getInt("sdpMLineIndex"),
                        data.getString("candidate")
                    )
                )
            }
        }
    }

    /**
     * ANSWER
     */
    private fun createAnswer(to: String) {

        val connection = peerConnection ?: return

        connection.createAnswer(object : SdpObserver {

            override fun onCreateSuccess(desc: SessionDescription) {

                connection.setLocalDescription(this, desc)

                val obj = JSONObject()
                obj.put("type", "answer")
                obj.put("sdp", desc.description)

                emitSignal(to, obj)
            }

            override fun onSetSuccess() {}
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(p0: String?) {}

        }, MediaConstraints())
    }

    private fun createPeer(to: String): PeerConnection {

        peerConnection?.close()

        val connection = peerManager.createPeer(object : PeerConnection.Observer {

            override fun onIceCandidate(candidate: IceCandidate?) {

                candidate?.let {

                    val obj = JSONObject()
                    obj.put("type", "ice")
                    obj.put("sdpMid", it.sdpMid)
                    obj.put("sdpMLineIndex", it.sdpMLineIndex)
                    obj.put("candidate", it.sdp)

                    emitSignal(to, obj)
                }
            }

            override fun onTrack(transceiver: RtpTransceiver?) {}
            override fun onAddStream(stream: MediaStream?) {}
            override fun onConnectionChange(state: PeerConnection.PeerConnectionState?) {}
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {}
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}
            override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
            override fun onRemoveStream(stream: MediaStream?) {}
            override fun onDataChannel(dc: DataChannel?) {}
            override fun onRenegotiationNeeded() {}

        })

        peerConnection = connection
        peerManager.addStream(localStream)

        return connection
    }

    private fun emitSignal(to: String, data: JSONObject) {

        val payload = JSONObject()
        payload.put("to", to)
        payload.put("data", data)

        SocketManager.emit("signal", payload)
    }
}
