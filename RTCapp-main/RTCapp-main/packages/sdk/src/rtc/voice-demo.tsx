// packages/sdk/src/rtc/voice-demo.tsx
// Demo screen — audio-only LiveKit call.
// Drop this into src/app/room/voice.tsx to test.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRtcClient } from './useRtcClient';

// ── Change these to match your setup ─────────────────────────────────────────
const AUTH_SERVER  = 'http://10.0.2.2:3001';   // localhost from Android emulator
const SDK_TOKEN    = 'PASTE_YOUR_SDK_JWT_HERE'; // from POST /sdk/token
const APP_ID       = 'PASTE_YOUR_APP_ID_HERE';  // ap_xxxx from your project keys
// ─────────────────────────────────────────────────────────────────────────────

export default function VoiceDemo() {
  const [channel,  setChannel]  = useState('test-room');
  const [identity, setIdentity] = useState('user-1');
  const [log,      setLog]      = useState<string[]>([]);

  const addLog = (msg: string) =>
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev.slice(0, 19)]);

  const {
    isJoined, isJoining, isMuted, remoteUids, error,
    join, leave, toggleAudio,
  } = useRtcClient({
    authServerUrl: AUTH_SERVER,
    appId:         APP_ID,
    sdkToken:      SDK_TOKEN,
    mode:          'audio',
  });

  const handleJoin = async () => {
    addLog(`Joining ${channel} as ${identity}...`);
    await join(channel, identity);
    addLog('Joined ✓');
  };

  const handleLeave = async () => {
    await leave();
    addLog('Left channel');
  };

  const handleToggleMute = async () => {
    await toggleAudio();
    addLog(isMuted ? 'Unmuted' : 'Muted');
  };

  return (
    <SafeAreaView style={s.safe}>
      <Text style={s.title}>LiveKit Voice Demo</Text>

      {!isJoined ? (
        <View style={s.lobby}>
          <Text style={s.label}>Channel</Text>
          <TextInput
            style={s.input}
            value={channel}
            onChangeText={setChannel}
            placeholder="room name"
            placeholderTextColor="#555"
            autoCapitalize="none"
          />
          <Text style={s.label}>Your name</Text>
          <TextInput
            style={s.input}
            value={identity}
            onChangeText={setIdentity}
            placeholder="identity"
            placeholderTextColor="#555"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[s.btn, s.btnJoin, isJoining && s.btnDisabled]}
            onPress={handleJoin}
            disabled={isJoining}
          >
            {isJoining
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>Join Room</Text>
            }
          </TouchableOpacity>
          {error && <Text style={s.error}>{error.message}</Text>}
        </View>
      ) : (
        <View style={s.call}>
          <Text style={s.callInfo}>
            In room: <Text style={s.highlight}>{channel}</Text>
          </Text>
          <Text style={s.callInfo}>
            Remote users: <Text style={s.highlight}>{remoteUids.length}</Text>
          </Text>
          {remoteUids.map(uid => (
            <Text key={uid} style={s.uid}>👤 {uid}</Text>
          ))}
          <View style={s.controls}>
            <TouchableOpacity style={[s.btn, isMuted && s.btnMuted]} onPress={handleToggleMute}>
              <Text style={s.btnText}>{isMuted ? '🔇 Unmute' : '🎤 Mute'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnLeave]} onPress={handleLeave}>
              <Text style={s.btnText}>Leave</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={s.logTitle}>Log</Text>
      <ScrollView style={s.logBox}>
        {log.map((l, i) => <Text key={i} style={s.logLine}>{l}</Text>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  title:       { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 20 },
  lobby:       { gap: 10 },
  label:       { color: '#aaa', fontSize: 13 },
  input:       { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333', borderRadius: 10, padding: 12, color: '#fff', fontSize: 16 },
  btn:         { backgroundColor: '#208AEF', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnJoin:     { marginTop: 8 },
  btnMuted:    { backgroundColor: '#e53935' },
  btnLeave:    { backgroundColor: '#555' },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: '#fff', fontSize: 16, fontWeight: '600' },
  error:       { color: '#ff4d4d', fontSize: 13, marginTop: 8 },
  call:        { gap: 10 },
  callInfo:    { color: '#aaa', fontSize: 14 },
  highlight:   { color: '#fff', fontWeight: '600' },
  uid:         { color: '#88cc88', fontSize: 13 },
  controls:    { flexDirection: 'row', gap: 10, marginTop: 16 },
  logTitle:    { color: '#555', fontSize: 12, marginTop: 24, marginBottom: 4 },
  logBox:      { backgroundColor: '#111', borderRadius: 8, padding: 8, maxHeight: 200 },
  logLine:     { color: '#88cc88', fontSize: 11, fontFamily: 'monospace', marginBottom: 2 },
});
