group = "com.rtcone.flutter"
version = "1.0-SNAPSHOT"

buildscript {
    val kotlinVersion = "2.3.20"

    repositories {
        google()
        mavenCentral()
    }

    dependencies {
        classpath("com.android.tools.build:gradle:9.0.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")
    }
}

allprojects {
    repositories {
        maven {
            url = uri("local-maven")
        }
        google()
        mavenCentral()
    }
}

val rtcLocalMavenRepository = uri("local-maven")

rootProject.allprojects {
    repositories {
        maven {
            url = rtcLocalMavenRepository
        }
    }
}

repositories {
    maven {
        url = rtcLocalMavenRepository
    }
    google()
    mavenCentral()
}

plugins {
    id("com.android.library")
}

apply(plugin = "org.jetbrains.kotlin.android")

android {
    namespace = "com.rtcone.flutter"
    compileSdk = 36

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        getByName("main") {
            java.srcDirs("src/main/kotlin")
        }
    }

    defaultConfig {
        minSdk = 23
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    implementation("com.rtcone:rtc-default-sdk:0.1.0")
    implementation("io.socket:socket.io-client:2.1.2") {
        exclude(group = "org.json", module = "json")
    }
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
