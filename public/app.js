const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = { page:"home", voiceId:localStorage.getItem("rohanVoiceId")||"", voices:[], speed:Number(localStorage.getItem("rohanSpeed")||1), speak:localStorage.getItem("rohanSpeak")!=="false", wake:false, recognition:null, listening:false, recognitionRunning:false, recognitionStarting:false, restartTimer:null, restartDelay:700, wakeBuffer:"", wakeBufferAt:0, speaking:false, audio:null, musicAudio:null, musicOn:false, track:"library", audioCtx:null, musicNodes:[], musicStarted:0, scores:{you:0,ai:0,draw:0}, board:Array(9).fill(""), gameOver:false, assistantVolume:Number(localStorage.getItem("rohanVolume")||85), quiz:{active:false,phase:"",topic:"",index:0,score:0,questions:[]} };
const tracks=[
 {id:"library",name:"Your music",desc:"Your Rohan AI MP3",src:"https://home.rohansweb.co.uk/ROHANAI/untitled-video-8_otfFPTjE.mp3",art:"graphic_eq"},
 {id:"soundhelix1",name:"SoundHelix One",desc:"Sample track from SoundHelix",src:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",art:"headphones"},
 {id:"soundhelix2",name:"SoundHelix Two",desc:"Sample track from SoundHelix",src:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",art:"music_note"},
 {id:"soundhelix3",name:"SoundHelix Three",desc:"Sample track from SoundHelix",src:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",art:"graphic_eq"}
];
function go(page){state.page=page;$$(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));$$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));const titles={home:"Good morning, Rohan",games:"Let's play a game",quiz:"Audio quiz",music:"Your music space",voice:"Voice studio",settings:"Settings"};$("#pageTitle").textContent=titles[page]||"Rohan AI";if(page==="voice"&&!state.voices.length)loadVoices();if(page==="games")renderBoard();if(page==="settings")syncSettings();window.scrollTo({top:0,behavior:"smooth"});}
$$("[data-page]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
$("#quickSettings").onclick=()=>go("settings");
$("#tellStoryButton").onclick=()=>tellStory();
function addMessage(text,who="assistant"){const row=document.createElement("div");row.className="message "+(who==="user"?"user-message":"assistant-message");if(who==="assistant"){const a=document.createElement("span");a.className="message-avatar";a.textContent="R";row.append(a);}const p=document.createElement("p");p.textContent=text;row.append(p);$("#conversation").append(row);$("#conversation").scrollTop=$("#conversation").scrollHeight;}
function setMood(mood,label){
  $("#orbWrap").classList.remove("listening","speaking");
  if(mood)$("#orbWrap").classList.add(mood);
  $("#assistantState").textContent=label;
  const title=$("#voiceScreenTitle"), detail=$("#voiceScreenText"), panel=$("#voiceScreen");
  if(title&&detail&&panel){
    panel.classList.toggle("is-active",mood==="listening"||mood==="speaking");
    if(mood==="listening"){title.textContent="I'm listening";detail.textContent="Speak naturally. You do not need to say Rohan first.";}
    else if(mood==="speaking"){title.textContent="Rohan AI is speaking";detail.textContent="Playing your reply with Cartesia voice.";}
    else if(label.includes("UNAVAILABLE")||label.includes("NOT READY")){title.textContent="Voice needs attention";detail.textContent=$("#voiceNote")?.textContent||"Check the Cartesia connection.";}
    else {title.textContent="Your assistant is ready";detail.textContent="Press the large button to allow microphone access and speak.";}
  }
}
function resumeWakeListening(){if(!state.wake||state.listening||!state.recognition)return;try{state.recognition.start();state.listening=true;$("#listenLabel").textContent="LISTENING — SPEAK NOW";$("#listenButton").classList.add("listening");setMood("listening","ALWAYS LISTENING FOR HEY ROWAN");}catch(error){if(error.name==="InvalidStateError"){state.listening=true;return;}state.listening=false;clearTimeout(state.restartTimer);state.restartTimer=setTimeout(()=>{if(state.wake)resumeWakeListening();},1400);}}
async function speak(text){
  if(!state.speak)return;
  const finish=()=>{state.speaking=false;setMood("","READY WHEN YOU ARE");};
  if(!state.voiceId){$("#voiceNote").textContent="Cartesia voice is not connected. Replace the API key in Render, redeploy, then refresh this page.";setMood("","CARTESIA VOICE NOT READY");$("#voiceScreenTitle").textContent="Cartesia voice is not connected";$("#voiceScreenText").textContent=$("#voiceNote").textContent;finish();return;}
  try{
    const speechText=text.replace(/\bRohan\b/gi,"Rowan");
    const response=await fetch("/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:speechText,voiceId:state.voiceId,speed:state.speed})});
    if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||"Cartesia speech failed");
    const blob=await response.blob();if(!blob.size)throw new Error("Cartesia returned empty audio");
    if(state.audio){state.audio.pause();if(state.audio.src.startsWith("blob:"))URL.revokeObjectURL(state.audio.src);}
    const url=URL.createObjectURL(blob),audio=new Audio(url);state.audio=audio;audio.volume=state.assistantVolume/100;state.speaking=true;
    const ended=new Promise(resolve=>{audio.addEventListener("ended",resolve,{once:true});audio.addEventListener("error",resolve,{once:true});});
    audio.onended=()=>{URL.revokeObjectURL(url);finish();};
    audio.onerror=()=>{URL.revokeObjectURL(url);$("#voiceNote").textContent="Cartesia audio could not be played. Try Preview voice again.";finish();};
    setMood("speaking","ROHAN IS SPEAKING");await audio.play();await ended;
  }catch(e){$("#voiceNote").textContent="Cartesia speech error: "+e.message;setMood("","CARTESIA SPEECH UNAVAILABLE");finish();}
}
function reply(text){addMessage(text);$("#orbHeading").textContent="I'm on it.";$("#orbSubtitle").textContent=text.length>65?text.slice(0,65)+"…":text;return speak(text);}
function cancelSpeech(mode="stop"){
  if(!state.audio)return;
  state.audio.pause();
  if(mode==="stop"){try{state.audio.currentTime=0;}catch{}}
  state.speaking=false;
  setMood("","READY WHEN YOU ARE");
}
function tellStory(){
  const story="Once upon a time, in a little village beside a sparkling blue river, lived a young fox called Rowan. Rowan was curious and loved helping others. One sunny morning, he found a tiny bird sitting beneath an old oak tree. The bird had lost its way home. Rowan listened carefully, then followed the bird's clues: past the flower meadow, over the little wooden bridge, and around the hill covered in purple heather. At the top, they heard a happy chorus of birds. The tiny bird's family was waiting in their nest. They chirped with joy and thanked Rowan for being kind. As the sun set, Rowan walked home feeling warm and proud. He had learned that even a small act of kindness can make a very big difference. And from that day on, whenever someone needed help, Rowan was ready for an adventure. The end.";
  reply(story);
}

const quizBank={
 science:[
  {q:"What force pulls objects towards the Earth?",c:["Magnetism","Gravity","Friction"],a:"B"},
  {q:"What gas do humans need to breathe to stay alive?",c:["Oxygen","Carbon dioxide","Hydrogen"],a:"A"},
  {q:"What is the process called when liquid water turns into a gas?",c:["Condensation","Freezing","Evaporation"],a:"C"},
  {q:"Which part of a plant takes in water from the soil?",c:["Flowers","Roots","Leaves"],a:"B"}
 ],
 space:[
  {q:"Which star is at the centre of our solar system?",c:["The Sun","Sirius","The North Star"],a:"A"},
  {q:"Which planet is known as the Red Planet?",c:["Venus","Jupiter","Mars"],a:"C"},
  {q:"What do we call a rock from space that lands on Earth?",c:["A comet","A meteorite","An asteroid"],a:"B"},
  {q:"What force keeps planets in orbit around the Sun?",c:["Gravity","Friction","Magnetism"],a:"A"}
 ],
 animals:[
  {q:"What is the largest animal on Earth?",c:["African elephant","Giraffe","Blue whale"],a:"C"},
  {q:"What do caterpillars turn into?",c:["Butterflies or moths","Spiders","Beetles"],a:"A"},
  {q:"What is a baby frog called?",c:["A cub","A tadpole","A chick"],a:"B"},
  {q:"Which mammal can fly?",c:["Bat","Dolphin","Squirrel"],a:"A"}
 ],
 nature:[
  {q:"What do bees collect from flowers to make honey?",c:["Pollen only","Leaves","Nectar"],a:"C"},
  {q:"What is the name for a baby tree growing from a seed?",c:["Seedling","Sapling's leaf","Rootlet"],a:"A"},
  {q:"Which part of a tree carries water from its roots to its leaves?",c:["Bark","Xylem","Fruit"],a:"B"},
  {q:"What do we call animals that are active at night?",c:["Diurnal","Aquatic","Nocturnal"],a:"C"}
 ],
 computing:[
  {q:"What does CPU stand for?",c:["Computer Power Utility","Central Processing Unit","Central Program Upload"],a:"B"},
  {q:"What is the name for the physical parts of a computer?",c:["Hardware","Software","Data"],a:"A"},
  {q:"What do we call instructions written for a computer to follow?",c:["A monitor","A browser","Code"],a:"C"},
  {q:"Which two digits are used in binary?",c:["One and two","Zero and one","Two and three"],a:"B"}
 ],
 maths:[
  {q:"What is seven times eight?",c:["Fifty-four","Sixty-four","Fifty-six"],a:"C"},
  {q:"How many sides does a hexagon have?",c:["Six","Eight","Five"],a:"A"},
  {q:"What is one quarter of one hundred?",c:["Twenty","Twenty-five","Fifty"],a:"B"},
  {q:"What is the name of a triangle with three equal sides?",c:["Isosceles","Scalene","Equilateral"],a:"C"}
 ],
 history:[
  {q:"Which ancient civilisation built the pyramids at Giza?",c:["Ancient Romans","Ancient Egyptians","Ancient Greeks"],a:"B"},
  {q:"What was the name of the ship that carried the Pilgrims to America in 1620?",c:["Mayflower","Titanic","Endeavour"],a:"A"},
  {q:"Which wall came down in 1989, symbolising the end of the Cold War?",c:["The Great Wall","Hadrian's Wall","The Berlin Wall"],a:"C"},
  {q:"Who was the first person to walk on the Moon?",c:["Buzz Aldrin","Neil Armstrong","Yuri Gagarin"],a:"B"}
 ],
 geography:[
  {q:"What is the capital city of France?",c:["Paris","Rome","Madrid"],a:"A"},
  {q:"Which is the largest ocean on Earth?",c:["Atlantic Ocean","Indian Ocean","Pacific Ocean"],a:"C"},
  {q:"What is the imaginary line around the middle of Earth called?",c:["Prime Meridian","Equator","Tropic of Cancer"],a:"B"},
  {q:"Which continent is the Sahara Desert in?",c:["Africa","Asia","South America"],a:"A"}
 ]
};
const quizTopics=["science","space","animals","nature","computing","maths","history","geography"];
function cleanQuizAnswer(v){return v.toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
function startAudioQuiz(){state.quiz={active:true,phase:"topic",topic:"",index:0,score:0,questions:[]};$("#quizHeading").textContent="I'm listening for a topic";$("#quizPrompt").textContent="Say “options” to hear the topics, or say a topic name now.";$("#quizProgress").textContent="Waiting for your topic";$("#quizScore").textContent="Score: 0";$("#quizHint").textContent="Listening starts now. Say “options” or a topic such as Space or Science.";$("#startAudioQuiz").textContent="Listening for topic…";startRecognition(false);}
function stopAudioQuiz(){state.quiz.active=false;state.quiz.phase="";stopRecognition();$("#quizHeading").textContent="Quiz ended";$("#quizPrompt").textContent="Your quiz has been stopped. Press Start audio quiz to try again." ;$("#quizProgress").textContent="Stopped";$("#quizHint").textContent="Press Start audio quiz whenever you are ready." ;$("#startAudioQuiz").textContent="Start audio quiz";}
$("#startAudioQuiz").addEventListener("click",()=>{if(state.quiz.active){stopRecognition();startRecognition(false);}else startAudioQuiz();});
$("#stopAudioQuiz").addEventListener("click",stopAudioQuiz);
async function quizListenAgain(){
 if(!state.quiz.active)return;
 $("#startAudioQuiz").textContent="Preparing microphone…";
 // SpeechRecognition must fully finish its previous one-shot session before it can be started again.
 if(state.recognitionRunning||state.recognitionStarting){
  try{state.recognition?.stop();}catch{}
  const waitForEnd=()=>new Promise(resolve=>{
   let done=false;
   const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();};
   const timer=setTimeout(finish,1200);
   if(state.recognition){
    const previous=state.recognition.onend;
    state.recognition.onend=event=>{try{previous?.call(state.recognition,event);}finally{finish();}};
   }else finish();
  });
  await waitForEnd();
 }
 if(!state.quiz.active)return;
 $("#startAudioQuiz").textContent="Listening for your answer…";
 await startRecognition(false);
 if(state.quiz.active&&!state.listening){
  $("#quizHint").textContent="Microphone stopped. Press Start audio quiz to try again, and allow microphone access if asked.";
 }
}
async function askQuizQuestion(){
 const q=state.quiz.questions[state.quiz.index];
 if(!q){await finishAudioQuiz();return;}
 state.quiz.phase="answer";
 const options=q.c.map((choice,i)=>String.fromCharCode(65+i)+". "+choice);
 $("#quizHeading").textContent=state.quiz.topic[0].toUpperCase()+state.quiz.topic.slice(1)+" quiz";
 $("#quizPrompt").textContent=q.q+"\n\n"+options.join("\n");
 $("#quizProgress").textContent="Question "+(state.quiz.index+1)+" of "+state.quiz.questions.length;
 $("#quizScore").textContent="Score: "+state.quiz.score;
 $("#quizHint").textContent="Say A, B or C to answer.";
 await speak("Question "+(state.quiz.index+1)+". "+q.q+". Option A: "+q.c[0]+". Option B: "+q.c[1]+". Option C: "+q.c[2]+". Say A, B or C.");
 quizListenAgain();
}
async function handleQuizUtterance(heard){
 if(!state.quiz.active)return;
 const answer=cleanQuizAnswer(heard);
 if(state.quiz.phase==="topic"&&/\b(options|option|topics|choices)\b/.test(answer)){
  $("#quizHeading").textContent="Choose your topic";
  $("#quizPrompt").textContent="Say one of the topics: Science, Space, Animals, Nature, Computing, Maths, History or Geography.";
  $("#quizHint").textContent="I'm listening for the topic name.";
  await speak("Here are your options. Science, Space, Animals, Nature, Computing, Maths, History, or Geography. Say the topic you want.");
  quizListenAgain();return;
 }
 if(state.quiz.phase==="topic"){
  const topic=quizTopics.find(t=>new RegExp("\\\\b"+t+"\\\\b").test(answer)||(t==="maths"&&/\\bmath\\b/.test(answer))||(t==="animals"&&/\\b(animal|wildlife)\\b/.test(answer))||(t==="computing"&&/\\b(computer|technology|coding)\\b/.test(answer)));
  if(!topic){await speak("I didn't catch a topic. Say options to hear the list, or say Science, Space, Animals, Nature, Computing, Maths, History, or Geography.");quizListenAgain();return;}
  state.quiz.topic=topic;state.quiz.questions=quizBank[topic];state.quiz.index=0;state.quiz.score=0;
  $("#quizHint").textContent="Topic selected: "+topic+". Get ready!";
  await speak("Great choice. Let's do the "+topic+" quiz. There are four multiple-choice questions. Answer each one by saying A, B or C.");
  await askQuizQuestion();return;
 }
 if(state.quiz.phase==="answer"){
  const letterMatch=answer.match(/(?:^|\s)([abc])(?:$|\s)/);
  const wordMatch=answer.match(/\b(ay|a|bee|be|b|see|sea|c)\b/);
  const spoken=letterMatch?letterMatch[1]:(wordMatch?({ay:"a",bee:"b",be:"b",see:"c",sea:"c"}[wordMatch[1]]||wordMatch[1]):"");
  if(!["a","b","c"].includes(spoken)){
   $("#quizHint").textContent="I didn't catch that. Please say A, B or C.";
   await speak("Please answer by saying A, B or C.");
   quizListenAgain();return;
  }
  const q=state.quiz.questions[state.quiz.index],selected=spoken.toUpperCase(),correct=selected===q.a;
  if(correct)state.quiz.score++;
  $("#quizHint").textContent=correct?"Correct!":"The correct answer was "+q.a+". "+q.c[q.a.charCodeAt(0)-65]+".";
  $("#quizScore").textContent="Score: "+state.quiz.score;
  state.quiz.index++;
  const feedback=correct?"That's correct!": "Not quite. The correct answer was "+q.a+". "+q.c[q.a.charCodeAt(0)-65]+".";
  if(state.quiz.index>=state.quiz.questions.length){await speak(feedback);await finishAudioQuiz();}
  else{await speak(feedback);await askQuizQuestion();}
 }
}
async function finishAudioQuiz(){
 const score=state.quiz.score,total=state.quiz.questions.length,topic=state.quiz.topic;
 state.quiz.active=false;state.quiz.phase="";
 $("#quizHeading").textContent="Quiz complete!";
 $("#quizPrompt").textContent="You scored "+score+" out of "+total+" in "+topic+".";
 $("#quizProgress").textContent="Finished";
 $("#quizScore").textContent="Score: "+score+" / "+total;
 $("#quizHint").textContent="Choose Start audio quiz to play again.";
 $("#startAudioQuiz").textContent="Play again";
 await speak("Quiz complete! You scored "+score+" out of "+total+". Well done!");
}
function handleCommand(raw){
  const text=raw.trim();if(!text)return;
  const t=text.toLowerCase().replace(/[.!?]/g,"").trim();
  addMessage(text,"user");
  if(state.speaking){
    if(/\b(stop|pause) music\b/.test(t)){
      stopMusic();cancelSpeech(t.includes("stop")?"stop":"pause");addMessage("Music and speech paused.");return;
    }
    if(/^(pause|wait|hold on)( please)?$|^(stop|quiet|be quiet)( speaking| talking| the story)?$|\b(stop|pause) (speaking|talking|the story|story)\b/.test(t)){
      cancelSpeech(t.startsWith("stop")||t.includes("stop ")?"stop":"pause");
      addMessage(t.startsWith("stop")?"Okay, I've stopped speaking.":"Okay, I've paused. Say resume when you're ready.");
      return;
    }
    return;
  }
  if(/^(stop|pause)( music)?$|^(stop|pause) the music$/.test(t)){
    stopMusic();
    if(state.audio)cancelSpeech(t.startsWith("stop")?"stop":"pause");
    addMessage("Music paused.");
    return;
  }
  if(/^(stop|pause)( speaking| talking| the story| story)$/.test(t)){
    cancelSpeech(t.startsWith("stop")?"stop":"pause");
    addMessage(t.startsWith("stop")?"Okay, I've stopped.":"Okay, I've paused.");
    return;
  }
  if(/^(stop|turn off|disable) (listening|the microphone|microphone)$/.test(t)){
    stopRecognition();addMessage("I've turned listening off. Press Start Listening when you want me again.");return;
  }
  if(/^(resume|continue)( speaking| the story| story)?$/.test(t)){
    if(state.audio){state.audio.play().then(()=>{state.speaking=true;setMood("speaking","ROHAN IS SPEAKING");}).catch(()=>{});return;}
    startMusic();return;
  }
  if(/(tell me|tell a|read me|make up|start|want) (a )?(short )?(bedtime |children's |kids' |young )?(story|tale)|\bstory time\b|\bfairy tale\b|\btell (me )?(a )?(kids|children's|young) story\b/.test(t)||t==="story"){
    tellStory();return;
  }
  if(/^(hello|hi|rohan|good morning|good afternoon|good evening)$/.test(t)){reply("Hello, Rohan. What would you like to do?");return;}
  if(/(what can you do|help|commands)/.test(t)){reply("I can open games, play music, tell you the time and date, change settings, and tell you a story. Try saying tell me a story, open games, play music, or what time is it.");return;}
  if(/(tell me the time|what(?:'s| is) the time|what time is it|time is it|current time|time please)/.test(t)){reply("It's "+new Date().toLocaleTimeString("en-GB",{hour:"numeric",minute:"2-digit"})+".");return;}
  if(/(what day|date is it|today's date)/.test(t)){reply("Today is "+new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})+".");return;}
  if(/(open|go to|show).*(game|nought|tic tac toe)/.test(t)||/play (a )?game|noughts and crosses|tic tac toe/.test(t)){go("games");reply("Let's play noughts and crosses. You're X. Tap a square to make your move.");return;}
  const musicCommand=t.replace(/^(?:prism|rohan|rowan)[, ]+/,"").trim();
  if(/(open|go to|show).*(music|song|player)/.test(musicCommand)||/\bplay\s+(?:(?:some|me|my)\s+)?music\b/.test(musicCommand)||/play (orange horizon|sunny side up|galaxy drift)/.test(musicCommand)){go("music");if(musicCommand.includes("sunny"))selectTrack("soundhelix2");else if(musicCommand.includes("galaxy"))selectTrack("soundhelix3");else if(musicCommand.includes("orange"))selectTrack("soundhelix1");startMusic();reply("Of course. I'm playing music now.");return;}
  if(/(pause|stop) music/.test(t)){stopMusic();reply("Music paused.");return;}
  if(/(next|skip) (track|song)/.test(t)){cycleTrack(1);reply("Here's the next soundscape.");return;}
  if(/(voice|change how you sound|voice settings)/.test(t)){go("voice");reply("Let's choose how I sound. Open the voice list to pick a Cartesia voice.");return;}
  if(/(settings|setup|wake word|microphone)/.test(t)){go("settings");reply("I've opened your setup and settings.");return;}
  if(/(volume up|louder)/.test(t)){state.assistantVolume=Math.min(100,state.assistantVolume+10);$("#assistantVolume").value=state.assistantVolume;syncSettings();reply("I've turned my speaking volume up.");return;}
  if(/(volume down|quieter)/.test(t)){state.assistantVolume=Math.max(0,state.assistantVolume-10);$("#assistantVolume").value=state.assistantVolume;syncSettings();reply("I've turned my speaking volume down.");return;}
  if(/(new game|restart game)/.test(t)){go("games");resetGame();reply("A fresh board! You're X. Your move.");return;}
  const move=t.match(/(?:move|put|place) (?:an? )?([1-9])|square ([1-9])/);if(move){const n=Number(move[1]||move[2])-1;if(state.page==="games"&&playMove(n)){reply("Move made.");}else reply("I couldn't make that move. Open games and choose an empty square.");return;}
  reply("I'm still learning that one. Try asking me to tell you a story, open games, play music, or tell you the time.");
}
// Text-command controls are intentionally absent; voice requests are handled by speech recognition.
function scheduleRecognitionRestart(delay=700){
  clearTimeout(state.restartTimer);
  if(!state.listening||!state.wake)return;
  state.restartTimer=setTimeout(()=>startRecognitionEngine(),delay);
}
function startRecognitionEngine(){
  if(!state.listening||state.recognitionRunning||state.recognitionStarting||!state.recognition)return;
  state.recognitionStarting=true;
  try{state.recognition.start();}
  catch(error){
    state.recognitionStarting=false;
    if(error.name==="InvalidStateError"){scheduleRecognitionRestart(900);return;}
    $("#orbSubtitle").textContent="The microphone needs to reconnect. I'll try again automatically.";
    scheduleRecognitionRestart(1800);
  }
}
function speechRecognition(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR)return null;
  const rec=new SR();
  rec.lang="en-GB";
  rec.continuous=false;
  rec.interimResults=true;
  rec.maxAlternatives=5;
  rec.onstart=()=>{
    state.recognitionRunning=true;state.recognitionStarting=false;state.restartDelay=700;
    if(state.listening){
      $("#listenLabel").textContent="LISTENING — SPEAK NOW";
      $("#listenButton").classList.add("listening");
      setMood("listening","MICROPHONE ACTIVE — SPEAK NOW");
      $("#voiceScreenTitle").textContent="Microphone is active";
      $("#voiceScreenText").textContent="Say what you need now. No name or wake word is required.";
    }
  };
  rec.onresult=e=>{
    const heard=Array.from(e.results).slice(e.resultIndex)
      .filter(result=>result.isFinal)
      .map(result=>result[0]?.transcript||"").join(" ").trim();
    if(!heard)return;
    if(state.speaking){
      if(/\b(stop|pause|wait|hold on)\b/i.test(heard))handleCommand(heard);
      return;
    }
    if(!state.listening)return;
    if(state.wake){
      const now=Date.now();
      if(now-state.wakeBufferAt>5500)state.wakeBuffer="";
      state.wakeBuffer=(state.wakeBuffer+" "+heard).trim().slice(-180);
      state.wakeBufferAt=now;
      const normalised=state.wakeBuffer.toLowerCase().replace(/[’']/g,"").replace(/[.,!?]/g," ").replace(/\s+/g," ").trim();
      const match=normalised.match(/\b(?:(?:hey|okay|ok)\s+)?(?:rohan|rowan)\b\s*(.*)$/i);
      if(match){
        const command=(match[1]||"").trim();
        state.wakeBuffer="";
        $("#orbHeading").textContent="Yes, Rohan?";
        $("#orbSubtitle").textContent=command?"I'm listening to your request.":"What can I do for you?";
        if(command)handleCommand(command);
        else reply("Yes, Rohan? I'm listening.");
      }
    }else{
      stopRecognition();
      if(state.quiz.active)handleQuizUtterance(heard);
      else handleCommand(heard);
    }
  };
  rec.onerror=e=>{
    state.recognitionStarting=false;
    if(e.error==="not-allowed"||e.error==="service-not-allowed"){
      state.listening=false;state.wake=false;state.recognitionRunning=false;
      $("#orbSubtitle").textContent="Microphone access is blocked. Allow Microphone for this site in Chrome or your tablet settings.";
      $("#listenButton").classList.remove("listening");$("#listenLabel").textContent="ALLOW MICROPHONE";
      $("#wakeToggle").checked=false;
      setMood("","MICROPHONE PERMISSION NEEDED");
      $("#voiceScreenTitle").textContent="Microphone permission needed";
      $("#voiceScreenText").textContent="Use the site controls beside the address bar to allow microphone access, then press Start Listening.";
    }else if(e.error==="network"){
      $("#orbSubtitle").textContent="The browser speech service lost its connection. Reconnecting automatically…";
      state.restartDelay=2200;
    }else if(e.error!=="no-speech"&&e.error!=="aborted"){
      $("#orbSubtitle").textContent="Microphone issue: "+e.error+". Reconnecting…";
      state.restartDelay=1400;
    }
  };
  rec.onend=()=>{
    state.recognitionRunning=false;state.recognitionStarting=false;
    if(state.listening&&state.wake){
      scheduleRecognitionRestart(state.restartDelay||700);
    }else if(state.listening){
      state.listening=false;
      $("#listenButton").classList.remove("listening");$("#listenLabel").textContent="START LISTENING";
      setMood("","READY WHEN YOU ARE");
      $("#voiceScreenTitle").textContent="Listening ended";
      $("#voiceScreenText").textContent="Press Start Listening to try again.";
    }
  };
  return rec;
}
async function startRecognition(wake=false){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    state.wake=false;$("#wakeToggle").checked=false;
    $("#orbSubtitle").textContent="Voice recognition is not supported in this browser. Use the latest Chrome or Edge.";
    $("#voiceScreenTitle").textContent="Speech recognition unavailable";
    $("#voiceScreenText").textContent="For hands-free voice commands, use Chrome or Edge on a secure HTTPS page.";
    $("#listenLabel").textContent="VOICE NOT SUPPORTED";return;
  }
  if(!navigator.mediaDevices?.getUserMedia){
    state.wake=false;$("#wakeToggle").checked=false;
    $("#orbSubtitle").textContent="Microphone access needs a secure HTTPS connection.";
    $("#voiceScreenTitle").textContent="Secure connection required";$("#voiceScreenText").textContent=$("#orbSubtitle").textContent;return;
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    stream.getTracks().forEach(track=>track.stop());
  }catch(error){
    state.wake=false;state.listening=false;$("#wakeToggle").checked=false;
    $("#listenButton").classList.remove("listening");$("#listenLabel").textContent="ALLOW MICROPHONE";
    const msg=error.name==="NotAllowedError"?"Please allow microphone access in your browser.":"The microphone could not be opened: "+error.message;
    $("#orbSubtitle").textContent=msg;$("#voiceScreenTitle").textContent="Microphone permission needed";$("#voiceScreenText").textContent=msg;setMood("","MICROPHONE PERMISSION NEEDED");return;
  }
  if(!state.recognition)state.recognition=speechRecognition();
  state.wake=Boolean(wake);state.listening=true;state.wakeBuffer="";
  state.recognition.continuous=false;
  $("#listenLabel").textContent="CONNECTING MICROPHONE…";
  $("#listenButton").classList.add("listening");
  setMood("listening","CONNECTING MICROPHONE");
  $("#orbSubtitle").textContent="Go ahead — say your request. You do not need to say Rohan.";
  startRecognitionEngine();
}
function resumeWakeListening(){
  if(!state.wake)return;
  state.listening=true;
  startRecognitionEngine();
}
function stopRecognition(){
  state.listening=false;state.wake=false;state.wakeBuffer="";
  clearTimeout(state.restartTimer);
  if(state.recognition){try{state.recognition.stop();}catch{}}
  state.recognitionRunning=false;state.recognitionStarting=false;
  $("#listenButton").classList.remove("listening");$("#listenLabel").textContent="START LISTENING";
  setMood("","READY WHEN YOU ARE");
}
function primeMusicPlayback(){try{musicElement.muted=true;const attempt=musicElement.play();if(attempt&&typeof attempt.then==="function"){attempt.then(()=>{musicElement.pause();musicElement.currentTime=0;musicElement.muted=false;}).catch(()=>{musicElement.muted=false;});}else{musicElement.muted=false;}}catch{musicElement.muted=false;}}
$("#listenButton").onclick=()=>{if(state.listening){stopRecognition();$("#voiceScreenTitle").textContent="Microphone is off";$("#voiceScreenText").textContent="Press Start Listening whenever you want to speak.";}else{primeMusicPlayback();startRecognition(false);}};
function syncSettings(){if($("#wakeToggle"))$("#wakeToggle").checked=false;$("#speakToggle").checked=state.speak;$("#assistantVolume").value=state.assistantVolume;$("#assistantVolumeValue").textContent=state.assistantVolume+"%";$("#themeToggle").checked=!document.body.classList.contains("no-glow");$("#settingsSpeechSpeed").value=state.speed;$("#settingsSpeedValue").textContent=state.speed.toFixed(1)+"×";}
// Manual activation only; no wake-word listener is started.
$("#speakToggle").onchange=e=>{state.speak=e.target.checked;localStorage.setItem("rohanSpeak",state.speak);};
$("#themeToggle").onchange=e=>document.body.classList.toggle("no-glow",!e.target.checked);
$("#assistantVolume").oninput=e=>{state.assistantVolume=Number(e.target.value);$("#assistantVolumeValue").textContent=state.assistantVolume+"%";if(state.audio)state.audio.volume=state.assistantVolume/100;localStorage.setItem("rohanVolume",state.assistantVolume);};
$("#testMic").onclick=()=>startRecognition(false);
$("#setupMic").onclick=()=>{go("home");startRecognition(false);};
$("#setupVoice").onclick=()=>{if(!state.voiceId){$("#voiceNote").textContent="The Cartesia voice is still loading. Try again in a moment.";go("voice");return;}speak("Microphone and voice setup check. Hello, Rohan. Your assistant voice is working.");};
$("#setupMusic").onclick=()=>go("music");
$("#speechSpeed").value=state.speed;$("#speechSpeed").oninput=e=>{state.speed=Number(e.target.value);$("#speedValue").textContent=state.speed.toFixed(1)+"×";$("#settingsSpeechSpeed").value=state.speed;$("#settingsSpeedValue").textContent=state.speed.toFixed(1)+"×";localStorage.setItem("rohanSpeed",state.speed);};
$("#settingsSpeechSpeed").oninput=e=>{state.speed=Number(e.target.value);$("#speedValue").textContent=state.speed.toFixed(1)+"×";$("#settingsSpeedValue").textContent=state.speed.toFixed(1)+"×";$("#speechSpeed").value=state.speed;localStorage.setItem("rohanSpeed",state.speed);};
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
 const list=$("#voiceList"),select=$("#welcomeVoiceSelect"),status=$("#welcomeVoiceStatus");
 list.innerHTML='<div class="loading-line">Loading your Cartesia voice…</div>';
 select.innerHTML='<option value="">Loading voice…</option>';select.disabled=true;
 status.textContent="Connecting to Cartesia. This usually takes a few seconds.";
 $("#refreshVoices").disabled=true;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch("/api/voices?single=1",{cache:"no-store",signal:controller.signal});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"Cartesia voice service returned HTTP "+r.status);
  const candidate=Array.isArray(d.voices)?d.voices[0]:d.voice;
  if(!candidate||typeof candidate.id!=="string"||!candidate.id.trim())throw new Error("Cartesia did not return a usable voice.");
  const voice={id:candidate.id,name:candidate.name||candidate.description||"Cartesia voice"};
  state.voices=[voice];
  const saved=localStorage.getItem("rohanVoiceId");
  state.voiceId=saved===voice.id?saved:voice.id;
  localStorage.setItem("rohanVoiceId",state.voiceId);
  renderVoices();renderSetupVoiceOptions();
  $("#voiceNote").textContent="Your Cartesia voice is ready.";
  status.textContent="One voice available and selected. You can preview it below.";
 }catch(e){
  state.voices=[];state.voiceId="";
  list.innerHTML="";const p=document.createElement("div");p.className="loading-line";p.textContent=e.name==="AbortError"?"Cartesia voice loading timed out. Press Refresh to try again.":e.message;list.append(p);
  select.innerHTML='<option value="">Voice unavailable — retry</option>';select.disabled=true;
  status.textContent=e.name==="AbortError"?"The voice service did not respond in time.":"Voice loading failed: "+e.message;
  $("#voiceNote").textContent=status.textContent;
  $("#voiceScreenTitle").textContent="Cartesia voice could not load";$("#voiceScreenText").textContent=status.textContent;
 }finally{
  clearTimeout(timer);$("#refreshVoices").disabled=false;
 }
}
function chooseVoice(id){if(!state.voices.some(v=>v.id===id))return;state.voiceId=id;localStorage.setItem("rohanVoiceId",id);renderVoices();renderSetupVoiceOptions();}
function renderSetupVoiceOptions(){const select=$("#welcomeVoiceSelect");if(!select)return;select.innerHTML="";state.voices.forEach(v=>{const o=document.createElement("option");o.value=v.id;o.textContent=v.name||"Cartesia voice";select.append(o);});select.value=state.voiceId;select.disabled=!state.voices.length;$("#welcomeVoiceStatus").textContent=state.voices.length?"One Cartesia voice is available and selected.":"Waiting for a Cartesia voice.";}
function renderVoices(){const list=$("#voiceList");list.innerHTML="";state.voices.forEach(v=>{const item=document.createElement("button");item.type="button";item.className="voice-option"+(v.id===state.voiceId?" selected":"");item.onclick=()=>chooseVoice(v.id);const radio=document.createElement("span");radio.className="voice-radio";const details=document.createElement("span");const name=document.createElement("strong");name.textContent=v.name||"Cartesia voice";const desc=document.createElement("small");desc.textContent="Cartesia · Sonic 3.6 · English";details.append(name,desc);item.append(radio,details);list.append(item);});}
$("#refreshVoices").onclick=loadVoices;$("#previewVoice").onclick=()=>{if(!state.voiceId){$("#voiceNote").textContent="Wait for the Cartesia voice to load first.";return;}speak("Hello, Rohan. It is lovely to speak with you. I can help you with games, music, stories and the time. What shall we do today?");};
function setAccent(accent){const v=["blue","orange","green","pink"].includes(accent)?accent:"blue";document.body.dataset.accent=v;localStorage.setItem("rohanAccent",v);$$(".accent-choice").forEach(b=>b.classList.toggle("selected",b.dataset.accent===v));}
$$(".accent-choice").forEach(b=>b.onclick=()=>setAccent(b.dataset.accent));
$("#welcomeVoiceSelect").onchange=e=>chooseVoice(e.target.value);
$("#previewWelcomeVoice").onclick=()=>{if(!state.voiceId){$("#welcomeVoiceStatus").textContent="No Cartesia voice is available yet.";return;}speak("Hello! This is a preview of the voice you selected for Rohan AI.");};
$("#retryWelcomeVoice").onclick=loadVoices;
$("#finishSetup").onclick=()=>{if($("#welcomeVoiceSelect").value)chooseVoice($("#welcomeVoiceSelect").value);localStorage.setItem("rohanSetupComplete","true");$("#welcomeSetup").classList.add("hidden");$("#orbSubtitle").textContent="All set. Press Start Listening whenever you want to talk.";reply("You're all set! I've saved your voice and colour choices. What would you like to do?");};
function showWelcomeSetup(){setAccent(localStorage.getItem("rohanAccent")||"blue");renderSetupVoiceOptions();if(localStorage.getItem("rohanSetupComplete")!=="true")$("#welcomeSetup").classList.remove("hidden");}

const winning=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function renderBoard(){const board=$("#board");board.innerHTML="";state.board.forEach((v,i)=>{const b=document.createElement("button");b.className="cell "+(v==="O"?"o":"");b.textContent=v;b.disabled=!!v||state.gameOver;b.setAttribute("aria-label","Square "+(i+1)+(v?", "+v:""));b.onclick=()=>playMove(i);board.append(b);});$("#scoreLine").innerHTML="You "+state.scores.you+" <b>·</b> AI "+state.scores.ai+" <b>·</b> Draws "+state.scores.draw;}
function winner(board,mark){return winning.some(line=>line.every(i=>board[i]===mark));}
function playMove(i){if(state.gameOver||state.board[i])return false;state.board[i]="X";if(winner(state.board,"X")){finishGame("you");return true;}if(state.board.every(Boolean)){finishGame("draw");return true;}const move=bestMove(state.board);if(move!==-1)state.board[move]="O";if(winner(state.board,"O"))finishGame("ai");else if(state.board.every(Boolean))finishGame("draw");renderBoard();return true;}
function bestMove(b){let best=-Infinity,choice=-1;for(let i=0;i<9;i++){if(b[i])continue;b[i]="O";let score=minimax(b,0,false);b[i]="";if(score>best){best=score;choice=i;}}return choice;}
function minimax(b,depth,isMax){if(winner(b,"O"))return 10-depth;if(winner(b,"X"))return depth-10;if(b.every(Boolean))return 0;if(isMax){let v=-Infinity;for(let i=0;i<9;i++)if(!b[i]){b[i]="O";v=Math.max(v,minimax(b,depth+1,false));b[i]="";}return v;}let v=Infinity;for(let i=0;i<9;i++)if(!b[i]){b[i]="X";v=Math.min(v,minimax(b,depth+1,true));b[i]="";}return v;}
function finishGame(result){state.gameOver=true;state.scores[result]++;const messages={you:"You won! Brilliant move, Rohan!",ai:"I won this round! Fancy another?",draw:"It's a draw! Good game."};$("#gameStatus").textContent=messages[result];renderBoard();}
function resetGame(){state.board=Array(9).fill("");state.gameOver=false;$("#gameStatus").textContent="Your turn — X";renderBoard();}$("#resetGame").onclick=resetGame;renderBoard();
function cycleTrack(direction=1){const index=tracks.findIndex(track=>track.id===state.track);const next=(index+direction+tracks.length)%tracks.length;selectTrack(tracks[next].id,true);}
function selectTrack(id="library",autoplay=false){
 const track=tracks.find(item=>item.id===id)||tracks[0];
 const changed=state.track!==track.id;
 if(changed){stopMusic();state.track=track.id;musicElement.src=track.src;musicElement.load();}
 $$(".track-card").forEach(b=>b.classList.toggle("selected",b.dataset.track===track.id));
 $("#nowPlaying").textContent=track.name;
 $("#trackDescription").textContent=track.desc;
 $("#playerArt").textContent=track.art;
 $("#musicStatus").textContent="Ready to play";
 $("#duration").textContent="--:--";
 $("#elapsed").textContent="00:00";
 $("#musicProgress").style.width="0%";
 if(autoplay)startMusic();
}
const musicElement=$("#musicAudio");
musicElement.src=tracks[0].src;
musicElement.addEventListener("loadedmetadata",()=>{$("#duration").textContent=formatMusicTime(musicElement.duration);});
musicElement.addEventListener("canplay",()=>{if(!state.musicOn)$("#musicStatus").textContent="Ready to play";});
musicElement.addEventListener("waiting",()=>{$("#musicStatus").textContent="Buffering audio…";});
musicElement.addEventListener("error",()=>{
 state.musicOn=false;
 const code=musicElement.error?.code;
 const reason=code===2?"Network error while downloading the audio.":code===3?"The audio format could not be decoded.":code===4?"This audio source is unavailable.":"The audio could not be loaded.";
 $("#trackDescription").textContent=reason;
 $("#musicStatus").textContent=reason+" Choose another track.";
 $("#playMusic").innerHTML='<span class="material-symbols-rounded">play_arrow</span>';
});
musicElement.addEventListener("ended",()=>{state.musicOn=false;$("#playMusic").innerHTML='<span class="material-symbols-rounded">play_arrow</span>';$("#musicStatus").textContent="Track finished";});
function startMusic(){
 if(!musicElement.src)selectTrack(state.track||"library",false);
 musicElement.loop=true;
 musicElement.muted=false;
 musicElement.volume=Number($("#musicVolume").value)/100;
 $("#musicStatus").textContent="Loading track…";
 musicElement.play().then(()=>{
   state.musicOn=true;
   $("#trackDescription").textContent=tracks.find(t=>t.id===state.track)?.desc||"Streaming audio";
   $("#musicStatus").textContent="Now playing";
   $("#playMusic").innerHTML='<span class="material-symbols-rounded">pause</span>';
   if(state.progressTimer)cancelAnimationFrame(state.progressTimer);
   progressMusic();
 }).catch(error=>{
   state.musicOn=false;
   const message=error?.name==="NotAllowedError"?"Your browser blocked playback. Press Play again.":"This source did not start. Try one of the SoundHelix tracks.";
   $("#musicStatus").textContent=message;
   $("#trackDescription").textContent=message;
   $("#playMusic").innerHTML='<span class="material-symbols-rounded">play_arrow</span>';
 });
}
function progressMusic(){
 if(!state.musicOn)return;
 const current=musicElement.currentTime||0,duration=musicElement.duration||0;
 $("#elapsed").textContent=formatMusicTime(current);
 $("#duration").textContent=Number.isFinite(duration)?formatMusicTime(duration):"--:--";
 $("#musicProgress").style.width=(duration?current/duration*100:0)+"%";
 state.progressTimer=requestAnimationFrame(progressMusic);
}
function formatMusicTime(seconds){if(!Number.isFinite(seconds))return "00:00";return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(Math.floor(seconds%60)).padStart(2,"0");}
function stopMusic(){
 state.musicOn=false;
 musicElement.pause();
 if(state.progressTimer)cancelAnimationFrame(state.progressTimer);
 $("#playMusic").innerHTML='<span class="material-symbols-rounded">play_arrow</span>';
}
$$(".track-card").forEach(b=>b.onclick=()=>selectTrack(b.dataset.track,true));
$("#playMusic").onclick=()=>{if(state.musicOn)stopMusic();else startMusic();};
$("#musicVolume").oninput=e=>{musicElement.volume=Number(e.target.value)/100;};
function updateClock(){$("#clock").textContent=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});const h=new Date().getHours();$("#dateLabel").textContent=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}).toUpperCase();if(state.page==="home")$("#pageTitle").textContent=h<12?"Good morning, Rohan":h<18?"Good afternoon, Rohan":"Good evening, Rohan";}
setInterval(updateClock,15000);updateClock();loadStatus();loadVoices();syncSettings();showWelcomeSetup();
// The microphone stays off until the user presses Start Listening. No wake word is required.