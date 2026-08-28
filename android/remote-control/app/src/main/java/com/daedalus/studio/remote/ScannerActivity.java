package com.daedalus.studio.remote;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.Size;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ScannerActivity extends ComponentActivity implements ImageAnalysis.Analyzer {
	public static final String RESULT_URL = "scan_result_url";
	private static final int CAMERA_PERMISSION_REQUEST = 18;

	private final AtomicBoolean processing = new AtomicBoolean(false);
	private final ExecutorService cameraExecutor = Executors.newSingleThreadExecutor();
	private final BarcodeScanner barcodeScanner = BarcodeScanning.getClient(
		new BarcodeScannerOptions.Builder()
			.setBarcodeFormats(Barcode.FORMAT_QR_CODE)
			.build()
	);
	private PreviewView previewView;
	private TextView statusText;
	private Camera camera;
	private GestureDetector gestureDetector;
	private ScaleGestureDetector scaleGestureDetector;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		previewView = new PreviewView(this);
		FrameLayout root = new FrameLayout(this);
		root.setBackgroundColor(Color.BLACK);
		root.addView(previewView, new FrameLayout.LayoutParams(
			ViewGroup.LayoutParams.MATCH_PARENT,
			ViewGroup.LayoutParams.MATCH_PARENT
		));

		ViewGroup.LayoutParams guideSize = new FrameLayout.LayoutParams(dp(280), dp(280), Gravity.CENTER);
		FrameLayout scanGuide = new FrameLayout(this);
		GradientDrawable guideBackground = new GradientDrawable();
		guideBackground.setColor(Color.TRANSPARENT);
		guideBackground.setCornerRadius(dp(16));
		guideBackground.setStroke(dp(3), Color.WHITE);
		scanGuide.setBackground(guideBackground);
		root.addView(scanGuide, guideSize);

		statusText = new TextView(this);
		statusText.setText(R.string.scanner_hint);
		statusText.setTextColor(Color.WHITE);
		statusText.setTextSize(16.0f);
		statusText.setGravity(Gravity.CENTER);
		statusText.setPadding(dp(16), dp(10), dp(16), dp(10));
		GradientDrawable statusBackground = new GradientDrawable();
		statusBackground.setColor(0x99000000);
		statusBackground.setCornerRadius(dp(12));
		statusText.setBackground(statusBackground);
		FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
			ViewGroup.LayoutParams.MATCH_PARENT,
			ViewGroup.LayoutParams.WRAP_CONTENT
		);
		statusParams.gravity = Gravity.BOTTOM;
		statusParams.setMargins(dp(24), 0, dp(24), dp(48));
		root.addView(statusText, statusParams);

		Button cancel = new Button(this);
		cancel.setText(android.R.string.cancel);
		FrameLayout.LayoutParams cancelParams = new FrameLayout.LayoutParams(
			ViewGroup.LayoutParams.WRAP_CONTENT,
			dp(56)
		);
		cancelParams.gravity = Gravity.TOP | Gravity.END;
		cancelParams.setMargins(dp(16), dp(32), dp(16), 0);
		cancel.setOnClickListener(view -> finish());
		root.addView(cancel, cancelParams);
		setContentView(root);
		configureCameraGestures();

		if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
			startCamera();
		} else {
			requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
		}
	}

	@Override
	public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
		super.onRequestPermissionsResult(requestCode, permissions, grantResults);
		if (requestCode == CAMERA_PERMISSION_REQUEST
			&& grantResults.length > 0
			&& grantResults[0] == PackageManager.PERMISSION_GRANTED) {
			startCamera();
			return;
		}
		setResult(RESULT_CANCELED);
		finish();
	}

	@Override
	@ExperimentalGetImage
	public void analyze(@NonNull ImageProxy imageProxy) {
		if (!processing.compareAndSet(false, true)) {
			imageProxy.close();
			return;
		}
		if (imageProxy.getImage() == null) {
			processing.set(false);
			imageProxy.close();
			return;
		}
		InputImage image = InputImage.fromMediaImage(
			imageProxy.getImage(),
			imageProxy.getImageInfo().getRotationDegrees()
		);
		barcodeScanner.process(image)
			.addOnSuccessListener(this::handleBarcodes)
			.addOnCompleteListener(task -> {
				processing.set(false);
				imageProxy.close();
			});
	}

	@Override
	protected void onDestroy() {
		barcodeScanner.close();
		cameraExecutor.shutdownNow();
		super.onDestroy();
	}

	private void startCamera() {
		ListenableFuture<ProcessCameraProvider> providerFuture = ProcessCameraProvider.getInstance(this);
		providerFuture.addListener(() -> {
			try {
				ProcessCameraProvider provider = providerFuture.get();
				Preview preview = new Preview.Builder().build();
				preview.setSurfaceProvider(previewView.getSurfaceProvider());
				ResolutionSelector resolutionSelector = new ResolutionSelector.Builder()
					.setResolutionStrategy(new ResolutionStrategy(
						new Size(1920, 1080),
						ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER
					))
					.build();
				ImageAnalysis analysis = new ImageAnalysis.Builder()
					.setResolutionSelector(resolutionSelector)
					.setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
					.build();
				analysis.setAnalyzer(cameraExecutor, this);
				provider.unbindAll();
				camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
				previewView.post(() -> focusAt(
					previewView.getWidth() / 2.0f,
					previewView.getHeight() / 2.0f,
					false
				));
			} catch (Exception error) {
				setResult(RESULT_CANCELED);
				finish();
			}
		}, ContextCompat.getMainExecutor(this));
	}

	private void handleBarcodes(List<Barcode> barcodes) {
		boolean foundInvalidCode = false;
		for (Barcode barcode : barcodes) {
			String rawValue = barcode.getRawValue();
			if (rawValue == null || rawValue.isEmpty()) continue;
			try {
				PairingLink.parse(rawValue);
			} catch (IllegalArgumentException ignored) {
				foundInvalidCode = true;
				continue;
			}
			Intent result = new Intent().putExtra(RESULT_URL, rawValue);
			setResult(RESULT_OK, result);
			finish();
			return;
		}
		if (foundInvalidCode) statusText.setText(R.string.scanner_invalid_code);
	}

	private void configureCameraGestures() {
		gestureDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
			@Override
			public boolean onDown(@NonNull MotionEvent event) {
				return true;
			}

			@Override
			public boolean onSingleTapUp(@NonNull MotionEvent event) {
				focusAt(event.getX(), event.getY(), true);
				return true;
			}
		});
		scaleGestureDetector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
			@Override
			public boolean onScale(@NonNull ScaleGestureDetector detector) {
				Camera activeCamera = camera;
				if (activeCamera == null || activeCamera.getCameraInfo().getZoomState().getValue() == null) return false;
				float currentZoom = activeCamera.getCameraInfo().getZoomState().getValue().getZoomRatio();
				float minZoom = activeCamera.getCameraInfo().getZoomState().getValue().getMinZoomRatio();
				float maxZoom = activeCamera.getCameraInfo().getZoomState().getValue().getMaxZoomRatio();
				float targetZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom * detector.getScaleFactor()));
				activeCamera.getCameraControl().setZoomRatio(targetZoom);
				return true;
			}
		});
		previewView.setOnTouchListener((view, event) -> {
			boolean scaled = scaleGestureDetector.onTouchEvent(event);
			boolean tapped = gestureDetector.onTouchEvent(event);
			if (event.getActionMasked() == MotionEvent.ACTION_UP) view.performClick();
			return scaled || tapped || event.getActionMasked() == MotionEvent.ACTION_DOWN;
		});
	}

	private void focusAt(float x, float y, boolean showStatus) {
		Camera activeCamera = camera;
		if (activeCamera == null || previewView.getWidth() == 0 || previewView.getHeight() == 0) return;
		if (showStatus) statusText.setText(R.string.scanner_focusing);
		MeteringPoint point = previewView.getMeteringPointFactory().createPoint(x, y);
		FocusMeteringAction action = new FocusMeteringAction.Builder(
			point,
			FocusMeteringAction.FLAG_AF | FocusMeteringAction.FLAG_AE
		)
			.setAutoCancelDuration(3, TimeUnit.SECONDS)
			.build();
		activeCamera.getCameraControl().startFocusAndMetering(action).addListener(
			() -> runOnUiThread(() -> statusText.setText(R.string.scanner_hint)),
			ContextCompat.getMainExecutor(this)
		);
	}

	private int dp(int value) {
		return Math.round(value * getResources().getDisplayMetrics().density);
	}
}
