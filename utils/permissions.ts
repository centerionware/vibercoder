import { Capacitor } from '@capacitor/core';
import { Permissions } from '@capacitor/permissions';

/**
 * Ensures that the application has microphone permissions, especially on native platforms.
 * It queries for the permission and, if necessary, prompts the user to grant it.
 * @returns {Promise<boolean>} A promise that resolves to `true` if permission is granted, and `false` otherwise.
 */
export async function ensureMicrophonePermission(): Promise<boolean> {
  // On the web, we don't need a pre-flight check, as the browser's own UI
  // will prompt the user when the microphone is first requested.
  if (!Capacitor.isNativePlatform()) {
    return true;
  }

  // On native, we need to explicitly ask the OS for permission first.
  try {
    // Check the current status of the microphone permission.
    let status = await Permissions.query({ name: 'microphone' });

    if (status.state === 'granted') {
      return true;
    }

    // If the user hasn't been asked yet, request the permission.
    if (status.state === 'prompt') {
      status = await Permissions.request({ name: 'microphone' });
    }

    // Return true only if the final state is 'granted'.
    return status.state === 'granted';
  } catch (e) {
    console.error("Error requesting microphone permission", e);
    return false;
  }
}


/**
 * Ensures that the application has camera permissions, especially on native platforms.
 * It queries for the permission and, if necessary, prompts the user to grant it.
 * @returns {Promise<boolean>} A promise that resolves to `true` if permission is granted, and `false` otherwise.
 */
export async function ensureCameraPermission(): Promise<boolean> {
  // On the web, we don't need a pre-flight check, as the browser's own UI
  // will prompt the user when the camera is first requested.
  if (!Capacitor.isNativePlatform()) {
    return true;
  }

  // On native, we need to explicitly ask the OS for permission first.
  try {
    // Check the current status of the camera permission.
    let status = await Permissions.query({ name: 'camera' });

    if (status.state === 'granted') {
      return true;
    }

    // If the user hasn't been asked yet, request the permission.
    if (status.state === 'prompt') {
      status = await Permissions.request({ name: 'camera' });
    }

    // Return true only if the final state is 'granted'.
    return status.state === 'granted';
  } catch (e) {
    console.error("Error requesting camera permission", e);
    return false;
  }
}

/**
 * Ensures that the application has geolocation permissions (GPS), especially on native platforms.
 * It queries for the permission and, if necessary, prompts the user to grant it.
 * @returns {Promise<boolean>} A promise that resolves to `true` if permission is granted, and `false` otherwise.
 */
export async function ensureGeolocationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return true;
  }

  try {
    // The 'geolocation' alias handles both Android's FINE/COARSE location and iOS's CoreLocation.
    let status = await Permissions.query({ name: 'geolocation' });

    if (status.state === 'granted') {
      return true;
    }

    if (status.state === 'prompt') {
      status = await Permissions.request({ name: 'geolocation' });
    }

    return status.state === 'granted';
  } catch (e) {
    console.error("Error requesting geolocation permission", e);
    return false;
  }
}
