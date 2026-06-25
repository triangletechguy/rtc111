import RtcPlatformRoom from "../../components/rtc-platform-room";

export default function GroupVideoRoom() {
  return (
    <RtcPlatformRoom
      title="Group Video"
      subtitle="Testing group video through the RTC platform Android SDK"
      defaultRoomId="buzzcast"
      accentColor="#c850c0"
    />
  );
}
