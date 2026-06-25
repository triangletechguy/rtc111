import RtcPlatformRoom from "./rtc-platform-room";

export default function MobileVideo() {
  return (
    <RtcPlatformRoom
      title="RTC Platform Test"
      subtitle="Native Android SDK from rtc-platform-live-sdk-release.aar"
      defaultRoomId="hapi"
      accentColor="#208AEF"
    />
  );
}
