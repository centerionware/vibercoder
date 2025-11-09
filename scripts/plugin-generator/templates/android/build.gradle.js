export const content = `
// This is a modern, standard Gradle configuration for an Android library,
// designed for compatibility with AGP 8.7.2+
plugins {
    id 'com.android.library'
    id 'org.jetbrains.kotlin.android'
}

android {
    namespace "com.aide.browser"
    compileSdk project.hasProperty('compileSdkVersion') ? project.property('compileSdkVersion') : 34

    defaultConfig {
        minSdkVersion project.hasProperty('minSdkVersion') ? project.property('minSdkVersion') : 22
        consumerProguardFiles "proguard-rules.pro"
    }

    buildTypes {
        release {
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_21
        targetCompatibility JavaVersion.VERSION_21
    }

    kotlinOptions {
        jvmTarget = '21'
    }

    // This block is crucial for libraries and was missing.
    // It prevents the library from generating its own BuildConfig file, which is good practice.
    buildFeatures {
        buildConfig false
    }
}

dependencies {
    def androidxAppCompatVersion = project.hasProperty('androidxAppCompatVersion') ? project.property('androidxAppCompatVersion') : '1.6.1'

    implementation project(':capacitor-android')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
}
`;
