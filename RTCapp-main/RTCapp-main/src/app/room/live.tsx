import RtcPlatformRoom from "../../components/rtc-platform-room";

export default function SoloLiveRoom() {
  return (
    <RtcPlatformRoom
      title="Solo Live"
      subtitle="Testing live video through the RTC platform Android SDK"
      defaultRoomId="buzzcast"
      accentColor="#e91e8c"
    />
  );
}
