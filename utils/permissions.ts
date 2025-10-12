

import { Capacitor } from '@capacitor/core';

type PermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

/**
 * Ensures that the application has microphone permissions on native platforms.
 * It dynamically imports the `@capacitor/microphone` plugin to query and request permission.
 * @returns {Promise<boolean>} A promise resolving to `true` if permission is granted.
 */
export async function ensureMicrophonePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return true; // Web relies on the browser's own prompt.
  }
  try {
    const { Microphone } = await import('@capacitor/microphone');
    let permission: { microphone: PermissionState } = await Microphone.checkPermissions();

    if (permission.microphone === 'granted') {
      return true;
    }
    if (permission.microphone === 'prompt' || permission.microphone === 'prompt-with-rationale') {
      permission = await Microphone.requestPermissions();
    }
    return permission.microphone === 'granted';
  } catch (e) {
    console.error("Capacitor Microphone plugin failed. Is it installed?", e);
    return false;
  }
}

/**
 * Ensures that the application has camera permissions on native platforms.
 * It dynamically imports the `@capacitor/camera` plugin to query and request permission.
 * @returns {Promise<boolean>} A promise resolving to `true` if permission is granted.
 */
export async function ensureCameraPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return true;
  }
  try {
    const { Camera } = await import('@capacitor/camera');
    let permission: { camera: PermissionState } = await Camera.checkPermissions();

    if (permission.camera === 'granted') {
      return true;
    }
    if (permission.camera === 'prompt' || permission.camera === 'prompt-with-rationale') {
      permission = await Camera.requestPermissions();
    }
    return permission.camera === 'granted';
  } catch (e) {
    console.error("Capacitor Camera plugin failed. Is it installed?", e);
    return false;
  }
}

/**
 * Ensures that the application has geolocation permissions on native platforms.
 * It dynamically imports the `@capacitor/geolocation` plugin to query and request permission.
 * @returns {Promise<boolean>} A promise resolving to `true` if permission is granted.
 */
export async function ensureGeolocationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return true;
  }
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    // Note: The key for geolocation is 'location'.
    let permission: { location: PermissionState } = await Geolocation.checkPermissions();

    if (permission.location === 'granted') {
      return true;
    }
    if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') {
      permission = await Geolocation.requestPermissions();
    }
    return permission.location === 'granted';
  } catch (e) {
    console.error("Capacitor Geolocation plugin failed. Is it installed?", e);
    return false;
  }
}