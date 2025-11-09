export const content = `
ext {
    junitVersion = project.hasProperty('junitVersion') ? project.property('junitVersion') : '4.13.2'
    androidxAppCompatVersion = project.hasProperty('androidxAppCompatVersion') ? project.property('androidxAppCompatVersion') : '1.6.1'
    androidxJunitVersion = project.hasProperty('androidxJunitVersion') ? project.property('androidxJunitVersion') : '1.1.5'
    kotlin_version = project.hasProperty('kotlinVersion') ? project.property('kotlinVersion') : '1.9.22'
}

buildscript {
    ext {
        kotlin_version = project.hasProperty('kotlinVersion') ? project.property('kotlinVersion') : '1.9.22'
    }

    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.7.2'
        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
    }
}

apply plugin: 'com.android.library'
apply plugin: 'kotlin-android'

android {
    namespace "com.aide.browser"
    compileSdk project.hasProperty('compileSdkVersion') ? project.property('compileSdkVersion') : 34
    defaultConfig {
        minSdkVersion project.hasProperty('minSdkVersion') ? project.property('minSdkVersion') : 22
        targetSdkVersion project.hasProperty('targetSdkVersion') ? project.property('targetSdkVersion') : 34
        versionCode 1
        versionName "1.0"
        consumerProguardFiles 'proguard-rules.pro'
    }
    buildTypes {
        release {
            minifyEnabled false
        }
    }
    lintOptions {
        abortOnError false
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_21
        targetCompatibility JavaVersion.VERSION_21
    }
    kotlinOptions {
        jvmTarget = '21'
    }
}

repositories {
    google()
    mavenCentral()
}


dependencies {
    implementation fileTree(dir: 'libs', include: ['*.jar'])
    implementation project(':capacitor-android')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "org.jetbrains.kotlin:kotlin-stdlib:$kotlin_version"
    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
}
`;