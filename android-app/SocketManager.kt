import io.socket.client.IO
import io.socket.client.Socket

object SocketManager {

    lateinit var socket: Socket

    fun connect(url: String, token: String? = null) {
        val options = IO.Options()

        if (!token.isNullOrBlank()) {
            options.auth = mapOf("token" to token)
        }

        socket = IO.socket(url, options)
        socket.connect()
    }

    fun emit(event: String, data: Any) {
        socket.emit(event, data)
    }

    fun on(event: String, handler: (Any) -> Unit) {
        socket.on(event) { args ->
            if (args.isNotEmpty()) {
                handler(args[0])
            }
        }
    }
}
