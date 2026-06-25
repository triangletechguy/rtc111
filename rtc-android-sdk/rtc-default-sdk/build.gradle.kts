plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

val generatedRtcSdkDir = layout.buildDirectory.dir("generated/source/rtcSdk/main/kotlin")
val sourceRtcSdkFile = rootProject.file("../android-app/RtcServiceSdk.kt")

val generateRtcSdkSource by tasks.registering {
    inputs.file(sourceRtcSdkFile)
    outputs.dir(generatedRtcSdkDir)

    doLast {
        val targetDir = generatedRtcSdkDir.get().asFile.resolve("com/rtcone/sdk")
        val targetFile = targetDir.resolve("RtcServiceSdk.kt")

        targetDir.mkdirs()
        targetFile.writeText("package com.rtcone.sdk\n\n" + sourceRtcSdkFile.readText())
    }
}

android {
    namespace = "com.rtcone.sdk"
    compileSdk = 36

    defaultConfig {
        minSdk = 23
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    sourceSets {
        getByName("main") {
            java.srcDir(generatedRtcSdkDir)
        }
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    dependsOn(generateRtcSdkSource)
}

dependencies {
    api("io.github.webrtc-sdk:android:144.7559.09")
    implementation("io.socket:socket.io-client:2.1.2") {
        exclude(group = "org.json", module = "json")
    }
}
