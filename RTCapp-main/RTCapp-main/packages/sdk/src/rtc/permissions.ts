// packages/sdk/src/rtc/permissions.ts
import { Platform, PermissionsAndroid } from 'react-native';

export async function requestAudioPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.MODIFY_AUDIO_SETTINGS,
    ]);
    return (
      granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]          === 'granted' &&
      granted[PermissionsAndroid.PERMISSIONS.MODIFY_AUDIO_SETTINGS] === 'granted'
    );
  } catch {
    return false;
  }
}

export async function checkAudioPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const audio  = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  const modify = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.MODIFY_AUDIO_SETTINGS);
  return audio && modify;
}
