// packages/sdk/src/rtc/permissions.ts
import { Platform, PermissionsAndroid } from 'react-native';

const MODIFY_AUDIO_SETTINGS =
  'android.permission.MODIFY_AUDIO_SETTINGS' as typeof PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;

export async function requestAudioPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      MODIFY_AUDIO_SETTINGS,
    ]);
    return (
      granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]          === 'granted' &&
      granted[MODIFY_AUDIO_SETTINGS]                                === 'granted'
    );
  } catch {
    return false;
  }
}

export async function checkAudioPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const audio  = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  const modify = await PermissionsAndroid.check(MODIFY_AUDIO_SETTINGS);
  return audio && modify;
}

export async function requestVideoPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      MODIFY_AUDIO_SETTINGS,
    ]);
    return (
      granted[PermissionsAndroid.PERMISSIONS.CAMERA]                === 'granted' &&
      granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]          === 'granted' &&
      granted[MODIFY_AUDIO_SETTINGS]                                === 'granted'
    );
  } catch {
    return false;
  }
}

export async function checkVideoPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const camera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  const audio  = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  const modify = await PermissionsAndroid.check(MODIFY_AUDIO_SETTINGS);
  return camera && audio && modify;
}
