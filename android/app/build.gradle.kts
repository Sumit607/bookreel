plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

// versionCode comes from the CI run number so every build installs over the last one.
val ciRun = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "app.bookreel"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.bookreel"
        minSdk = 26
        targetSdk = 35
        versionCode = ciRun
        // 1.x: the thin shell around the web app (0.1.x was the fully native app).
        versionName = "1.0.$ciRun"
    }

    signingConfigs {
        // Development key, committed on purpose so every CI build updates the app in place.
        // Replace with a secret upload key before any Play Store release (see the plan doc).
        create("dev") {
            storeFile = file("dev-signing.jks")
            storePassword = "bookreel-dev"
            keyAlias = "bookreel"
            keyPassword = "bookreel-dev"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("dev")
        }
        debug {
            signingConfig = signingConfigs.getByName("dev")
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "DebugProbesKt.bin", "kotlin-tooling-metadata.json")
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)

    testImplementation(libs.junit)
}
