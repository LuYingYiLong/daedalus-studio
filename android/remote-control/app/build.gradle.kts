plugins {
	id("com.android.application")
}

android {
	namespace = "com.daedalus.studio.remote"
	compileSdk = 36
	buildToolsVersion = "36.0.0"

	defaultConfig {
		applicationId = "com.daedalus.studio.remote"
		minSdk = 26
		targetSdk = 36
		versionCode = 10105
		versionName = "1.1.5"
	}

	buildFeatures {
		buildConfig = true
	}

	buildTypes {
		release {
			isMinifyEnabled = true
			isShrinkResources = true
			proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
		}
	}

	compileOptions {
		sourceCompatibility = JavaVersion.VERSION_17
		targetCompatibility = JavaVersion.VERSION_17
	}
}
