plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
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
        versionName = "0.1.$ciRun"
        // The app checks this folder on the website for books added after the APK was built.
        buildConfigField("String", "BOOKS_URL", "\"https://bookreel-sand.vercel.app/books/\"")
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
        compose = true
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
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.profileinstaller)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.serialization.json)
}
