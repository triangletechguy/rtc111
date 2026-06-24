package com.rtcone.sdk

data class RtcConfig(
    val signalingUrl: String,
    val accessToken: String,
    val roomId: String,
    val userId: String,
    val enableAudio: Boolean = true,
    val enableVideo: Boolean = true
)