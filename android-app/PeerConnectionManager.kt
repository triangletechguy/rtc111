import org.webrtc.*

class PeerConnectionManager(
    private val factory: PeerConnectionFactory
) {

    var peerConnection: PeerConnection? = null

    fun createPeer(observer: PeerConnection.Observer): PeerConnection {

        val iceServers = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302")
                .createIceServer()
        )

        val config = PeerConnection.RTCConfiguration(iceServers)

        peerConnection = factory.createPeerConnection(config, observer)

        return peerConnection!!
    }

    fun addStream(stream: MediaStream) {
        val streamIds = listOf(stream.id)

        stream.audioTracks.forEach {
            peerConnection?.addTrack(it, streamIds)
        }

        stream.videoTracks.forEach {
            peerConnection?.addTrack(it, streamIds)
        }
    }
}
