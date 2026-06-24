import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import org.webrtc.MediaStream
import org.webrtc.PeerConnection

private const val SIGNALING_URL = "http://10.0.2.2:4000"
private const val ROOM_ID = "room1"
private const val RTC_ACCESS_TOKEN = "PASTE_TOKEN_FROM_WEB"

class MainActivity : AppCompatActivity(), RtcServiceSdk.Listener {

    private lateinit var rtcSdk: RtcServiceSdk

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (RTC_ACCESS_TOKEN == "PASTE_TOKEN_FROM_WEB") {
            // Replace RTC_ACCESS_TOKEN with a token created by POST /rtc-token before connecting.
            return
        }

        val sdk = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config(
        signalingUrl = "http://10.0.2.2:4000",
        accessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
        roomId = "room1"
    ),
    listener = object : RtcServiceSdk.Listener {
        override fun onConnected(socketId: String) {
            Log.d("RTC", "Connected: $socketId")
        }

        override fun onRoomJoined(roomId: String) {
            Log.d("RTC", "Joined room: $roomId")
        }

        override fun onRemoteStream(stream: MediaStream) {
            Log.d("RTC", "Remote stream received")
        }

        override fun onError(message: String) {
            Log.e("RTC", message)
        }
    }
)

sdk.connect()
sdk.joinRoom("room1")

    }

    override fun onConnected(socketId: String) {
        rtcSdk.joinRoom()
    }

    override fun onLocalStream(stream: MediaStream) {
        // Attach local stream/renderers in your app UI.
    }

    override fun onRemoteStream(stream: MediaStream) {
        // Attach remote stream/renderers in your app UI.
    }

    override fun onConnectionStateChanged(state: PeerConnection.PeerConnectionState) {
        // Update call state in your app UI.
    }

    override fun onError(message: String) {
        // Show or log connection/call errors in your app UI.
    }

    override fun onDestroy() {
        if (::rtcSdk.isInitialized) {
            rtcSdk.release()
        }

        super.onDestroy()
    }
}
