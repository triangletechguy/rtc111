import RtcPlatformRoom from "./rtc-platform-room";

export default function MobileVideo() {
  return (
    <RtcPlatformRoom
      title="RTC Platform Test"
      subtitle="Native Android SDK from rtc-default-sdk-release.aar"
      defaultRoomId="buzzcast"
      accentColor="#208AEF"
    />
  );
}
