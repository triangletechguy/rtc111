import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Platform } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const ROOMS = [
  { id: "1", host: "MissJay", initials: "MJ", color: "#c850c0", title: "Chilling and chatting with you all", type: "Group", viewers: "1,240", members: ["MJ","AR","SK"], extra: 12 },
  { id: "2", host: "AlexPlays", initials: "AB", color: "#4158d0", title: "Pushing Rank in Apex Legends!", type: "Screen", viewers: "859", members: ["AB","PK"], extra: 7 },
  { id: "3", host: "MelodyV", initials: "ML", color: "#9c27b0", title: "Live covers tonight — Request songs!", type: "Solo", viewers: "3,205", members: ["ML"], extra: 0 },
];

const MODES = [
  { label: "Group Video", icon: "👥", color: "#f5e6ff", iconColor: "#c850c0", route: "/room/group" },
  { label: "1-to-1 Call", icon: "📞", color: "#e6f1fb", iconColor: "#4158d0", route: "/room/call" },
  { label: "Solo Live",   icon: "📡", color: "#fce4ec", iconColor: "#e91e8c", route: "/room/live" },
  { label: "Screen Share",icon: "🖥️", color: "#eeedfe", iconColor: "#534ab7", route: "/room/screen" },
  { label: "SDK Test",     icon: "🔑", color: "#e8f5ee", iconColor: "#208aef", route: "/video" },
];

const NAV = [
  { label: "Home",         icon: "🏠", route: "/" },
  { label: "Group Video",  icon: "👥", route: "/room/group" },
  { label: "1-to-1 Call",  icon: "📞", route: "/room/call" },
  { label: "Solo Live",    icon: "📡", route: "/room/live" },
  { label: "Screen Share", icon: "🖥️", route: "/room/screen" },
  { label: "SDK Test",     icon: "🔑", route: "/video" },
];

const avatarColors = ["#c850c0","#4158d0","#e91e8c","#9c27b0","#534ab7"];

export default function HomeScreen() {
  const router = useRouter();
  const [active, setActive] = React.useState("All");
  const filters = ["All","Group Video","1-to-1 Call","Solo Live","Screen Share"];

  if (Platform.OS === "web") {
    return <WebLobby router={router} />;
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <LinearGradient colors={["#c850c0","#4158d0"]} start={{x:0,y:0}} end={{x:1,y:0}} style={s.logoBox}>
            <Text style={s.logoIcon}>📹</Text>
          </LinearGradient>
          <Text style={s.logoText}>RTCchat</Text>
          <View style={{flex:1}}/>
          <View style={s.avatar}><Text style={s.avatarText}>U</Text></View>
        </View>

        {/* Search */}
        <View style={s.searchBar}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput style={s.searchInput} placeholder="Search streamers, tags..." placeholderTextColor="#888" />
        </View>

        <Text style={s.sectionTitle}>Discover</Text>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
          {filters.map(f => (
            <TouchableOpacity key={f} onPress={()=>setActive(f)} style={[s.filterChip, active===f && s.filterActive]}>
              <Text style={[s.filterText, active===f && s.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Live Rooms */}
        <View style={s.sectionLabel}>
          <View style={s.dot}/>
          <Text style={s.sectionLabelText}>Recommended Live</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.roomsRow}>
          {ROOMS.map(room => (
            <TouchableOpacity key={room.id} style={s.roomCard} onPress={()=>router.push(room.type==="Group"?"/room/group":room.type==="Screen"?"/room/screen":"/room/live")}>
              <View style={[s.roomThumb, {backgroundColor: room.color+"22"}]}>
                <View style={s.roomBadges}>
                  <View style={s.badgeLive}><View style={s.bdot}/><Text style={s.badgeLiveText}>LIVE</Text></View>
                  <View style={s.badgeViewers}><Text style={s.badgeViewersText}>👥 {room.viewers}</Text></View>
                </View>
                <View style={s.typeBadge}><Text style={s.typeBadgeText}>{room.type}</Text></View>
                <View style={s.avatarCluster}>
                  <View style={s.avRow}>
                    {room.members.map((m,i)=>(
                      <View key={i} style={[s.av, {backgroundColor: avatarColors[i], marginLeft: i===0?0:-8}]}>
                        <Text style={s.avText}>{m}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={s.avCount}>{room.extra>0?`+${room.extra} in room`:`${room.viewers} watching`}</Text>
                </View>
              </View>
              <View style={s.roomInfo}>
                <View style={s.roomHost}>
                  <View style={[s.hostAv, {backgroundColor: room.color}]}><Text style={s.hostAvText}>{room.initials[0]}</Text></View>
                  <Text style={s.hostName}>{room.host}</Text>
                </View>
                <Text style={s.roomTitle} numberOfLines={1}>{room.title}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Start a room */}
        <View style={[s.sectionLabel, {marginTop:8}]}>
          <View style={[s.dot, {backgroundColor:"#888"}]}/>
          <Text style={s.sectionLabelText}>Start a room</Text>
        </View>
        <View style={s.modeGrid}>
          {MODES.map(m=>(
            <TouchableOpacity key={m.label} style={s.modeCard} onPress={()=>router.push(m.route as any)}>
              <View style={[s.modeIcon, {backgroundColor: m.color}]}><Text style={{fontSize:20}}>{m.icon}</Text></View>
              <Text style={s.modeLabel}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{height:32}}/>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Web version ──────────────────────────────────────────────
function WebLobby({router}: any) {
  const [active, setActive] = React.useState("All");
  const [activeNav, setActiveNav] = React.useState("/");
  const filters = ["All","Group Video","1-to-1 Call","Solo Live","Screen Share"];
  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"sans-serif",background:"#fff"}}>
      {/* Sidebar */}
      <div style={{width:210,borderRight:"0.5px solid #e0e0e0",display:"flex",flexDirection:"column",padding:"16px 12px",gap:2}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",marginBottom:12}}>
          <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#c850c0,#4158d0)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:"#fff",fontSize:16}}>📹</span>
          </div>
          <span style={{fontSize:17,fontWeight:500,background:"linear-gradient(135deg,#c850c0,#4158d0)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>RTCchat</span>
        </div>
        {NAV.map(n=>(
          <div key={n.route} onClick={()=>{setActiveNav(n.route);router.push(n.route);}}
            style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,cursor:"pointer",fontSize:14,
              color: activeNav===n.route?"#c850c0":"#666",
              background: activeNav===n.route?"#f5e6ff":"transparent"}}>
            <span>{n.icon}</span>{n.label}
          </div>
        ))}
        <div style={{marginTop:"auto",borderRadius:12,padding:14,background:"linear-gradient(135deg,#c850c0,#4158d0)",color:"#fff",cursor:"pointer"}}>
          <div style={{fontWeight:500,fontSize:14,marginBottom:2}}>Get Premium</div>
          <div style={{fontSize:11,opacity:0.85,marginBottom:10}}>Unlock exclusive gifts and badges!</div>
          <div style={{background:"#fff",color:"#c850c0",borderRadius:8,padding:"7px",textAlign:"center",fontSize:13,fontWeight:500,cursor:"pointer"}}>Upgrade Now</div>
        </div>
      </div>

      {/* Main */}
      <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
        {/* Topbar */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:8,background:"#f5f5f5",border:"0.5px solid #e0e0e0",borderRadius:20,padding:"8px 14px"}}>
            <span style={{color:"#aaa",fontSize:15}}>🔍</span>
            <input placeholder="Search streamers, tags..." style={{border:"none",background:"transparent",fontSize:13,outline:"none",flex:1,color:"#333"}}/>
          </div>
          <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#c850c0,#4158d0)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:500,color:"#fff"}}>U</div>
        </div>

        <div style={{fontSize:22,fontWeight:500,color:"#111",marginBottom:12}}>Discover</div>

        {/* Filters */}
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          {filters.map(f=>(
            <div key={f} onClick={()=>setActive(f)} style={{padding:"6px 16px",borderRadius:20,fontSize:13,cursor:"pointer",
              border: active===f?"none":"0.5px solid #e0e0e0",
              background: active===f?"linear-gradient(135deg,#c850c0,#4158d0)":"#fff",
              color: active===f?"#fff":"#666"}}>
              {f}
            </div>
          ))}
        </div>

        {/* Live rooms */}
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:15,fontWeight:500,color:"#111",marginBottom:12}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#c850c0"}}/>
          Recommended Live
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
          {ROOMS.map(room=>(
            <div key={room.id} onClick={()=>router.push(room.type==="Group"?"/room/group":room.type==="Screen"?"/room/screen":"/room/live")}
              style={{borderRadius:12,overflow:"hidden",cursor:"pointer",border:"0.5px solid #e0e0e0"}}>
              <div style={{height:130,background:room.type==="Group"?"#1a0a2e":room.type==="Screen"?"#0a1628":"#1a0a1a",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                <div style={{position:"absolute",top:8,left:8,display:"flex",gap:6,alignItems:"center"}}>
                  <div style={{background:"#c850c0",color:"#fff",fontSize:10,fontWeight:500,padding:"3px 8px",borderRadius:20,display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:"#fff"}}/>LIVE
                  </div>
                  <div style={{background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:10,padding:"3px 8px",borderRadius:20}}>👥 {room.viewers}</div>
                </div>
                <div style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,0.55)",color:"rgba(255,255,255,0.8)",fontSize:10,padding:"3px 8px",borderRadius:20}}>{room.type}</div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                  <div style={{display:"flex"}}>
                    {room.members.map((m,i)=>(
                      <div key={i} style={{width:36,height:36,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.2)",background:avatarColors[i],display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:500,color:"#fff",marginLeft:i===0?0:-8}}>
                        {m}
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.6)"}}>{room.extra>0?`+${room.extra} in room`:`${room.viewers} watching`}</div>
                </div>
              </div>
              <div style={{padding:"8px 10px",background:"#fff"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:room.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:500,color:"#fff"}}>{room.initials[0]}</div>
                  <span style={{fontSize:11,color:"#aaa"}}>{room.host}</span>
                </div>
                <div style={{fontSize:13,fontWeight:500,color:"#111",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{room.title}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Start a room */}
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:15,fontWeight:500,color:"#111",marginBottom:12}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#aaa"}}/>
          Start a room
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {MODES.map(m=>(
            <div key={m.label} onClick={()=>router.push(m.route as any)}
              style={{border:"0.5px solid #e0e0e0",borderRadius:12,padding:"14px 10px",textAlign:"center",cursor:"pointer",background:"#fff"}}>
              <div style={{width:42,height:42,borderRadius:12,margin:"0 auto 8px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,background:m.color}}>{m.icon}</div>
              <div style={{fontSize:12,color:"#666",fontWeight:500}}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import React from "react";

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:"#0a0a0a" },
  scroll: { flex:1 },
  header: { flexDirection:"row", alignItems:"center", gap:10, paddingHorizontal:16, paddingTop:12, paddingBottom:8 },
  logoBox: { width:34, height:34, borderRadius:10, alignItems:"center", justifyContent:"center" },
  logoIcon: { fontSize:16 },
  logoText: { fontSize:18, fontWeight:"700", color:"#c850c0" },
  avatar: { width:36, height:36, borderRadius:18, backgroundColor:"#c850c0", alignItems:"center", justifyContent:"center" },
  avatarText: { color:"#fff", fontSize:14, fontWeight:"600" },
  searchBar: { flexDirection:"row", alignItems:"center", gap:8, backgroundColor:"#1a1a1a", borderWidth:0.5, borderColor:"#333", borderRadius:20, paddingHorizontal:14, paddingVertical:10, marginHorizontal:16, marginBottom:16 },
  searchIcon: { fontSize:15 },
  searchInput: { flex:1, color:"#fff", fontSize:13 },
  sectionTitle: { fontSize:22, fontWeight:"700", color:"#fff", paddingHorizontal:16, marginBottom:12 },
  filterRow: { paddingHorizontal:16, marginBottom:16 },
  filterChip: { paddingHorizontal:16, paddingVertical:7, borderRadius:20, borderWidth:0.5, borderColor:"#333", marginRight:8, backgroundColor:"#1a1a1a" },
  filterActive: { backgroundColor:"#c850c0", borderColor:"#c850c0" },
  filterText: { fontSize:13, color:"#888" },
  filterTextActive: { color:"#fff" },
  sectionLabel: { flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:16, marginBottom:12 },
  dot: { width:8, height:8, borderRadius:4, backgroundColor:"#c850c0" },
  sectionLabelText: { fontSize:15, fontWeight:"600", color:"#fff" },
  roomsRow: { paddingLeft:16, marginBottom:16 },
  roomCard: { width:200, borderRadius:12, overflow:"hidden", borderWidth:0.5, borderColor:"#333", marginRight:12, backgroundColor:"#111" },
  roomThumb: { height:130, alignItems:"center", justifyContent:"center", position:"relative" },
  roomBadges: { position:"absolute", top:8, left:8, flexDirection:"row", gap:6, alignItems:"center" },
  badgeLive: { backgroundColor:"#c850c0", flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:20 },
  bdot: { width:5, height:5, borderRadius:3, backgroundColor:"#fff" },
  badgeLiveText: { color:"#fff", fontSize:10, fontWeight:"600" },
  badgeViewers: { backgroundColor:"rgba(0,0,0,0.6)", paddingHorizontal:8, paddingVertical:3, borderRadius:20 },
  badgeViewersText: { color:"#fff", fontSize:10 },
  typeBadge: { position:"absolute", top:8, right:8, backgroundColor:"rgba(0,0,0,0.6)", paddingHorizontal:8, paddingVertical:3, borderRadius:20 },
  typeBadgeText: { color:"rgba(255,255,255,0.8)", fontSize:10 },
  avatarCluster: { alignItems:"center", gap:6 },
  avRow: { flexDirection:"row" },
  av: { width:36, height:36, borderRadius:18, borderWidth:2, borderColor:"rgba(255,255,255,0.2)", alignItems:"center", justifyContent:"center" },
  avText: { color:"#fff", fontSize:11, fontWeight:"600" },
  avCount: { color:"rgba(255,255,255,0.6)", fontSize:11 },
  roomInfo: { padding:10, backgroundColor:"#111" },
  roomHost: { flexDirection:"row", alignItems:"center", gap:6, marginBottom:4 },
  hostAv: { width:20, height:20, borderRadius:10, alignItems:"center", justifyContent:"center" },
  hostAvText: { color:"#fff", fontSize:9, fontWeight:"600" },
  hostName: { color:"#888", fontSize:11 },
  roomTitle: { color:"#fff", fontSize:13, fontWeight:"500" },
  modeGrid: { flexDirection:"row", flexWrap:"wrap", paddingHorizontal:16, gap:10 },
  modeCard: { width:"47%", borderWidth:0.5, borderColor:"#333", borderRadius:12, padding:14, alignItems:"center", backgroundColor:"#111" },
  modeIcon: { width:42, height:42, borderRadius:12, alignItems:"center", justifyContent:"center", marginBottom:8 },
  modeLabel: { color:"#aaa", fontSize:12, fontWeight:"500" },
});
