const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = { page:"home", voiceId:localStorage.getItem("rohanVoiceId")||"", voices:[], speed:Number(localStorage.getItem("rohanSpeed")||1), speak:localStorage.getItem("rohanSpeak")!=="false", wake:false, recognition:null, listening:false, audio:null, musicAudio:null, musicOn:false, track:"library", audioCtx:null, musicNodes:[], musicStarted:0, scores:{you:0,ai:0,draw:0}, board:Array(9).fill(""), gameOver:false, assistantVolume:Number(localStorage.getItem("rohanVolume")||85) };
const tracks=[{id:"library",name:"Your music",desc:"Your MP3 from Rohan AI",src:"https://home.rohansweb.co.uk/ROHANAI/untitled-video-8_otfFPTjE.mp3"}];
function go(page){state.page=page;$$(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));$$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));const titles={home:"Good morning, Rohan",games:"Let's play a game",music:"Your music space",voice:"Voice studio",settings:"Settings"};$("#pageTitle").textContent=titles[page]||"Rohan AI";if(page==="voice"&&!state.voices.length)loadVoices();if(page==="games")renderBoard();if(page==="settings")syncSettings();window.scrollTo({top:0,behavior:"smooth"});}
$$("[data-page]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
$("#quickSettings").onclick=()=>go("settings");
function addMessage(text,who="assistant"){const row=document.createElement("div");row.className="message "+(who==="user"?"user-message":"assistant-message");if(who==="assistant"){const a=document.createElement("span");a.className="message-avatar";a.textContent="R";row.append(a);}const p=document.createElement("p");p.textContent=text;row.append(p);$("#conversation").append(row);$("#conversation").scrollTop=$("#conversation").scrollHeight;}
function setMood(mood,label){
  $("#orbWrap").classList.remove("listening","speaking");
  if(mood)$("#orbWrap").classList.add(mood);
  $("#assistantState").textContent=label;
  const title=$("#voiceScreenTitle"), detail=$("#voiceScreenText"), panel=$("#voiceScreen");
  if(title&&detail&&panel){
    panel.classList.toggle("is-active",mood==="listening"||mood==="speaking");
    if(mood==="listening"){title.textContent=state.wake?"Listening for Hey Rowan":"I'm listening";detail.textContent="Speak clearly. I'm waiting for your request.";}
    else if(mood==="speaking"){title.textContent="Rohan AI is speaking";detail.textContent="Playing your reply with Cartesia voice.";}
    else if(label.includes("UNAVAILABLE")||label.includes("NOT READY")){title.textContent="Voice needs attention";detail.textContent=$("#voiceNote")?.textContent||"Check the Cartesia connection.";}
    else {title.textContent="Your assistant is ready";detail.textContent="Press the large button to allow microphone access and speak.";}
  }
}
function resumeWakeListening(){if(!state.wake||state.listening)return;state.listening=true;try{state.recognition?.start();$("#listenLabel").textContent="Listening for Hey Rowan";$("#listenButton").classList.add("listening");setMood("listening","ALWAYS LISTENING FOR HEY ROWAN");}catch{}}
async function speak(text){
  if(!state.speak){if(state.wake)setTimeout(resumeWakeListening,500);return;}
  const finish=()=>{setMood("","READY WHEN YOU ARE");if(state.wake)setTimeout(resumeWakeListening,700);};
  if(!state.voiceId){$("#voiceNote").textContent="Cartesia voice is not connected. Replace the API key in Render, redeploy, then refresh this page.";setMood("","CARTESIA VOICE NOT READY");$("#voiceScreenTitle").textContent="Cartesia voice is not connected";$("#voiceScreenText").textContent=$("#voiceNote").textContent;finish();return;}
  try{
    const speechText=text.replace(/\bRohan\b/gi,"Rowan");
    const response=await fetch("/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:speechText,voiceId:state.voiceId,speed:state.speed})});
    if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||"Cartesia speech failed");
    const blob=await response.blob();if(!blob.size)throw new Error("Cartesia returned empty audio");
    if(state.audio){state.audio.pause();if(state.audio.src.startsWith("blob:"))URL.revokeObjectURL(state.audio.src);}
    const url=URL.createObjectURL(blob);state.audio=new Audio(url);state.audio.volume=state.assistantVolume/100;
    state.audio.onended=()=>{URL.revokeObjectURL(url);finish();};
    state.audio.onerror=()=>{URL.revokeObjectURL(url);$("#voiceNote").textContent="Cartesia audio could not be played. Try Preview voice again.";finish();};
    setMood("speaking","ROHAN IS SPEAKING");await state.audio.play();
  }catch(e){$("#voiceNote").textContent="Cartesia speech error: "+e.message;setMood("","CARTESIA SPEECH UNAVAILABLE");finish();}
}
function reply(text){addMessage(text);$("#orbHeading").textContent="I'm on it.";$("#orbSubtitle").textContent=text.length>65?text.slice(0,65)+"…":text;speak(text);}
function handleCommand(raw){const text=raw.trim();if(!text)return;addMessage(text,"user");const t=text.toLowerCase().replace(/[.!?]/g,"");if(/^(hey )?rohan[, ]*/.test(t)){}if(/(hello|hi rohan|hey rohan|good morning)/.test(t)){reply("Hello! Lovely to hear from you. What would you like to do?");return;}if(/(what can you do|help|commands)/.test(t)){reply("I can open games, play my original music soundscapes, tell you the time and date, change settings, and speak using your chosen Cartesia voice. Try saying, open games, play music, or what time is it.");return;}if(/(time is it|current time)/.test(t)){reply("It's "+new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})+".");return;}if(/(what day|date is it|today's date)/.test(t)){reply("Today is "+new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})+".");return;}if(/(open|go to|show).*(game|nought|tic tac toe)/.test(t)||/play (a )?game|noughts and crosses|tic tac toe/.test(t)){go("games");reply("Let's play noughts and crosses. You're X. Tap a square to make your move.");return;}if(/(open|go to|show).*(music|song|player)/.test(t)||/play (some )?music|play (orange horizon|sunny side up|galaxy drift)/.test(t)){go("music");if(t.includes("sunny"))selectTrack("upbeat");else if(t.includes("galaxy"))selectTrack("space");else if(t.includes("orange"))selectTrack("focus");startMusic();reply("Music time! I've opened the music player. Your soundscape is ready.");return;}if(/(pause|stop) music/.test(t)){stopMusic();reply("Music paused.");return;}if(/(next|skip) (track|song)/.test(t)){cycleTrack(1);reply("Here's the next soundscape.");return;}if(/(voice|change how you sound|voice settings)/.test(t)){go("voice");reply("Let's choose how I sound. Open the voice list to pick a Cartesia voice.");return;}if(/(settings|wake word|microphone)/.test(t)){go("settings");reply("I've opened your settings.");return;}if(/(volume up|louder)/.test(t)){state.assistantVolume=Math.min(100,state.assistantVolume+10);$("#assistantVolume").value=state.assistantVolume;syncSettings();reply("I've turned my speaking volume up.");return;}if(/(volume down|quieter)/.test(t)){state.assistantVolume=Math.max(0,state.assistantVolume-10);$("#assistantVolume").value=state.assistantVolume;syncSettings();reply("I've turned my speaking volume down.");return;}if(/(new game|restart game)/.test(t)){go("games");resetGame();reply("A fresh board! You're X. Your move.");return;}const move=t.match(/(?:move|put|place) (?:an? )?([1-9])|square ([1-9])/);if(move){const n=Number(move[1]||move[2])-1;if(state.page==="games"&&playMove(n)){reply("Move made.");}else reply("I couldn't make that move. Open games and choose an empty square.");return;}reply("I'm still learning that one. Try asking me to open games, play music, tell you the time, or open settings.");}
function submitCommand(){const input=$("#commandInput"),v=input.value;input.value="";handleCommand(v);}$("#sendCommand").onclick=submitCommand;$("#commandInput").addEventListener("keydown",e=>{if(e.key==="Enter")submitCommand();});$$("[data-command]").forEach(b=>b.addEventListener("click",()=>handleCommand(b.dataset.command)));
function speechRecognition(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR)return null;
  const rec=new SR();
  rec.lang="en-GB";
  rec.continuous=true;
  rec.interimResults=false;
  rec.maxAlternatives=5;
  rec.onresult=e=>{
    if(!state.listening)return;
    // Join all final result segments: browsers can split "Hey" and "Rohan" into separate results.
    const heard=Array.from(e.results)
      .filter(result=>result.isFinal)
      .map(result=>result[0]?.transcript||"")
      .join(" ")
      .trim();
    if(!heard)return;
    if(state.wake){
      const normalised=heard.toLowerCase().replace(/[’']/g,"").replace(/\\s+/g," ").trim();
      const match=normalised.match(/\\b(?:(?:hey|okay|ok)\\s+)?(?:rohan|rowan)\\b[,.! ]*(.*)$/i);
      if(match){
        const command=(match[1]||"").trim();
        state.listening=false;
        clearTimeout(state.restartTimer);
        try{rec.stop();}catch{}
        $("#listenButton").classList.remove("listening");
        $("#listenLabel").textContent="START TALKING";
        $("#orbHeading").textContent="Yes, Rohan?";
        $("#orbSubtitle").textContent=command?"I'm listening to your request.":"What can I do for you?";
        if(command)handleCommand(command);
        else reply("Yes, Rohan? I'm listening.");
      }
    }else{
      stopRecognition();
      handleCommand(heard);
    }
  };
  rec.onerror=e=>{
    if(e.error==="not-allowed"||e.error==="service-not-allowed"){
      state.listening=false;state.wake=false;
      $("#orbSubtitle").textContent="Microphone access is blocked. Allow Microphone for this site in Chrome, then switch on Hey Rowan again.";
      $("#listenButton").classList.remove("listening");$("#listenLabel").textContent="START TALKING";
      $("#wakeToggle").checked=false;
      setMood("","MICROPHONE PERMISSION NEEDED");
      $("#voiceScreenTitle").textContent="Microphone permission needed";
      $("#voiceScreenText").textContent="Select the site icon beside the address bar, allow Microphone, then switch on Hey Rowan again.";
    }else if(e.error==="network"){
      $("#orbSubtitle").textContent="The browser speech service lost its connection. Check your internet connection; Rohan AI will keep trying to listen.";
    }else if(e.error!=="no-speech"&&e.error!=="aborted"){
      $("#orbSubtitle").textContent="Microphone issue: "+e.error+". Try switching Hey Rowan off and on again.";
    }
  };
  rec.onend=()=>{
    if(state.listening&&state.wake){
      clearTimeout(state.restartTimer);
      state.restartTimer=setTimeout(()=>{
        if(!state.listening||!state.wake)return;
        try{rec.start();}
        catch(error){
          // A short delay avoids the browser's start/stop transition race.
          if(error.name==="InvalidStateError"){
            clearTimeout(state.restartTimer);
            state.restartTimer=setTimeout(()=>{
              if(state.listening&&state.wake){try{rec.start();}catch{}}
            },1200);
          }else{
            $("#orbSubtitle").textContent="Wake-word listening stopped: "+error.message+". Switch Hey Rowan off and on to retry.";
          }
        }
      },900);
    }else if(state.listening){
      state.listening=false;
      $("#listenButton").classList.remove("listening");$("#listenLabel").textContent="START TALKING";
      setMood("","READY WHEN YOU ARE");
      $("#voiceScreenTitle").textContent="I didn't catch that";
      $("#voiceScreenText").textContent="Press Start Talking and try speaking a little closer to your microphone.";
    }
  };
  return rec;
}
async function startRecognition(wake=false){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    $("#orbSubtitle").textContent="Live speech recognition is not available in this browser. Open Rohan AI in the latest Chrome or Edge, or use the message box.";
    $("#voiceScreenTitle").textContent="Speech recognition unavailable";
    $("#voiceScreenText").textContent="Use Chrome or Edge for microphone voice activation. Text commands remain available.";
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia){
    $("#orbSubtitle").textContent="Microphone access needs a secure HTTPS connection. Open the HTTPS version of Rohan AI.";
    return;
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    stream.getTracks().forEach(track=>track.stop());
  }catch(error){
    const msg=error.name==="NotAllowedError"?"Microphone permission was denied. Allow it using the site icon beside the address bar.":"The microphone could not be opened: "+error.message;
    $("#orbSubtitle").textContent=msg;$("#voiceScreenTitle").textContent="Microphone unavailable";$("#voiceScreenText").textContent=msg;
    return;
  }
  if(!state.recognition)state.recognition=speechRecognition();
  state.wake=wake;state.recognition.continuous=wake;state.listening=true;
  $("#listenLabel").textContent=wake?"LISTENING FOR HEY ROWAN":"LISTENING…";
  $("#listenButton").classList.add("listening");
  setMood("listening",wake?"ALWAYS LISTENING FOR HEY ROWAN":"I'M LISTENING");
  $("#orbSubtitle").textContent=wake?"Say “Hey Rowan” followed by your request.":"Go ahead — I'm listening.";
  try{state.recognition.start();}
  catch(error){
    state.listening=false;$("#listenButton").classList.remove("listening");$("#listenLabel").textContent="START TALKING";
    if(error.name!=="InvalidStateError"){$("#orbSubtitle").textContent="Could not start speech recognition: "+error.message;setMood("","MICROPHONE START FAILED");}
  }
}
function stopRecognition(){state.listening=false;state.wake=false;clearTimeout(state.restartTimer);if(state.recognition){try{state.recognition.stop();}catch{}}$("#listenButton").classList.remove("listening");$("#listenLabel").textContent="START TALKING";setMood("","READY WHEN YOU ARE");}
$("#listenButton").onclick=()=>{if(state.listening){stopRecognition();$("#voiceScreenTitle").textContent="Listening stopped";$("#voiceScreenText").textContent="Press Start Talking whenever you are ready.";return;}startRecognition(false);};
function syncSettings(){$("#wakeToggle").checked=state.wake;$("#speakToggle").checked=state.speak;$("#assistantVolume").value=state.assistantVolume;$("#assistantVolumeValue").textContent=state.assistantVolume+"%";$("#themeToggle").checked=!document.body.classList.contains("no-glow");}
$("#wakeToggle").onchange=e=>{if(e.target.checked){startRecognition(true);}else{stopRecognition();$("#orbSubtitle").textContent="Wake word mode is off.";}};
$("#speakToggle").onchange=e=>{state.speak=e.target.checked;localStorage.setItem("rohanSpeak",state.speak);};
$("#themeToggle").onchange=e=>document.body.classList.toggle("no-glow",!e.target.checked);
$("#assistantVolume").oninput=e=>{state.assistantVolume=Number(e.target.value);$("#assistantVolumeValue").textContent=state.assistantVolume+"%";if(state.audio)state.audio.volume=state.assistantVolume/100;localStorage.setItem("rohanVolume",state.assistantVolume);};
$("#testMic").onclick=()=>startRecognition(false);
$("#speechSpeed").value=state.speed;$("#speechSpeed").oninput=e=>{state.speed=Number(e.target.value);$("#speedValue").textContent=state.speed.toFixed(1)+"×";localStorage.setItem("rohanSpeed",state.speed);};
async function loadStatus(){
  try{
    const r=await fetch("/api/status",{cache:"no-store"}),d=await r.json();
    const ready=d.speechConfigured&&d.keyFormatValid;
    $("#statusDot").classList.toggle("online",ready);
    $("#connectionText").textContent=ready?"Cartesia key detected":d.speechConfigured?"Cartesia key needs replacing":"Cartesia key needed";
    $("#keyStatus").textContent=ready?"Key format detected":d.speechConfigured?"Replace key in Render":"Not configured";
    if(!ready){
      $("#voiceNote").textContent=d.speechConfigured?"Render has a key, but it does not look like a current Cartesia API key. Replace CARTESIA_API_KEY with a key beginning sk_car_.":"Add CARTESIA_API_KEY to the Render service environment.";
      $("#voiceScreenTitle").textContent="Cartesia voice is not connected";
      $("#voiceScreenText").textContent="The microphone can listen, but spoken replies need a valid Cartesia API key on the server.";
    }
  }catch{$("#connectionText").textContent="Server unavailable";$("#keyStatus").textContent="Server unavailable";}
}
async function loadVoices(){
  const list=$("#voiceList");list.innerHTML='<div class="loading-line">Connecting to Cartesia…</div>';
  $("#voiceNote").textContent="Loading your single Cartesia voice…";
  try{
    const r=await fetch("/api/voices",{cache:"no-store"}),d=await r.json();
    if(!r.ok)throw new Error(d.error||"Cartesia voice service is unavailable");
    const voice=d.voice;
    if(!voice||!voice.id)throw new Error("Cartesia did not return a voice. Check your API key and account.");
    state.voices=[voice];state.voiceId=voice.id;localStorage.setItem("rohanVoiceId",voice.id);renderVoices();
    $("#voiceNote").textContent="One Cartesia voice is selected for every spoken reply.";
  }catch(e){
    state.voices=[];state.voiceId="";localStorage.removeItem("rohanVoiceId");list.innerHTML="";
    const p=document.createElement("div");p.className="loading-line";p.textContent="Could not load the Cartesia voice: "+e.message;list.append(p);
    $("#voiceNote").textContent=e.message.includes("401")?"Cartesia rejected the server API key. In Render, replace CARTESIA_API_KEY with a fresh key beginning sk_car_, save, and redeploy. No browser voice fallback is enabled.":"Cartesia must connect before spoken replies can work. No browser voice fallback is enabled.";
    $("#voiceScreenTitle").textContent="Cartesia voice connection failed";
    $("#voiceScreenText").textContent=$("#voiceNote").textContent;
  }
}
function renderVoices(){
  const list=$("#voiceList");list.innerHTML="";
  state.voices.slice(0,1).forEach(v=>{
    const item=document.createElement("div");item.className="voice-option selected";
    const radio=document.createElement("span");radio.className="voice-radio";
    const details=document.createElement("span");const name=document.createElement("strong");name.textContent=v.name||"Rohan's Cartesia voice";
    const desc=document.createElement("small");desc.textContent="Cartesia · Sonic 3.6 · English";
    details.append(name,desc);item.append(radio,details);list.append(item);
  });
}
$("#refreshVoices").onclick=loadVoices;$("#previewVoice").onclick=()=>{if(!state.voiceId){$("#voiceNote").textContent="Wait for the Cartesia voice to load first.";return;}speak("Hello Rohan. This is how I sound. What would you like to do today?");};
const winning=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function renderBoard(){const board=$("#board");board.innerHTML="";state.board.forEach((v,i)=>{const b=document.createElement("button");b.className="cell "+(v==="O"?"o":"");b.textContent=v;b.disabled=!!v||state.gameOver;b.setAttribute("aria-label","Square "+(i+1)+(v?", "+v:""));b.onclick=()=>playMove(i);board.append(b);});$("#scoreLine").innerHTML="You "+state.scores.you+" <b>·</b> AI "+state.scores.ai+" <b>·</b> Draws "+state.scores.draw;}
function winner(board,mark){return winning.some(line=>line.every(i=>board[i]===mark));}
function playMove(i){if(state.gameOver||state.board[i])return false;state.board[i]="X";if(winner(state.board,"X")){finishGame("you");return true;}if(state.board.every(Boolean)){finishGame("draw");return true;}const move=bestMove(state.board);if(move!==-1)state.board[move]="O";if(winner(state.board,"O"))finishGame("ai");else if(state.board.every(Boolean))finishGame("draw");renderBoard();return true;}
function bestMove(b){let best=-Infinity,choice=-1;for(let i=0;i<9;i++){if(b[i])continue;b[i]="O";let score=minimax(b,0,false);b[i]="";if(score>best){best=score;choice=i;}}return choice;}
function minimax(b,depth,isMax){if(winner(b,"O"))return 10-depth;if(winner(b,"X"))return depth-10;if(b.every(Boolean))return 0;if(isMax){let v=-Infinity;for(let i=0;i<9;i++)if(!b[i]){b[i]="O";v=Math.max(v,minimax(b,depth+1,false));b[i]="";}return v;}let v=Infinity;for(let i=0;i<9;i++)if(!b[i]){b[i]="X";v=Math.min(v,minimax(b,depth+1,true));b[i]="";}return v;}
function finishGame(result){state.gameOver=true;state.scores[result]++;const messages={you:"You won! Brilliant move, Rohan!",ai:"I won this round! Fancy another?",draw:"It's a draw! Good game."};$("#gameStatus").textContent=messages[result];renderBoard();}
function resetGame(){state.board=Array(9).fill("");state.gameOver=false;$("#gameStatus").textContent="Your turn — X";renderBoard();}$("#resetGame").onclick=resetGame;renderBoard();
function selectTrack(id){state.track="library";$(".track-card").forEach(b=>b.classList.toggle("selected",b.dataset.track==="library"));$("#nowPlaying").textContent="Your music";$("#trackDescription").textContent="Your MP3 from Rohan AI";$("#playerArt").textContent="graphic_eq";$("#playerArt").className="player-art material-symbols-rounded art-library";}
$(".track-card").forEach(b=>b.onclick=()=>{selectTrack("library");if(!state.musicOn)startMusic();});
function cycleTrack(){if(state.musicAudio){state.musicAudio.currentTime=0;}else{startMusic();}}
function startMusic(){
 const track=tracks[0];
 if(!state.musicAudio){state.musicAudio=new Audio(track.src);state.musicAudio.preload="auto";state.musicAudio.addEventListener("loadedmetadata",()=>$("#duration").textContent=formatMusicTime(state.musicAudio.duration));state.musicAudio.addEventListener("ended",()=>{state.musicOn=false;$("#playMusic").innerHTML='<span class="material-symbols-rounded">play_arrow</span>';});state.musicAudio.addEventListener("error",()=>{$("#trackDescription").textContent="The MP3 could not be loaded. Check the music link.";state.musicOn=false;});}
 state.musicAudio.loop=true;state.musicAudio.volume=Number($("#musicVolume").value)/100;
 state.musicAudio.play().then(()=>{state.musicOn=true;$("#playMusic").innerHTML='<span class="material-symbols-rounded">pause</span>';progressMusic();}).catch(()=>{$("#trackDescription").textContent="Tap play again to start the music.";state.musicOn=false;});
}
function progressMusic(){if(!state.musicOn)return;if(state.track==="library"&&state.musicAudio){const current=state.musicAudio.currentTime||0,duration=state.musicAudio.duration||0;$("#elapsed").textContent=formatMusicTime(current);$("#duration").textContent=duration?formatMusicTime(duration):"--:--";$("#musicProgress").style.width=(duration?current/duration*100:0)+"%";}else{const elapsed=(Date.now()-state.musicStarted)/1000;$("#elapsed").textContent="00:"+String(Math.floor(elapsed)%60).padStart(2,"0");$("#musicProgress").style.width=((elapsed%60)/60*100)+"%";}state.progressTimer=requestAnimationFrame(progressMusic);}function formatMusicTime(seconds){return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(Math.floor(seconds%60)).padStart(2,"0");}
function stopMusic(){state.musicOn=false;if(state.musicAudio)state.musicAudio.pause();if(state.progressTimer)cancelAnimationFrame(state.progressTimer);$("#playMusic").innerHTML='<span class="material-symbols-rounded">play_arrow</span>';}
$("#playMusic").onclick=()=>{if(state.musicOn){stopMusic();}else{startMusic();}};
$("#musicVolume").oninput=e=>{if(state.musicAudio)state.musicAudio.volume=Number(e.target.value)/100;};
function updateClock(){$("#clock").textContent=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});const h=new Date().getHours();$("#dateLabel").textContent=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}).toUpperCase();if(state.page==="home")$("#pageTitle").textContent=h<12?"Good morning, Rohan":h<18?"Good afternoon, Rohan":"Good evening, Rohan";}
setInterval(updateClock,15000);updateClock();loadStatus();loadVoices();syncSettings();