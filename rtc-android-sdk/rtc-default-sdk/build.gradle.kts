import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

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
    api("io.socket:socket.io-client:2.1.2") {
        exclude(group = "org.json", module = "json")
    }
}

val bundleSelfContainedReleaseAar by tasks.registering {
    group = "build"
    description = "Builds an integration-safe release AAR with WebRTC jars/native libs; Socket.IO, Engine.IO, OkHttp, and Okio stay external."

    dependsOn("bundleReleaseAar")

    val releaseAar = layout.buildDirectory.file("outputs/aar/rtc-default-sdk-release.aar")
    val selfContainedAar = layout.buildDirectory.file("outputs/aar/rtc-default-sdk-release-self-contained.aar")
    val runtimeClasspath = configurations.named("releaseRuntimeClasspath")

    inputs.file(releaseAar)
    inputs.files(runtimeClasspath)
    outputs.file(selfContainedAar)

    doLast {
        val sourceAar = releaseAar.get().asFile
        val targetAar = selfContainedAar.get().asFile
        val workDir = layout.buildDirectory.dir("intermediates/self-contained-aar/release").get().asFile
        val embeddedDir = layout.buildDirectory.dir("intermediates/self-contained-aar/dependencies").get().asFile
        val libsDir = workDir.resolve("libs")

        delete(workDir)
        delete(embeddedDir)

        copy {
            from(zipTree(sourceAar))
            into(workDir)
        }

        libsDir.mkdirs()

        runtimeClasspath.get().resolvedConfiguration.resolvedArtifacts.forEach { artifact ->
            val group = artifact.moduleVersion.id.group

            if (group !in setOf("io.github.webrtc-sdk")) {
                return@forEach
            }

            val file = artifact.file
            val safeName = artifact.file.nameWithoutExtension
                .replace(Regex("[^A-Za-z0-9_.-]"), "-")

            when (file.extension.lowercase()) {
                "jar" -> {
                    copy {
                        from(file)
                        into(libsDir)
                        rename { "$safeName.jar" }
                    }
                }
                "aar" -> {
                    val dependencyDir = embeddedDir.resolve(safeName)

                    copy {
                        from(zipTree(file))
                        into(dependencyDir)
                    }

                    dependencyDir.resolve("classes.jar")
                        .takeIf { it.exists() }
                        ?.copyTo(libsDir.resolve("$safeName.jar"), overwrite = true)

                    dependencyDir.resolve("libs")
                        .takeIf { it.exists() }
                        ?.let { dependencyLibs ->
                            copy {
                                from(dependencyLibs)
                                into(libsDir)
                            }
                        }

                    dependencyDir.resolve("jni")
                        .takeIf { it.exists() }
                        ?.let { dependencyJni ->
                            copy {
                                from(dependencyJni)
                                into(workDir.resolve("jni"))
                            }
                        }
                }
            }
        }

        targetAar.parentFile.mkdirs()
        zipDirectory(workDir, targetAar)
    }
}

val syncReleaseArtifacts by tasks.registering {
    group = "build"
    description = "Copies release AAR outputs to repository integration locations."

    dependsOn("bundleReleaseAar", bundleSelfContainedReleaseAar)

    val releaseAar = layout.buildDirectory.file("outputs/aar/rtc-default-sdk-release.aar")
    val selfContainedAar = layout.buildDirectory.file("outputs/aar/rtc-default-sdk-release-self-contained.aar")
    val repositoryRoot = rootProject.file("..")
    val flutterLocalMavenAar = rootProject.file(
        "../rtc_flutter_sdk/android/local-maven/com/rtcone/rtc-default-sdk/0.1.0/rtc-default-sdk-0.1.0.aar"
    )
    val expoBridgeAar = rootProject.file(
        "../RTCapp-main/modules/rtc-dashboard-sdk/android/libs/rtc-default-sdk-release.aar"
    )

    inputs.files(releaseAar, selfContainedAar)
    outputs.files(
        repositoryRoot.resolve("rtc-default-sdk-release.aar"),
        repositoryRoot.resolve("funint.online.aar"),
        flutterLocalMavenAar,
        expoBridgeAar
    )

    doLast {
        val release = releaseAar.get().asFile
        val selfContained = selfContainedAar.get().asFile

        selfContained.copyTo(repositoryRoot.resolve("rtc-default-sdk-release.aar"), overwrite = true)
        selfContained.copyTo(repositoryRoot.resolve("funint.online.aar"), overwrite = true)

        flutterLocalMavenAar.parentFile.mkdirs()
        release.copyTo(flutterLocalMavenAar, overwrite = true)

        expoBridgeAar.parentFile.mkdirs()
        selfContained.copyTo(expoBridgeAar, overwrite = true)
    }
}

tasks.matching { it.name == "assembleRelease" }.configureEach {
    finalizedBy(syncReleaseArtifacts)
}

fun zipDirectory(sourceDir: File, targetFile: File) {
    val addedEntries = mutableSetOf<String>()

    ZipOutputStream(targetFile.outputStream().buffered()).use { output ->
        sourceDir.walkTopDown()
            .filter { it.isFile }
            .sortedBy { it.relativeTo(sourceDir).invariantSeparatorsPath }
            .forEach { file ->
                val entryName = file.relativeTo(sourceDir).invariantSeparatorsPath

                if (addedEntries.add(entryName)) {
                    output.putNextEntry(ZipEntry(entryName))
                    file.inputStream().buffered().use { input -> input.copyTo(output) }
                    output.closeEntry()
                }
            }
    }
}
