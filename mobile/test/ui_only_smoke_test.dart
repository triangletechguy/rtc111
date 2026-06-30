import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rtc_enterprise_mobile/models/app_user.dart';
import 'package:rtc_enterprise_mobile/models/room.dart';
import 'package:rtc_enterprise_mobile/screens/live_room_screen.dart';
import 'package:rtc_enterprise_mobile/services/api_client.dart';

void main() {
  test('ApiClient uses local demo data only', () async {
    final api = ApiClient();

    final session = await api.login('admin@gmail.com', 'password');
    final rooms = await api.rooms();

    expect(session.user.email, 'admin@gmail.com');
    expect(rooms, isNotEmpty);
  });

  testWidgets('LiveRoomScreen renders UI preview controls', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LiveRoomScreen(api: ApiClient(), user: _user, room: _room),
      ),
    );

    expect(find.text('Preview mode'), findsOneWidget);
    expect(find.byIcon(Icons.mic), findsOneWidget);
    expect(find.byIcon(Icons.videocam_off), findsOneWidget);
  });
}

const _user = AppUser(
  id: 1,
  name: 'Ava Morgan',
  email: 'admin@gmail.com',
  gender: 'female',
  age: 30,
  birthday: '1996-01-01',
  currentResidence: 'United States',
  avatarUrl: 'assets/rtc/avatars/avatar-01.png',
  roles: ['super_admin'],
);

final _room = Room(
  id: 77,
  ownerId: 1,
  ownerName: 'Ava Morgan',
  ownerRegion: 'United States',
  name: 'Creator Studio Live',
  description: 'A UI-only live room preview.',
  roomType: 'video',
  privacyType: 'public',
  maxMicCount: 4,
  activeParticipants: 42,
  activeParticipantPreviews: const [
    RoomParticipantPreview(userId: 201, name: 'Maya'),
    RoomParticipantPreview(userId: 202, name: 'Jon'),
  ],
  chatEnabled: true,
  screenShareEnabled: true,
);
