package com.rtcone.sdk

import android.content.Context
import org.webrtc.MediaStream
import org.webrtc.PeerConnection

class RtcDashboardSession private constructor(
    private val sdk: RtcServiceSdk
) {
    interface Listener {
        fun onStatusChanged(status: String) {}
        fun onConnected(roomId: String) {}
        fun onDisconnected(reason: String) {}
        fun onParticipantCountChanged(count: Int) {}
        fun onRemoteStream(peerId: String, stream: MediaStream) {}
        fun onLocalAudioMuted(muted: Boolean) {}
        fun onLocalVideoEnabled(enabled: Boolean) {}
        fun onSpeakerphoneChanged(enabled: Boolean) {}
        fun onCameraSwitched(isFrontCamera: Boolean) {}
        fun onError(message: String) {}
    }

    fun leaveRoom() {
        sdk.leaveRoom()
    }

    fun release() {
        sdk.release()
    }

    fun muteLocalAudio(muted: Boolean) {
        sdk.muteLocalAudio(muted)
    }

    fun setSpeakerphoneOn(enabled: Boolean) {
        sdk.setSpeakerphoneOn(enabled)
    }

    fun setLocalVideoEnabled(enabled: Boolean) {
        sdk.setLocalVideoEnabled(enabled)
    }

    fun switchCamera(): Boolean {
        return sdk.switchCamera()
    }

    fun setNoiseCancellationEnabled(enabled: Boolean) {
        sdk.setNoiseCancellationEnabled(enabled)
    }

    fun sendMessage(text: String) {
        sdk.sendMessage(text)
    }

    fun rawSdk(): RtcServiceSdk {
        return sdk
    }

    companion object {
        @JvmStatic
        fun parseToken(accessToken: String): RtcServiceSdk.AccessTokenInfo {
            return RtcServiceSdk.parseAccessToken(accessToken)
        }

        @JvmStatic
        fun requiredAndroidPermissions(accessToken: String): List<String> {
            return RtcServiceSdk.requiredAndroidPermissionsForToken(accessToken)
        }

        @JvmStatic
        fun requiredAndroidPermissions(accessToken: String, rtcMode: String?): List<String> {
            return RtcServiceSdk.requiredAndroidPermissionsForToken(accessToken, rtcMode)
        }

        @JvmStatic
        @JvmOverloads
        fun start(
            context: Context,
            accessToken: String,
            roomId: String? = null,
            signalingUrl: String = RtcServiceSdk.DEFAULT_SIGNALING_URL,
            listener: Listener = object : Listener {},
            appId: String? = null,
            appKey: String? = null,
            rtcMode: String? = null
        ): RtcDashboardSession {
            val config = RtcServiceSdk.Config.dashboardToken(
                accessToken = accessToken,
                roomId = roomId,
                signalingUrl = signalingUrl,
                appId = appId,
                appKey = appKey,
                rtcMode = rtcMode
            )
            val bridge = DashboardListener(config.roomId, listener)
            val sdk = RtcServiceSdk(context.applicationContext, config, bridge)
            val session = RtcDashboardSession(sdk)

            sdk.start()
            return session
        }
    }

    private class DashboardListener(
        private val configuredRoomId: String,
        private val listener: Listener
    ) : RtcServiceSdk.Listener {
        override fun onConnected(socketId: String) {
            listener.onStatusChanged("CONNECTED")
        }

        override fun onDisconnected(reason: String) {
            listener.onStatusChanged("DISCONNECTED")
            listener.onDisconnected(reason)
        }

        override fun onJoiningRoom(roomId: String) {
            listener.onStatusChanged("JOINING_ROOM")
        }

        override fun onRoomJoined(roomId: String) {
            listener.onStatusChanged("IN_ROOM")
            listener.onConnected(roomId.ifBlank { configuredRoomId })
        }

        override fun onRoomLeft(roomId: String) {
            listener.onStatusChanged("DISCONNECTED")
            listener.onDisconnected("left")
        }

        override fun onRoomState(participantCount: Int) {
            listener.onParticipantCountChanged(participantCount)
        }

        override fun onRemoteStreamForPeer(peerId: String, stream: MediaStream) {
            listener.onRemoteStream(peerId, stream)
        }

        override fun onLocalAudioMuted(muted: Boolean) {
            listener.onLocalAudioMuted(muted)
        }

        override fun onLocalVideoEnabled(enabled: Boolean) {
            listener.onLocalVideoEnabled(enabled)
        }

        override fun onSpeakerphoneChanged(enabled: Boolean) {
            listener.onSpeakerphoneChanged(enabled)
        }

        override fun onCameraSwitched(isFrontCamera: Boolean) {
            listener.onCameraSwitched(isFrontCamera)
        }

        override fun onConnectionStateChanged(state: PeerConnection.PeerConnectionState) {
            listener.onStatusChanged(state.name)
        }

        override fun onRtcConnectionIndicatorChanged(indicator: RtcServiceSdk.ConnectionIndicator) {
            listener.onStatusChanged(indicator.name)
        }

        override fun onRoomError(message: String) {
            listener.onError(message)
        }

        override fun onError(message: String) {
            listener.onError(message)
        }
    }
}
