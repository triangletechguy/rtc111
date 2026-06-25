import RtcPlatformRoom from "../../components/rtc-platform-room";

export default function ScreenShareRoom() {
  return (
    <RtcPlatformRoom
      title="Screen Share"
      subtitle="Testing the RTC platform Android SDK connection path"
      defaultRoomId="hapi"
      accentColor="#534ab7"
    />
  );
}
