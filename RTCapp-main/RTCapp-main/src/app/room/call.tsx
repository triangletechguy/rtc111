import RtcPlatformRoom from "../../components/rtc-platform-room";

export default function OneToOneCall() {
  return (
    <RtcPlatformRoom
      title="1-to-1 Call"
      subtitle="Testing direct calling through the RTC platform Android SDK"
      defaultRoomId="hapi"
      accentColor="#4158d0"
    />
  );
}
