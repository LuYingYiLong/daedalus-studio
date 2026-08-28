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

androidComponents {
	onVariants { variant ->
		variant.sources.assets?.addStaticSourceDirectory("build/generated/remoteAssets")
	}
}

dependencies {
	implementation("androidx.activity:activity:1.12.1")
	implementation("androidx.webkit:webkit:1.17.0")
	implementation("androidx.camera:camera-camera2:1.6.1")
	implementation("androidx.camera:camera-lifecycle:1.6.1")
	implementation("androidx.camera:camera-view:1.6.1")
	implementation("com.google.mlkit:barcode-scanning:17.3.0")
	testImplementation("junit:junit:4.13.2")
}
