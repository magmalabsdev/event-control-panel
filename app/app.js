// Event Control Panel - app.js

// Time display
const timeEl = document.getElementById('time');
const anTimeEl = document.getElementById('anTime');
function updateTime(){
  const d=new Date();
  const t = d.toLocaleTimeString();
  if (timeEl) timeEl.textContent = t;
  if (anTimeEl) anTimeEl.textContent = t;
}
setInterval(updateTime,1000);
updateTime();

// State
let songs = [];
let currentSongIndex = -1;
let musicAudio = new Audio();
musicAudio.preload = 'auto';
let musicPlaying = false;
let musicLoopMode = 'off';

// Web Audio API gain node for music (enables gain > 100% on local files)
let musicAudioContext = null;
let musicGainNode = null;

let soundboardSounds = [];

// ── Soundboard Web Audio API (for gain > 1 and stable volume analysis) ──
let sbAudioContext = null;
const sbRawBuffers = new Map();   // url → ArrayBuffer cache
const sbPlayingCount = new Map(); // url → number of currently playing instances
let stableVolumeEnabled = false;

// Insert soft hyphens (U+00AD) every N chars in long words so the browser
// can break with a visible hyphen rather than overflowing.
function addSoftHyphens(text, chunkSize = 11) {
  return text.replace(/\S+/g, word => {
    if (word.length <= chunkSize) return word;
    let out = '';
    for (let i = 0; i < word.length; i++) {
      out += word[i];
      if ((i + 1) % chunkSize === 0 && i < word.length - 1) out += '­';
    }
    return out;
  });
}

function normLabelContent(sound) {
  if (!stableVolumeEnabled) return { text: '0.0 dB', cls: '' };
  if (sound.peakAmplitude === undefined) return { text: '…', cls: '' };
  const gain = getStableGain(sound);
  const db = Math.abs(gain - 1) < 0.001 ? 0 : 20 * Math.log10(gain);
  if (Math.abs(db) < 0.05) return { text: '0.0 dB', cls: '' };
  const sign = db > 0 ? '+' : '';
  return { text: sign + db.toFixed(1) + ' dB', cls: db > 0 ? 'sb-norm-pos' : 'sb-norm-neg' };
}

function applyNormLabel(el, sound) {
  const { text, cls } = normLabelContent(sound);
  el.textContent = text;
  el.className = 'sb-norm-label' + (cls ? ' ' + cls : '');
}

function updateAllSbNormLabels() {
  document.querySelectorAll('.soundboard-item').forEach(el => {
    const sound = soundboardSounds.find(s => s.url === el.dataset.sbUrl);
    if (sound) { const n = el.querySelector('.sb-norm-label'); if (n) applyNormLabel(n, sound); }
  });
}

function updateSbPlayingState(url, delta) {
  const count = Math.max(0, (sbPlayingCount.get(url) || 0) + delta);
  sbPlayingCount.set(url, count);
  const on = count > 0;
  document.querySelectorAll('.soundboard-item').forEach(el => {
    if (el.dataset.sbUrl === url) el.classList.toggle('sb-playing', on);
  });
  document.querySelectorAll('.sb-cp-btn').forEach(btn => {
    if (btn.dataset.sbUrl === url) btn.classList.toggle('sb-playing', on);
  });
}

function formatSbDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return seconds.toFixed(3) + ' s';
  const min = Math.floor(seconds / 60);
  const sec = (seconds % 60).toFixed(3).padStart(6, '0');
  return `${min}:${sec}`;
}

function updateSbDurationLabel(url, seconds) {
  const text = formatSbDuration(seconds);
  document.querySelectorAll('.soundboard-item').forEach(el => {
    if (el.dataset.sbUrl === url) {
      const d = el.querySelector('.sb-duration-label');
      if (d) d.textContent = text;
    }
  });
}

function getSbAudioContext() {
  if (!sbAudioContext || sbAudioContext.state === 'closed') {
    sbAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sbAudioContext.state === 'suspended') sbAudioContext.resume().catch(() => {});
  return sbAudioContext;
}

async function fetchSbBuffer(url) {
  if (sbRawBuffers.has(url)) return sbRawBuffers.get(url);
  const buf = await fetch(url).then(r => r.arrayBuffer());
  sbRawBuffers.set(url, buf);
  return buf;
}

async function analyzeSbPeak(sound) {
  if (sound.peakAmplitude !== undefined) return sound.peakAmplitude;
  try {
    const ctx = getSbAudioContext();
    const raw = await fetchSbBuffer(sound.url);
    const audioBuf = await ctx.decodeAudioData(raw.slice(0));
    let peak = 0.0001;
    for (let c = 0; c < audioBuf.numberOfChannels; c++) {
      const ch = audioBuf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) {
        const v = Math.abs(ch[i]);
        if (v > peak) peak = v;
      }
    }
    sound.peakAmplitude = peak;
    // Capture duration from the decoded buffer (free, already decoded)
    if (sound.duration === undefined) {
      sound.duration = audioBuf.duration;
      updateSbDurationLabel(sound.url, sound.duration);
    }
    // Update any rendered norm labels for this sound
    document.querySelectorAll('.soundboard-item').forEach(el => {
      if (el.dataset.sbUrl === sound.url) {
        const n = el.querySelector('.sb-norm-label');
        if (n) applyNormLabel(n, sound);
      }
    });
    return peak;
  } catch {
    sound.peakAmplitude = 1;
    return 1;
  }
}

function getStableGain(sound) {
  if (!stableVolumeEnabled) return 1;
  if (sound.peakAmplitude === undefined) return 1;
  const peaks = soundboardSounds
    .map(s => s.peakAmplitude)
    .filter(p => p !== undefined && p > 0);
  if (peaks.length < 2) return 1;
  // Normalize to median: reduces loud sounds AND gently raises quiet ones
  const sorted = [...peaks].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return Math.min(1.5, median / sound.peakAmplitude);
}

async function playSoundboardItem(sound, onEnded) {
  const m = parseFloat(masterVolume?.value) || 1;
  const sv = parseFloat(soundboardVolume?.value) || 1;
  const stableGain = getStableGain(sound);
  const totalGain = m * sv * stableGain;

  updateSbPlayingState(sound.url, +1);
  const done = () => { updateSbPlayingState(sound.url, -1); if (onEnded) onEnded(); };

  if (totalGain <= 1.001) {
    const audio = new Audio(sound.url);
    audio.volume = Math.min(1, totalGain);
    if (selectedOutputDeviceId && typeof audio.setSinkId === 'function') {
      await audio.setSinkId(selectedOutputDeviceId).catch(() => {});
    }
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  } else {
    try {
      const ctx = getSbAudioContext();
      const raw = await fetchSbBuffer(sound.url);
      const audioBuf = await ctx.decodeAudioData(raw.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      const gain = ctx.createGain();
      gain.gain.value = totalGain;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = done;
      source.start(0);
    } catch { done(); }
  }
}

let media = [];
let currentMediaIndex = -1;
let displayWindow = null;
let displayFrozen = false;
let displayHidden = false;
let frozenPendingItem = null;
let mediaTimer = null;
let mediaPlaying = false;
let mediaLooping = false;
let mediaLoopMode = 'off';
let mediaProgressInterval = null;
let queuedMediaNext = null;
let queuedMusicNext = null;

// Elements
const musicFiles = document.getElementById('musicFiles');
const musicQueue = document.getElementById('musicQueue');
const currentSongEl = document.getElementById('currentSong');
const musicPlay = document.getElementById('musicPlay');
const musicPause = document.getElementById('musicPause');
const musicPrev = document.getElementById('musicPrev');
const musicNext = document.getElementById('musicNext');
const musicLoopModeSelect = document.getElementById('musicLoopMode');
const musicShuffleButton = document.getElementById('musicShuffle');
const soundboardFiles = document.getElementById('soundboardFiles');
const soundboardGrid = document.getElementById('soundboardGrid');
const ecpExport = document.getElementById('ecpExport');
const ecpExportAll = document.getElementById('ecpExportAll');
const ecpImportFile = document.getElementById('ecpImportFile');
const presetSelect = document.getElementById('presetSelect');
const sessionNotes = document.getElementById('sessionNotes');

const mediaFiles = document.getElementById('mediaFiles');
const mediaQueue = document.getElementById('mediaQueue');
const currentMediaEl = document.getElementById('currentMedia');
const mediaPlay = document.getElementById('mediaPlay');
const mediaPause = document.getElementById('mediaPause');
const mediaPrev = document.getElementById('mediaPrev');
const mediaNext = document.getElementById('mediaNext');
const mediaLoopModeSelect = document.getElementById('mediaLoopMode');
const mediaNotes = document.getElementById('mediaNotes');
const mediaMirror = document.getElementById('mediaMirror');
const transitionTimeEl = document.getElementById('transitionTime');
const openDisplay = document.getElementById('openDisplay');
const mediaMirrorContent = document.getElementById('mediaMirrorContent');
const mediaPrevPreview = document.getElementById('mediaPrevPreview');
const mediaNextPreview = document.getElementById('mediaNextPreview');
const statusEl = document.getElementById('status');
const appBanner = document.getElementById('appBanner');

const intercomToggle = document.getElementById('intercomToggle');
const inputDeviceSelect = document.getElementById('inputDeviceSelect');
const outputDeviceSelect = document.getElementById('outputDeviceSelect');
const masterVolume = document.getElementById('masterVolume');
const intercomVolume = document.getElementById('intercomVolume');
const musicVolume = document.getElementById('musicVolume');
const soundboardVolume = document.getElementById('soundboardVolume');
const mediaMuteAudio = document.getElementById('mediaMuteAudio');
const pauseMusicDuring = document.getElementById('pauseMusicDuringAnnouncement');
const fadeMusic = document.getElementById('fadeMusic');

// CP Sidebar controls selectors
const cpMusicPlay = document.getElementById('cpMusicPlay');
const cpMusicPause = document.getElementById('cpMusicPause');
const cpMusicPrev = document.getElementById('cpMusicPrev');
const cpMusicNext = document.getElementById('cpMusicNext');
const cpMusicVolume = document.getElementById('cpMusicVolume');
const cpMediaPrev = document.getElementById('cpMediaPrev');
const cpMediaNext = document.getElementById('cpMediaNext');
const cpMediaNotes = document.getElementById('cpMediaNotes');

// Play on finish checkboxes selectors
const musicTransition = document.getElementById('musicTransition');
const cpMusicTransition = document.getElementById('cpMusicTransition');
const mediaTransition = document.getElementById('mediaTransition');
const cpMediaTransition = document.getElementById('cpMediaTransition');

// Stopwatch / Timer tabs & displays selectors
const btnClockMode = document.getElementById('btnClockMode');
const btnStopwatchLap = document.getElementById('btnStopwatchLap');
const btnStopwatchMode = document.getElementById('btnStopwatchMode');
const btnTimerMode = document.getElementById('btnTimerMode');
const clockDisplay = document.getElementById('clockDisplay');
const stopwatchDisplay = document.getElementById('stopwatchDisplay');
const timerDisplay = document.getElementById('timerDisplay');

const btnStopwatchStart = document.getElementById('btnStopwatchStart');
const btnStopwatchReset = document.getElementById('btnStopwatchReset');
const stopwatchTime = document.getElementById('stopwatchTime');

const btnTimerStart = document.getElementById('btnTimerStart');
const btnTimerReset = document.getElementById('btnTimerReset');
const timerTime = document.getElementById('timerTime');
const timerInputMin = document.getElementById('timerInputMin');
const timerInputSec = document.getElementById('timerInputSec');
const stopwatchPanel = document.getElementById('stopwatchPanel');

// Announce page elements
const anStopwatchPanel = document.getElementById('anStopwatchPanel');
const anClockDisplay = document.getElementById('anClockDisplay');
const anStopwatchDisplay = document.getElementById('anStopwatchDisplay');
const anTimerDisplay = document.getElementById('anTimerDisplay');
const anBtnClockMode = document.getElementById('anBtnClockMode');
const anBtnStopwatchMode = document.getElementById('anBtnStopwatchMode');
const anBtnTimerMode = document.getElementById('anBtnTimerMode');
const anStopwatchTimeEl = document.getElementById('anStopwatchTime');
const anTimerTimeEl = document.getElementById('anTimerTime');
const anBtnStopwatchStart = document.getElementById('anBtnStopwatchStart');
const anBtnStopwatchLap = document.getElementById('anBtnStopwatchLap');
const anBtnStopwatchReset = document.getElementById('anBtnStopwatchReset');
const anBtnTimerStart = document.getElementById('anBtnTimerStart');
const anBtnTimerReset = document.getElementById('anBtnTimerReset');
const anTimerInputMin = document.getElementById('anTimerInputMin');
const anTimerInputSec = document.getElementById('anTimerInputSec');
const anLapList = document.getElementById('anLapList');
const anIntercomToggle = document.getElementById('anIntercomToggle');
const anIntercomVolume = document.getElementById('anIntercomVolume');
const anInputDeviceSelect = document.getElementById('anInputDeviceSelect');
const anOutputDeviceSelect = document.getElementById('anOutputDeviceSelect');
const anPauseMusicDuring = document.getElementById('anPauseMusicDuringAnnouncement');
const anFadeMusic = document.getElementById('anFadeMusic');
const announceSoundboardGrid = document.getElementById('announceSoundboardGrid');

let selectedInputDeviceId = '';
let selectedOutputDeviceId = '';

if (appBanner) {
  appBanner.addEventListener('click', () => window.location.reload());
}

async function refreshAudioDeviceLists(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter(d=>d.kind==='audioinput');
    const outputs = devices.filter(d=>d.kind==='audiooutput');

    const selectedInput = inputDeviceSelect.value || selectedInputDeviceId;
    const selectedOutput = outputDeviceSelect.value || selectedOutputDeviceId;

    inputDeviceSelect.innerHTML = '';
    inputs.forEach(device=>{
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${inputDeviceSelect.length+1}`;
      inputDeviceSelect.appendChild(option);
    });

    outputDeviceSelect.innerHTML = '';
    outputs.forEach(device=>{
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Speaker ${outputDeviceSelect.length+1}`;
      outputDeviceSelect.appendChild(option);
    });

    if (selectedInput) inputDeviceSelect.value = selectedInput;
    if (selectedOutput) outputDeviceSelect.value = selectedOutput;

    // Mirror device lists to announce page selects
    if (anInputDeviceSelect) { anInputDeviceSelect.innerHTML = inputDeviceSelect.innerHTML; anInputDeviceSelect.value = inputDeviceSelect.value; }
    if (anOutputDeviceSelect) { anOutputDeviceSelect.innerHTML = outputDeviceSelect.innerHTML; anOutputDeviceSelect.value = outputDeviceSelect.value; }

    void applyOutputDeviceToAllAudio();
  } catch (err) {
    console.warn('Unable to enumerate devices:', err);
  }
}

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener){
  navigator.mediaDevices.addEventListener('devicechange', refreshAudioDeviceLists);
}

inputDeviceSelect.addEventListener('change', ()=>{
  selectedInputDeviceId = inputDeviceSelect.value;
});
outputDeviceSelect.addEventListener('change', ()=>{
  selectedOutputDeviceId = outputDeviceSelect.value;
  void applyOutputDeviceToAllAudio();
});

async function applyAudioOutputDevice(audio){
  if (!audio || !selectedOutputDeviceId || typeof audio.setSinkId !== 'function') return;
  try {
    await audio.setSinkId(selectedOutputDeviceId);
  } catch (err) {
    console.warn('Unable to route audio to selected output device:', err);
  }
}

async function applyOutputDeviceToAllAudio(){
  await applyAudioOutputDevice(musicAudio);
  if (intercomAudioEl) await applyAudioOutputDevice(intercomAudioEl);
}

function pauseAllAudio(){
  try { if (ytPlayerReady && ytPlayer?.pauseVideo) ytPlayer.pauseVideo(); } catch {}
  try { if (spotifyController) spotifyController.pause(); } catch {}
  if (musicAudio){ musicAudio.pause(); }
  document.querySelectorAll('audio').forEach(a=>{ try { a.pause(); } catch {} });
  if (mediaMirrorContent){ mediaMirrorContent.querySelectorAll('video').forEach(v=>{ try { v.pause(); } catch {} }); }
  if (displayWindow && !displayWindow.closed) sendMediaControlToDisplay('pause');
  stopMediaLoop();
  mediaPlaying = false;
  mediaLooping = false;
  mediaProgressStart = 0;
  if (intercomActive) stopIntercom();
  musicPlaying = false;
  updateButtonStates();
}

async function ensureDeviceAccess(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  try {
    await navigator.mediaDevices.getUserMedia({audio:true});
  } catch (err) {
    // ignore permission denial here; devices list may still show if previously granted
  }
  await refreshAudioDeviceLists();
}

// Master / channel volume controls
function applyVolumeSettings(){
  const m  = parseFloat(masterVolume?.value) || 1;
  const mv = parseFloat(musicVolume?.value)  || 1;
  const effectiveGain = m * mv;

  // Set up Web Audio gain node lazily the first time gain > 1 is requested.
  // createMediaElementSource permanently routes musicAudio through the AudioContext,
  // so we only do this when actually needed.
  if (effectiveGain > 1.001 && !musicGainNode) {
    try {
      musicAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      const src = musicAudioContext.createMediaElementSource(musicAudio);
      musicGainNode = musicAudioContext.createGain();
      src.connect(musicGainNode);
      musicGainNode.connect(musicAudioContext.destination);
    } catch (e) { console.warn('Music Web Audio setup failed:', e); }
  }

  if (musicGainNode) {
    musicGainNode.gain.value = effectiveGain;
    try { musicAudio.volume = 1; } catch {}
    musicAudioContext?.resume().catch(() => {});
  } else {
    try { musicAudio.volume = Math.min(1, effectiveGain); } catch {}
  }
  // YouTube capped at 100 — YT API doesn't support gain > 1
  try { if (ytPlayer?.setVolume) ytPlayer.setVolume(Math.min(100, Math.round(effectiveGain * 100))); } catch {}
  // (soundboard volumes applied on play)
}

masterVolume.addEventListener('input', applyVolumeSettings);
if (soundboardVolume) soundboardVolume.addEventListener('input', applyVolumeSettings);

// ===== YOUTUBE / SPOTIFY SUPPORT =====

let ytPlayer = null;
let ytPlayerReady = false;
let ytApiReady = false;
let ytApiLoading = false;
let ytApiCallbacks = [];
let ytPendingItem = null;
let ytExpandedStart = -1; // songs[] index where an expanded playlist starts

let spotifyController = null;
let spotifyApiReady = false;
let spotifyApiLoading = false;
let spotifyApiCallbacks = [];

let activePage = 'controlPage'; // tracks which page tab is active

function updateStreamVisibility() {
  const song = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  const ytEl = document.getElementById('ytPlayerContainer');
  const spEl = document.getElementById('spotifyPlayerContainer');
  const onAudio = activePage === 'audioPage';
  // Use class toggling: off-screen (position:fixed left:-9999px) when not shown
  // so the iframe always remains functional (display:none breaks YouTube iframes).
  if (ytEl) ytEl.classList.toggle('stream-player-visible', !!(onAudio && song?.source === 'youtube'));
  if (spEl) spEl.classList.toggle('stream-player-visible', !!(onAudio && song?.source === 'spotify'));
}

// YouTube IFrame API loader
function ensureYouTubeApi() {
  return new Promise((resolve) => {
    if (ytApiReady) { resolve(); return; }
    ytApiCallbacks.push(resolve);
    if (!ytApiLoading) {
      ytApiLoading = true;
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
}

window.onYouTubeIframeAPIReady = function() {
  ytApiReady = true;
  ytApiCallbacks.forEach(cb => cb());
  ytApiCallbacks = [];
};

// Spotify Embed IFrame API loader
function ensureSpotifyApi() {
  return new Promise((resolve) => {
    if (spotifyApiReady && window._spotifyIFrameAPI) { resolve(window._spotifyIFrameAPI); return; }
    spotifyApiCallbacks.push(resolve);
    if (!spotifyApiLoading) {
      spotifyApiLoading = true;
      window.onSpotifyIframeApiReady = function(IFrameAPI) {
        window._spotifyIFrameAPI = IFrameAPI;
        spotifyApiReady = true;
        spotifyApiCallbacks.forEach(cb => cb(IFrameAPI));
        spotifyApiCallbacks = [];
      };
      const script = document.createElement('script');
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

// URL parsers
function parseYouTubeUrl(url) {
  try {
    const u = new URL(url.trim());
    let videoId = null;
    const playlistId = u.searchParams.get('list') || null;
    if (u.hostname === 'youtu.be') {
      videoId = u.pathname.slice(1).split('?')[0] || null;
    } else if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') {
        videoId = u.searchParams.get('v') || null;
      } else if (u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.split('/')[2] || null;
      } else if (u.pathname.startsWith('/shorts/')) {
        videoId = u.pathname.split('/')[2] || null;
      }
    }
    if (!videoId && !playlistId) return null;
    return { videoId, playlistId };
  } catch { return null; }
}

function parseSpotifyUrl(url) {
  try {
    const trimmed = url.trim();
    if (trimmed.startsWith('spotify:')) {
      const parts = trimmed.split(':');
      if (parts.length >= 3 && parts[2]) return trimmed;
      return null;
    }
    const u = new URL(trimmed);
    if (u.hostname === 'open.spotify.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[1]) return `spotify:${parts[0]}:${parts[1]}`;
    }
    return null;
  } catch { return null; }
}

// Queue add helpers
function addUrlToQueue(url) {
  const ytParsed = parseYouTubeUrl(url);
  if (ytParsed) { addYouTubeToQueue(ytParsed); return; }
  const spotifyUri = parseSpotifyUrl(url);
  if (spotifyUri) { addSpotifyToQueue(spotifyUri); return; }
  setStatus('Unrecognized URL. Paste a YouTube or Spotify link.');
  setTimeout(() => setStatus(''), 3000);
}

function addYouTubeToQueue({ videoId, playlistId }) {
  let name, item;
  if (playlistId && !videoId) {
    name = `YouTube Playlist (${playlistId})`;
    item = { name, type: 'youtube', source: 'youtube', youtubeType: 'playlist', youtubeVideoId: null, youtubePlaylistId: playlistId, url: '', durationFormatted: 'YouTube' };
  } else {
    name = `YouTube Video (${videoId})`;
    item = { name, type: 'youtube', source: 'youtube', youtubeType: 'video', youtubeVideoId: videoId, youtubePlaylistId: playlistId || null, url: '', durationFormatted: 'YouTube' };
  }
  songs.push(item);
  renderQueues();
  setStatus(`Added: ${name}`);
  setTimeout(() => setStatus(''), 3000);
}

function addSpotifyToQueue(spotifyUri) {
  const parts = spotifyUri.split(':');
  const type = parts[1] || 'item';
  const id = parts[2] || '';
  const typeName = { playlist: 'Playlist', track: 'Track', album: 'Album', artist: 'Artist' }[type] || type;
  const name = `Spotify ${typeName} (${id.slice(0, 10)}...)`;
  const item = { name, type: 'spotify', source: 'spotify', spotifyUri, url: '', durationFormatted: 'Spotify' };
  songs.push(item);
  renderQueues();
  setStatus(`Added: ${name}`);
  setTimeout(() => setStatus(''), 3000);
}

// Parse a URL for the visuals/media queue — supports YouTube, Google Drive, Google Slides,
// direct image URLs, remote PDFs and PPTX files.
function parseMediaUrl(url) {
  try {
    const u = new URL(url.trim());

    // YouTube
    if (u.hostname === 'youtu.be') {
      const videoId = u.pathname.slice(1).split('?')[0];
      if (videoId) return { type: 'youtube-embed', videoId };
    }
    if (u.hostname.includes('youtube.com')) {
      const videoId = u.searchParams.get('v');
      if (videoId) return { type: 'youtube-embed', videoId };
      const embedMatch = u.pathname.match(/^\/embed\/([^/?]+)/);
      if (embedMatch) return { type: 'youtube-embed', videoId: embedMatch[1] };
      const shortsMatch = u.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shortsMatch) return { type: 'youtube-embed', videoId: shortsMatch[1] };
    }

    // Google Drive
    if (u.hostname === 'drive.google.com') {
      const fileMatch = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (fileMatch) return { type: 'gdrive-embed', fileId: fileMatch[1] };
      const fileId = u.searchParams.get('id');
      if (fileId) return { type: 'gdrive-embed', fileId };
    }

    // Google Slides
    if (u.hostname === 'docs.google.com') {
      const slidesMatch = u.pathname.match(/\/presentation\/d\/([^/]+)/);
      if (slidesMatch) return { type: 'gslides-embed', presentationId: slidesMatch[1] };
    }

    // Direct image / PDF / PPTX by file extension
    const path = u.pathname.toLowerCase().split('?')[0];
    const imageExtMap = {
      '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png',
      '.gif':'image/gif', '.webp':'image/webp', '.bmp':'image/bmp',
      '.svg':'image/svg+xml', '.avif':'image/avif', '.tiff':'image/tiff'
    };
    for (const [ext, mime] of Object.entries(imageExtMap)) {
      if (path.endsWith(ext)) return { type: 'image-url', mimeType: mime };
    }
    if (path.endsWith('.pdf'))  return { type: 'pdf-url' };
    if (path.endsWith('.pptx')) return { type: 'pptx-url' };

    return null;
  } catch { return null; }
}

async function addMediaUrl(url) {
  const raw = url.trim();
  const parsed = parseMediaUrl(raw);
  if (!parsed) {
    setStatus('Unrecognized URL. Paste a YouTube, Google Drive, Google Slides, image, PDF, or PPTX link.');
    setTimeout(() => setStatus(''), 4000);
    return;
  }

  if (parsed.type === 'youtube-embed') {
    const embedUrl = `https://www.youtube.com/embed/${parsed.videoId}`;
    const item = { name: `YouTube: ${parsed.videoId}`, type: 'youtube-embed', source: 'youtube-media', embedUrl, videoId: parsed.videoId, url: '', notes: '', durationFormatted: 'YouTube' };
    media.push(item);
    renderMediaQueue();
    setStatus('Added YouTube video');
    setTimeout(() => setStatus(''), 3000);
    fetchYouTubeTitle(parsed.videoId).then(title => {
      if (title && item) { item.name = `YouTube: ${title}`; renderMediaQueue(); }
    });

  } else if (parsed.type === 'gdrive-embed') {
    const embedUrl = `https://drive.google.com/file/d/${parsed.fileId}/preview`;
    const item = { name: `Drive: ${parsed.fileId.slice(0, 12)}...`, type: 'gdrive-embed', source: 'gdrive', embedUrl, fileId: parsed.fileId, url: '', notes: '', durationFormatted: 'Google Drive' };
    media.push(item);
    renderMediaQueue();
    setStatus('Added Google Drive file');
    setTimeout(() => setStatus(''), 3000);

  } else if (parsed.type === 'gslides-embed') {
    const embedUrl = `https://docs.google.com/presentation/d/${parsed.presentationId}/embed?start=false&loop=false&delayms=3000`;
    const item = { name: `Slides: ${parsed.presentationId.slice(0, 14)}...`, type: 'gslides-embed', source: 'gslides', embedUrl, presentationId: parsed.presentationId, url: '', notes: '', durationFormatted: 'Google Slides' };
    media.push(item);
    renderMediaQueue();
    setStatus('Added Google Slides presentation');
    setTimeout(() => setStatus(''), 3000);

  } else if (parsed.type === 'image-url') {
    const filename = raw.split('/').pop().split('?')[0] || 'Web Image';
    const item = { name: filename, type: parsed.mimeType, source: 'image-url', url: raw, notes: '', durationFormatted: 'Web Image', pages: 1 };
    media.push(item);
    renderMediaQueue();
    setStatus(`Added web image: ${filename}`);
    setTimeout(() => setStatus(''), 3000);

  } else if (parsed.type === 'pdf-url') {
    setStatus('Fetching PDF…');
    try {
      const resp = await fetch(raw);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const filename = raw.split('/').pop().split('?')[0] || 'remote.pdf';
      const file = new File([blob], filename, { type: 'application/pdf' });
      const pages = await convertPdfFromFile(file, 1.5, 'jpeg');
      media.push(...pages);
      renderMediaQueue();
      setStatus(`Added ${pages.length} PDF page${pages.length === 1 ? '' : 's'} from URL`);
    } catch (err) {
      setStatus(`Failed to fetch PDF: ${err.message || 'CORS or network error'}`);
    }
    setTimeout(() => setStatus(''), 5000);

  } else if (parsed.type === 'pptx-url') {
    setStatus('Fetching PPTX…');
    try {
      const resp = await fetch(raw);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const filename = raw.split('/').pop().split('?')[0] || 'remote.pptx';
      const file = new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      const slides = await convertPptxFromFile(file, 1, 'jpeg');
      media.push(...slides);
      renderMediaQueue();
      setStatus(`Added ${slides.length} PPTX slide${slides.length === 1 ? '' : 's'} from URL`);
    } catch (err) {
      setStatus(`Failed to fetch PPTX: ${err.message || 'CORS or network error'}`);
    }
    setTimeout(() => setStatus(''), 5000);
  }
}

// Fetch a YouTube video title via the free, CORS-enabled oEmbed endpoint (no API key needed)
async function fetchYouTubeTitle(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch { return null; }
}

// After playlist expansion, fetch real titles for all expanded items in the background
async function fetchPlaylistTitles(expandedStart, count) {
  for (let i = 0; i < count; i++) {
    const item = songs[expandedStart + i];
    if (!item || item.source !== 'youtube' || !item.youtubeVideoId) continue;
    const title = await fetchYouTubeTitle(item.youtubeVideoId);
    if (title && songs[expandedStart + i]) {
      songs[expandedStart + i].name = title;
      songs[expandedStart + i].currentTitle = title;
    }
    renderMusicQueue();
  }
}

// YouTube player management
async function activateYouTubeItem(item) {
  musicAudio.pause();
  musicAudio.src = '';
  await ensureYouTubeApi();
  if (!ytPlayer) {
    ytPendingItem = item;
    ytPlayer = new YT.Player('ytPlayer', {
      height: '200', width: '356',
      playerVars: { autoplay: 1, modestbranding: 1, rel: 0, iv_load_policy: 3, controls: 1 },
      events: {
        onReady: () => {
          ytPlayerReady = true;
          if (ytPendingItem) { loadYouTubeItem(ytPendingItem); ytPendingItem = null; }
        },
        onStateChange: onYtStateChange,
        onError: (e) => console.warn('YouTube player error:', e.data)
      }
    });
  } else if (ytPlayerReady) {
    loadYouTubeItem(item);
  } else {
    ytPendingItem = item;
  }
  updateStreamVisibility();
}

function loadYouTubeItem(item) {
  if (!ytPlayer) return;
  const m = parseFloat(masterVolume?.value) || 1;
  const mv = parseFloat(musicVolume?.value) || 1;
  try { ytPlayer.setVolume(Math.round(m * mv * 100)); } catch {}
  if (item.youtubeType === 'playlist') {
    ytPlayer.loadPlaylist({ list: item.youtubePlaylistId, listType: 'playlist', index: 0 });
  } else if (item.youtubeType === 'video-in-playlist') {
    // Navigate within the active playlist to the right index
    const playlistIndex = currentSongIndex - ytExpandedStart;
    try { ytPlayer.playVideoAt(playlistIndex); } catch { ytPlayer.loadVideoById(item.youtubeVideoId); }
  } else {
    ytPlayer.loadVideoById(item.youtubeVideoId);
  }
}

function onYtStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    musicPlaying = true;
    const song = currentSongIndex >= 0 ? songs[currentSongIndex] : null;

    // First-time expansion of a YouTube playlist into individual cards
    if (song?.source === 'youtube' && song.youtubeType === 'playlist') {
      try {
        const ids = ytPlayer.getPlaylist() || [];
        const ytIndex = ytPlayer.getPlaylistIndex() || 0;
        if (ids.length > 0) {
          const playlistId = song.youtubePlaylistId;
          const newItems = ids.map((id, idx) => ({
            name: `Video ${idx + 1}`,
            type: 'youtube', source: 'youtube',
            youtubeType: 'video-in-playlist',
            youtubeVideoId: id,
            youtubePlaylistId: playlistId,
            url: '', durationFormatted: 'YouTube'
          }));
          songs.splice(currentSongIndex, 1, ...newItems);
          ytExpandedStart = currentSongIndex;
          currentSongIndex = ytExpandedStart + ytIndex;
          try {
            const title = ytPlayer.getVideoData()?.title;
            if (title) songs[currentSongIndex].currentTitle = title;
          } catch {}
          renderMusicQueue();
          // Fetch real titles for all expanded items in the background
          const expandStart = ytExpandedStart;
          const expandCount = newItems.length;
          fetchPlaylistTitles(expandStart, expandCount);
        }
      } catch {}
    }

    // Sync ECP index when YouTube auto-advances within an expanded playlist
    if (song?.source === 'youtube' && song.youtubeType === 'video-in-playlist' && ytExpandedStart >= 0) {
      try {
        const ytIndex = ytPlayer.getPlaylistIndex() || 0;
        currentSongIndex = ytExpandedStart + ytIndex;
        const title = ytPlayer.getVideoData()?.title;
        if (title) songs[currentSongIndex].currentTitle = title;
        renderMusicQueue();
      } catch {}
    }

    // Update title for single videos
    if (song?.source === 'youtube' && (song.youtubeType === 'video')) {
      try {
        const title = ytPlayer.getVideoData()?.title;
        if (title) songs[currentSongIndex].currentTitle = title;
      } catch {}
    }

    updateMusicUI();
    updateButtonStates();
  } else if (event.data === YT.PlayerState.PAUSED) {
    updateButtonStates();
  } else if (event.data === YT.PlayerState.ENDED) {
    if (musicLoopMode === 'single') {
      try { ytPlayer.seekTo(0); ytPlayer.playVideo(); } catch {}
      return;
    }
    if (queuedMusicNext) {
      const idx = songs.indexOf(queuedMusicNext);
      queuedMusicNext = null;
      if (idx !== -1) { playSongAt(idx); return; }
    }
    const next = findNextPlayableSongIndex(currentSongIndex);
    if (next !== -1) {
      if (songs[next].breakpoint) { musicPlaying = false; updateMusicUI(); updateButtonStates(); setStatus('⛔ Stopped at breakpoint: ' + songs[next].name); setTimeout(() => setStatus(''), 5000); return; }
      playSongAt(next); return;
    }
    if (musicLoopMode === 'all') {
      const first = findNextPlayableSongIndex(-1);
      if (first !== -1) {
        if (songs[first].breakpoint) { musicPlaying = false; updateMusicUI(); updateButtonStates(); setStatus('⛔ Stopped at breakpoint: ' + songs[first].name); setTimeout(() => setStatus(''), 5000); return; }
        playSongAt(first); return;
      }
    }
    musicPlaying = false; updateMusicUI(); updateButtonStates();
  }
}

function deactivateYouTubePlayer() {
  try { if (ytPlayer?.stopVideo) ytPlayer.stopVideo(); } catch {}
  ytExpandedStart = -1;
  updateStreamVisibility();
}

// Spotify player management
async function activateSpotifyItem(item) {
  musicAudio.pause();
  musicAudio.src = '';
  updateStreamVisibility();
  const IFrameAPI = await ensureSpotifyApi();
  const embedEl = document.getElementById('spotifyEmbed');
  if (!embedEl) return;
  if (spotifyController) {
    try { spotifyController.loadUri(item.spotifyUri); } catch {}
    setTimeout(() => { try { spotifyController.play(); } catch {} }, 400);
  } else {
    IFrameAPI.createController(embedEl, { uri: item.spotifyUri, width: '100%', height: 232 }, (controller) => {
      spotifyController = controller;
      controller.addListener('ready', () => { try { controller.play(); } catch {} });
      controller.addListener('playback_update', (event) => {
        const { isPaused, position, duration } = event.data || {};
        const song = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
        if (song?.source === 'spotify') { song.spotifyPosition = position; song.spotifyDuration = duration; }
        if (!isPaused) { musicPlaying = true; updateButtonStates(); }
        updateMusicUI();
        if (duration > 0 && position >= duration - 1500 && isPaused) handleSpotifyTrackEnd();
      });
    });
  }
}

function handleSpotifyTrackEnd() {
  if (musicLoopMode === 'single') {
    try { spotifyController.seek(0); spotifyController.play(); } catch {}
    return;
  }
  if (queuedMusicNext) {
    const idx = songs.indexOf(queuedMusicNext);
    queuedMusicNext = null;
    if (idx !== -1) { playSongAt(idx); return; }
  }
  const next = findNextPlayableSongIndex(currentSongIndex);
  if (next !== -1) {
    if (songs[next].breakpoint) { musicPlaying = false; updateMusicUI(); updateButtonStates(); setStatus('⛔ Stopped at breakpoint: ' + songs[next].name); setTimeout(() => setStatus(''), 5000); return; }
    playSongAt(next); return;
  }
  if (musicLoopMode === 'all') {
    const first = findNextPlayableSongIndex(-1);
    if (first !== -1) {
      if (songs[first].breakpoint) { musicPlaying = false; updateMusicUI(); updateButtonStates(); setStatus('⛔ Stopped at breakpoint: ' + songs[first].name); setTimeout(() => setStatus(''), 5000); return; }
      playSongAt(first); return;
    }
  }
  musicPlaying = false; updateMusicUI(); updateButtonStates();
}

function deactivateSpotifyPlayer() {
  try { if (spotifyController) spotifyController.pause(); } catch {}
  updateStreamVisibility();
}

function readBlobAsDataURL(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function getItemDataUrl(item){
  if (typeof item.url === 'string' && item.url.startsWith('data:')) return item.url;
  if (item.file) return await readFileAsDataURL(item.file);
  if (item.url) {
    try {
      const response = await fetch(item.url);
      if (!response.ok) return null;
      const blob = await response.blob();
      return await readBlobAsDataURL(blob);
    } catch {
      return null;
    }
  }
  return null;
}

async function serializeSessionItems(items){
  const list = [];
  for (const item of items){
    const dataUrl = await getItemDataUrl(item);
    const serialized = {
      name:item.name,
      type:item.type || '',
      source:item.source || '',
      pageNumber:item.pageNumber || 0,
      pages:item.pages || 0,
      notes:item.notes || '',
      durationFormatted:item.durationFormatted || '',
      skip: !!item.skip,
      breakpoint: !!item.breakpoint,
      dataUrl:dataUrl || ''
    };
    if (item.source === 'youtube') {
      serialized.youtubeType = item.youtubeType || 'video';
      serialized.youtubeVideoId = item.youtubeVideoId || null;
      serialized.youtubePlaylistId = item.youtubePlaylistId || null;
    }
    if (item.source === 'spotify') {
      serialized.spotifyUri = item.spotifyUri || '';
    }
    if (item.source === 'youtube-media') {
      serialized.embedUrl = item.embedUrl || '';
      serialized.videoId = item.videoId || '';
    }
    if (item.source === 'gdrive') {
      serialized.embedUrl = item.embedUrl || '';
      serialized.fileId = item.fileId || '';
    }
    if (item.source === 'gslides') {
      serialized.embedUrl = item.embedUrl || '';
      serialized.presentationId = item.presentationId || '';
    }
    if (item.source === 'image-url') {
      serialized.remoteUrl = item.url || '';
    }
    list.push(serialized);
  }
  return list;
}

async function createEcpPayload(sessionState){
  const state = sessionState || {
    notes: sessionNotes?.value || '',
    settings: {
      masterVolume: parseFloat(masterVolume.value),
      musicVolume: parseFloat(musicVolume?.value) || 1,
      soundboardVolume: parseFloat(soundboardVolume?.value) || 1,
      mediaMuteAudio: !!(mediaMuteAudio?.checked),
      intercomVolume: parseFloat(intercomVolume.value),
      pauseMusicDuringAnnouncement: pauseMusicDuring.checked,
      fadeMusic: fadeMusic.checked,
      musicLoop: musicLoopMode === 'all',
      musicLoopMode: musicLoopMode,
      mediaLoopMode: mediaLoopMode,
      transitionTime: parseFloat(transitionTimeEl.value) || 5,
      intercomMode: document.querySelector('input[name="mode"]:checked')?.value || 'live',
      selectedInputDeviceId,
      selectedOutputDeviceId,
      currentSongIndex,
      currentMediaIndex
    },
    music: songs,
    soundboard: soundboardSounds,
    media: media
  };

  const musicItems = state.music || state.songs || [];
  const soundboardItems = state.soundboard || state.soundboardSounds || [];
  const mediaItems = state.media || [];

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: state.notes || state.sessionNotes || '',
    settings: state.settings,
    music: await serializeSessionItems(musicItems),
    soundboard: await serializeSessionItems(soundboardItems),
    media: await serializeSessionItems(mediaItems)
  };
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 100);
}

function downloadJson(data, filename){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 100);
}

let presets = [];
let selectedPresetIndex = -1;

function createSessionItem(serialized){
  const item = {
    name: serialized.name || 'Unknown',
    type: serialized.type || 'application/octet-stream',
    url: serialized.dataUrl || serialized.url || '',
    source: serialized.source || '',
    pageNumber: serialized.pageNumber || 0,
    pages: serialized.pages || 0,
    notes: serialized.notes || '',
    durationFormatted: serialized.durationFormatted || 'Unknown',
    skip: !!serialized.skip,
    breakpoint: !!serialized.breakpoint
  };
  if (serialized.source === 'youtube') {
    item.youtubeType = serialized.youtubeType || 'video';
    item.youtubeVideoId = serialized.youtubeVideoId || null;
    item.youtubePlaylistId = serialized.youtubePlaylistId || null;
  }
  if (serialized.source === 'spotify') {
    item.spotifyUri = serialized.spotifyUri || '';
  }
  if (serialized.source === 'youtube-media') {
    item.embedUrl = serialized.embedUrl || '';
    item.videoId = serialized.videoId || '';
  }
  if (serialized.source === 'gdrive') {
    item.embedUrl = serialized.embedUrl || '';
    item.fileId = serialized.fileId || '';
  }
  if (serialized.source === 'gslides') {
    item.embedUrl = serialized.embedUrl || '';
    item.presentationId = serialized.presentationId || '';
  }
  if (serialized.source === 'image-url') {
    item.url = serialized.remoteUrl || serialized.dataUrl || '';
  }
  return item;
}

function buildPresetFromPayload(payload, fileName){
  return {
    name: fileName || payload.notes || 'Preset',
    notes: payload.notes || payload.sessionNotes || '',
    settings: payload.settings || {},
    music: (payload.music || []).map(createSessionItem),
    soundboard: (payload.soundboard || []).map(createSessionItem),
    media: (payload.media || []).map(createSessionItem)
  };
}

function updatePresetSelect(){
  if (!presetSelect) return;
  presetSelect.innerHTML = '';
  if (presets.length === 0){
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No presets loaded';
    presetSelect.appendChild(option);
    return;
  }

  presets.forEach((preset, index)=>{
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = preset.name || `Preset ${index + 1}`;
    if (index === selectedPresetIndex) option.selected = true;
    presetSelect.appendChild(option);
  });
}

function applyPreset(preset){
  pauseAllAudio();

  songs = (preset.music || []).map(item => ({ ...item }));
  soundboardSounds = (preset.soundboard || []).map(item => ({ ...item }));
  media = (preset.media || []).map(item => ({ ...item }));
  if (sessionNotes) sessionNotes.value = preset.notes || '';

  if (preset.settings){
    masterVolume.value = preset.settings.masterVolume ?? 1;
    if (musicVolume) musicVolume.value = preset.settings.musicVolume ?? 1;
    if (soundboardVolume) soundboardVolume.value = preset.settings.soundboardVolume ?? 1;
    if (mediaMuteAudio) mediaMuteAudio.checked = !!preset.settings.mediaMuteAudio;
    applyVolumeSettings();
    intercomVolume.value = preset.settings.intercomVolume ?? 1;
    pauseMusicDuring.checked = preset.settings.pauseMusicDuringAnnouncement === true;
    fadeMusic.checked = preset.settings.fadeMusic === true;
    transitionTimeEl.value = preset.settings.transitionTime || 5;
    if (preset.settings.intercomMode){
      const modeRadio = document.querySelector(`input[name="mode"][value="${preset.settings.intercomMode}"]`);
      if (modeRadio) modeRadio.checked = true;
    }
    selectedInputDeviceId = preset.settings.selectedInputDeviceId || '';
    selectedOutputDeviceId = preset.settings.selectedOutputDeviceId || '';
    musicLoopMode = preset.settings.musicLoopMode || (preset.settings.musicLoop === true ? 'all' : 'off');
    if (musicLoopModeSelect) musicLoopModeSelect.value = musicLoopMode;
    mediaLoopMode = preset.settings.mediaLoopMode || 'off';
    if (mediaLoopModeSelect) mediaLoopModeSelect.value = mediaLoopMode;
    currentSongIndex = Number.isInteger(preset.settings.currentSongIndex) && preset.settings.currentSongIndex >= 0 && preset.settings.currentSongIndex < songs.length ? preset.settings.currentSongIndex : -1;
  } else {
    currentSongIndex = -1;
  }

  currentMediaIndex = media.length > 0 ? 0 : -1;

  renderQueues();
  renderSoundboardGrid();
  updateMusicUI();
  updateMediaUI();

  if (currentSongIndex >= 0 && songs[currentSongIndex]){
    musicAudio.src = songs[currentSongIndex].url;
  }

  if (selectedOutputDeviceId){
    void applyOutputDeviceToAllAudio();
  }

  if (currentMediaIndex >= 0 && media[currentMediaIndex]){
    showMediaAt(currentMediaIndex, false);
  } else {
    updateMediaUI();
  }
}

// Parse .ecp text into a preset and add it to the list. Returns the new index.
function loadPresetFromText(text, name){
  const payload = JSON.parse(text);
  if (!payload || payload.version !== 1) throw new Error('Unsupported session file');
  const preset = buildPresetFromPayload(payload, name);
  presets.push(preset);
  const index = presets.length - 1;
  if (selectedPresetIndex === -1){
    selectedPresetIndex = index;
    applyPreset(preset);
  }
  updatePresetSelect();
  return index;
}

async function loadPresetFile(file){
  loadPresetFromText(await file.text(), file.name);
}

// Open a .ecp handed to us by the OS (file-explorer double-click / "open with"):
// add it, then select and apply it so it becomes the active preset immediately.
function openIncomingPreset(name, content){
  const index = loadPresetFromText(content, name);
  selectedPresetIndex = index;
  applyPreset(presets[index]);
  updatePresetSelect();
  setStatus(`Opened preset: ${presets[index].name}`);
  setTimeout(() => setStatus(''), 4000);
}

async function exportSelectedPreset(){
  const payload = await createEcpPayload();
  const currentPreset = selectedPresetIndex >= 0 ? presets[selectedPresetIndex] : null;
  const filename = currentPreset ? `${currentPreset.name.replace(/\.ecp$/i, '') || 'preset'}.ecp` : 'session.ecp';
  downloadJson(payload, filename);
}

async function exportAllPresets(){
  if (presets.length === 0) {
    setStatus('No presets to export.');
    return;
  }

  const zip = new JSZip();
  for (const preset of presets){
    const payload = await createEcpPayload(preset);
    const fileName = `${preset.name.replace(/\.ecp$/i, '') || 'preset'}.ecp`;
    zip.file(fileName, JSON.stringify(payload, null, 2));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, 'presets.zip');
}

async function applyImportedSession(payload){
  if (!payload || payload.version !== 1) throw new Error('Unsupported session file');
  songs = (payload.music || []).map(createSessionItem);
  soundboardSounds = (payload.soundboard || []).map(createSessionItem);
  media = (payload.media || []).map(createSessionItem);
  if (sessionNotes) sessionNotes.value = payload.notes || payload.sessionNotes || '';

  if (payload.settings){
    masterVolume.value = payload.settings.masterVolume ?? 1;
    if (musicVolume) musicVolume.value = payload.settings.musicVolume ?? 1;
    if (soundboardVolume) soundboardVolume.value = payload.settings.soundboardVolume ?? 1;
    if (mediaMuteAudio) mediaMuteAudio.checked = !!payload.settings.mediaMuteAudio;
    applyVolumeSettings();
    intercomVolume.value = payload.settings.intercomVolume ?? 1;
    pauseMusicDuring.checked = payload.settings.pauseMusicDuringAnnouncement === true;
    fadeMusic.checked = payload.settings.fadeMusic === true;
    transitionTimeEl.value = payload.settings.transitionTime || 5;
    if (payload.settings.intercomMode){
      const modeRadio = document.querySelector(`input[name="mode"][value="${payload.settings.intercomMode}"]`);
      if (modeRadio) modeRadio.checked = true;
    }
    selectedInputDeviceId = payload.settings.selectedInputDeviceId || '';
    selectedOutputDeviceId = payload.settings.selectedOutputDeviceId || '';
    musicLoopMode = payload.settings.musicLoopMode || (payload.settings.musicLoop === true ? 'all' : 'off');
    if (musicLoopModeSelect) musicLoopModeSelect.value = musicLoopMode;
    mediaLoopMode = payload.settings.mediaLoopMode || 'off';
    if (mediaLoopModeSelect) mediaLoopModeSelect.value = mediaLoopMode;
    currentSongIndex = Number.isInteger(payload.settings.currentSongIndex) && payload.settings.currentSongIndex >= 0 && payload.settings.currentSongIndex < songs.length ? payload.settings.currentSongIndex : -1;
    currentMediaIndex = Number.isInteger(payload.settings.currentMediaIndex) && payload.settings.currentMediaIndex >= 0 && payload.settings.currentMediaIndex < media.length ? payload.settings.currentMediaIndex : -1;
  }

  renderQueues();
  renderSoundboardGrid();
  updateMusicUI();
  updateMediaUI();
  if (currentSongIndex >= 0 && songs[currentSongIndex]){
    musicAudio.src = songs[currentSongIndex].url;
  }
  if (currentMediaIndex >= 0 && media[currentMediaIndex]){
    updateMediaMirror(media[currentMediaIndex]);
    sendMediaToDisplay(media[currentMediaIndex]);
  }
  await refreshAudioDeviceLists();
}

ecpExport.addEventListener('click', async ()=>{
  ecpExport.disabled = true;
  try {
    setStatus('Preparing preset export...');
    await exportSelectedPreset();
    setStatus('Preset export ready.');
  } catch (err) {
    console.error(err);
    setStatus(`Export failed: ${err.message || 'unknown error'}`);
  } finally {
    ecpExport.disabled = false;
    setTimeout(()=> setStatus(''), 4000);
  }
});

ecpExportAll.addEventListener('click', async ()=>{
  ecpExportAll.disabled = true;
  try {
    setStatus('Preparing all presets zip...');
    await exportAllPresets();
    setStatus('All presets exported successfully.');
  } catch (err) {
    console.error(err);
    setStatus(`Export failed: ${err.message || 'unknown error'}`);
  } finally {
    ecpExportAll.disabled = false;
    setTimeout(()=> setStatus(''), 4000);
  }
});

if (presetSelect) {
  presetSelect.addEventListener('change', ()=>{
    const index = Number(presetSelect.value);
    if (!Number.isFinite(index) || index < 0 || index >= presets.length) return;
    selectedPresetIndex = index;
    applyPreset(presets[selectedPresetIndex]);
  });
}

ecpImportFile.addEventListener('change', async e=>{
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  let importedCount = 0;
  let failedCount = 0;
  for (const file of files){
    try {
      setStatus(`Importing ${file.name}...`);
      await loadPresetFile(file);
      importedCount += 1;
    } catch (err) {
      console.error(err);
      failedCount += 1;
    }
  }

  if (importedCount > 0) {
    setStatus(`Imported ${importedCount} preset${importedCount === 1 ? '' : 's'}.`);
  }
  if (failedCount > 0) {
    setStatus(`${failedCount} preset${failedCount === 1 ? '' : 's'} failed to import.`);
  }
  e.target.value = '';
  setTimeout(()=> setStatus(''), 5000);
});

function formatDuration(seconds){
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Unknown';
  const minutes = Math.floor(seconds/60);
  const secs = Math.floor(seconds%60).toString().padStart(2,'0');
  return `${minutes}:${secs}`;
}

function loadFileMetadata(item, callback){
  if (item.type.startsWith('audio/')){
    const audio = new Audio();
    audio.src = item.url;
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', ()=>{
      item.duration = audio.duration;
      item.durationFormatted = formatDuration(audio.duration);
      callback();
    });
    audio.addEventListener('error', ()=>{ callback(); });
  } else if (item.type.startsWith('video/')){
    const video = document.createElement('video');
    video.src = item.url;
    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', ()=>{
      item.duration = video.duration;
      item.durationFormatted = formatDuration(video.duration);
      callback();
    });
    video.addEventListener('error', ()=>{ callback(); });
  } else if (item.type.startsWith('image/')){
    item.pages = 1;
    callback();
  } else {
    callback();
  }
}

async function extractPdfPages(file){
  return convertPdfFromFile(file, 1.5, 'jpeg');
}

const EMU_PER_PX = 9525;
const PPTX_PRES_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const PPTX_DRAW_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PPTX_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
// Vendored locally so PDF import works offline in the packaged app.
// Global UMD build (loads via <script>) is tried first; ESM build is the fallback.
const PDFJS_GLOBAL_SCRIPT_SRC = 'vendor/pdfjs/pdf.min.js';
const PDFJS_GLOBAL_WORKER_SRC = 'vendor/pdfjs/pdf.worker.min.js';
const PDFJS_MODULE_SRC = 'vendor/pdfjs/pdf.min.mjs';
const PDFJS_MODULE_WORKER_SRC = 'vendor/pdfjs/pdf.worker.min.mjs';
let pdfJsReadyPromise = null;
const loadedPptxFontFamilies = new Set();

function parseXmlString(xml){
  return new DOMParser().parseFromString(xml,'application/xml');
}

// Utility from converter: canvas -> Blob
function canvasToBlob(canvas, mimeType) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), mimeType, 0.92);
  });
}

function configurePdfJs(pdfjs, workerSrc){
  if (!pdfjs || !pdfjs.getDocument) throw new Error('PDF.js loaded without getDocument');
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  }
  try {
    if ('disableWorker' in pdfjs) pdfjs.disableWorker = true;
  } catch {
    // Module namespace objects may be read-only; workerSrc is enough for modern builds.
  }
  window.pdfjsLib = pdfjs;
  return pdfjs;
}

function loadScript(src){
  return new Promise((resolve, reject)=>{
    const existing = Array.from(document.scripts).find(script => script.src === src);
    if (existing && window.pdfjsLib) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadPdfJs(){
  if (window.pdfjsLib?.getDocument) return configurePdfJs(window.pdfjsLib, PDFJS_GLOBAL_WORKER_SRC);

  try {
    await loadScript(PDFJS_GLOBAL_SCRIPT_SRC);
    if (window.pdfjsLib?.getDocument) return configurePdfJs(window.pdfjsLib, PDFJS_GLOBAL_WORKER_SRC);
  } catch (error) {
    console.warn('PDF.js global build failed to load:', error);
  }

  try {
    const modulePdfJs = await import(PDFJS_MODULE_SRC);
    return configurePdfJs(modulePdfJs, PDFJS_MODULE_WORKER_SRC);
  } catch (error) {
    console.warn('PDF.js module build failed to load:', error);
  }

  throw new Error('PDF.js failed to load. Check your connection and try importing the PDF again.');
}

async function ensurePdfJsConfigured(){
  if (window.pdfjsLib?.getDocument) return configurePdfJs(window.pdfjsLib, PDFJS_GLOBAL_WORKER_SRC);
  if (!pdfJsReadyPromise) pdfJsReadyPromise = loadPdfJs();
  return pdfJsReadyPromise;
}

// Convert a PDF File to slide items (uses pdfjsLib already loaded)
async function convertPdfFromFile(file, scale = 1.5, format = 'jpeg'){
  const pdfjs = await ensurePdfJsConfigured();
  setStatus(`Converting PDF: ${file.name}`);
  const array = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({data:new Uint8Array(array)}).promise;
  const total = pdf.numPages;
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = format === 'png' ? 'png' : 'jpg';
  const items = [];
  try {
    for (let i=1;i<=total;i++){
      setStatus(`Rendering page ${i} of ${total}...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (format === 'jpeg'){ ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); }
      await page.render({canvasContext:ctx, viewport}).promise;
      const blob = await canvasToBlob(canvas, mimeType);
      const url = URL.createObjectURL(blob);
      items.push({ name: `${file.name} - page ${i}`, url, type: mimeType, source:'pdf', pageNumber:i, pages:total, notes:'', file: null, filename:`page-${String(i).padStart(3,'0')}.${ext}` });
      page.cleanup?.();
    }
  } finally {
    await pdf.destroy?.();
  }
  return items;
}

// Convert PPTX using JSZip and canvas renderer (adapted from converter.html)
async function convertPptxFromFile(file, scale = 1, format = 'jpeg'){
  setStatus(`Converting PPTX: ${file.name}`);
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = format === 'png' ? 'png' : 'jpg';
  const results = [];

  const parser = new DOMParser();
  const slides = await getPptxSlideEntries(zip, parser);
  const slideCount = slides.length;
  await loadPptxFonts(zip);

  for (let i=0;i<slideCount;i++){
    setStatus(`Rendering slide ${i+1} of ${slideCount}...`);
    const blob = await renderSlideToCanvas(zip, slides[i], scale, mimeType);
    if (blob) results.push({ blob, filename: `slide-${String(i+1).padStart(3,'0')}.${ext}`, pageNumber: i+1 });
  }
  if (results.length === 0) throw new Error('Could not extract any slides from this PPTX.');
  return results.map(r=>{
    const url = URL.createObjectURL(r.blob);
    return { name: `${file.name} - slide ${r.pageNumber}`, url, type:mimeType, source:'pptx', pageNumber: r.pageNumber, pages: slideCount, notes:'', file: null };
  });
}

// Helper: render a single slide to canvas blob (from converter)
async function renderSlideToCanvas(zip, slideRef, scale, mimeType){
  const slidePath = typeof slideRef === 'object' ? slideRef.path : `ppt/slides/slide${slideRef}.xml`;
  const relsPath = typeof slideRef === 'object' ? slideRef.relsPath : getPptxRelsPath(slidePath);
  const slideXml = await zip.file(slidePath)?.async('string');
  if (!slideXml) return null;
  const presXml = await zip.file('ppt/presentation.xml')?.async('string');
  const parser = new DOMParser();

  let slideWidthEmu  = 9144000;
  let slideHeightEmu = 6858000;
  if (presXml){
    const presDoc = parser.parseFromString(presXml, 'application/xml');
    const sldSz = presDoc.getElementsByTagNameNS(PPTX_PRES_NS, 'sldSz')[0];
    if (sldSz){ slideWidthEmu  = parseInt(sldSz.getAttribute('cx')) || slideWidthEmu; slideHeightEmu = parseInt(sldSz.getAttribute('cy')) || slideHeightEmu; }
  }

  const EMU_TO_PX = 96 / 914400;
  const W = Math.round(slideWidthEmu  * EMU_TO_PX * scale);
  const H = Math.round(slideHeightEmu * EMU_TO_PX * scale);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,W,H);
  const slideDoc = parser.parseFromString(slideXml, 'application/xml');
  await applyBackground(ctx, zip, slideDoc, slidePath, relsPath, W, H, scale, parser);
  await renderImages(ctx, zip, slideDoc, slidePath, relsPath, W, H, slideWidthEmu, slideHeightEmu, scale, parser);
  renderTextShapes(ctx, slideDoc, W, H, slideWidthEmu, slideHeightEmu, scale);
  const blob = await canvasToBlob(canvas, mimeType);
  return blob;
}

async function applyBackground(ctx, zip, slideDoc, slidePath, relsPath, W, H, scale, parser){
  const drawNS = PPTX_DRAW_NS;
  const presNS = PPTX_PRES_NS;
  const bgElements = slideDoc.getElementsByTagNameNS(presNS, 'bg');
  if (bgElements.length === 0) { await tryLayoutBackground(ctx, zip, slidePath, relsPath, W, H, parser); return; }
  const bg = bgElements[0];
  const solidFill = bg.getElementsByTagNameNS(drawNS, 'solidFill')[0];
  if (solidFill){ const color = extractColor(solidFill, drawNS); if (color){ ctx.fillStyle = color; ctx.fillRect(0,0,W,H); } }
  const gradFill = bg.getElementsByTagNameNS(drawNS, 'gradFill')[0];
  if (gradFill){ const gsLst = gradFill.getElementsByTagNameNS(drawNS, 'gs'); if (gsLst.length>=2){ const grad = ctx.createLinearGradient(0,0,W,H); for (const gs of gsLst){ const pos = parseInt(gs.getAttribute('pos')||'0')/100000; const c = extractColor(gs, drawNS); if (c) grad.addColorStop(pos, c); } ctx.fillStyle = grad; ctx.fillRect(0,0,W,H); } }
  const blip = bg.getElementsByTagNameNS(drawNS, 'blip')[0];
  if (blip){
    const relId = getPptxRelationshipId(blip, 'embed');
    const relMap = await readPptxRelationships(zip, relsPath, parser);
    if (relId && relMap[relId]){
      await drawZipImage(ctx, zip, resolvePptxPath(slidePath, relMap[relId]), 0, 0, W, H);
    }
  }
}

async function tryLayoutBackground(ctx, zip, slidePath, relsPath, W, H, parser){
  const relsXml = await zip.file(relsPath)?.async('string'); if (!relsXml) return;
  const relsDoc = parser.parseFromString(relsXml, 'application/xml');
  const rels = relsDoc.getElementsByTagName('Relationship'); let layoutPath = null;
  for (const rel of rels){ if ((rel.getAttribute('Type')||'').includes('slideLayout')){ const target = rel.getAttribute('Target')||''; layoutPath = resolvePptxPath(slidePath, target); break; } }
  if (!layoutPath) return; const layoutXml = await zip.file(layoutPath)?.async('string'); if (!layoutXml) return;
  const drawNS = PPTX_DRAW_NS; const presNS = PPTX_PRES_NS; const layoutDoc = parser.parseFromString(layoutXml,'application/xml'); const bg = layoutDoc.getElementsByTagNameNS(presNS,'bg')[0]; if (!bg) return; const solidFill = bg.getElementsByTagNameNS(drawNS,'solidFill')[0]; if (solidFill){ const color = extractColor(solidFill, drawNS); if (color){ ctx.fillStyle = color; ctx.fillRect(0,0,W,H); } }
  const blip = bg.getElementsByTagNameNS(drawNS, 'blip')[0];
  if (blip){
    const relId = getPptxRelationshipId(blip, 'embed');
    const relMap = await readPptxRelationships(zip, getPptxRelsPath(layoutPath), parser);
    if (relId && relMap[relId]) await drawZipImage(ctx, zip, resolvePptxPath(layoutPath, relMap[relId]), 0, 0, W, H);
  }
}

function extractColor(el, drawNS){ const srgb = el.getElementsByTagNameNS(drawNS,'srgbClr')[0]; if (srgb) return '#' + srgb.getAttribute('val'); const preset = el.getElementsByTagNameNS(drawNS,'prstClr')[0]; if (preset){ const presetMap = { white:'#ffffff', black:'#000000', red:'#ff0000', blue:'#0000ff', green:'#008000', yellow:'#ffff00', orange:'#ffa500', purple:'#800080', gray:'#808080', grey:'#808080', lightGray:'#d3d3d3', darkGray:'#a9a9a9', navy:'#000080', teal:'#008080' }; return presetMap[preset.getAttribute('val')] || null; } return null; }

async function renderImages(ctx, zip, slideDoc, slidePath, relsPath, W, H, ewEmu, ehEmu, scale, parser){
  const drawNS  = PPTX_DRAW_NS;
  const presNS  = PPTX_PRES_NS;
  const pics = slideDoc.getElementsByTagNameNS(presNS,'pic'); if (pics.length===0) return;
  const relMap = await readPptxRelationships(zip, relsPath, parser);
  const EMU = 1 / 914400 * 96 * scale;
  for (const pic of pics){ try{ const blipFill = pic.getElementsByTagNameNS(drawNS,'blipFill')[0]; if (!blipFill) continue; const blip = blipFill.getElementsByTagNameNS(drawNS,'blip')[0]; if (!blip) continue; const rId = getPptxRelationshipId(blip, 'embed'); if (!rId) continue; const target = relMap[rId]; if (!target) continue; const mediaPath = resolvePptxPath(slidePath, target);
      const spPr = pic.getElementsByTagNameNS(drawNS,'spPr')[0] || pic.getElementsByTagNameNS(presNS,'spPr')[0]; if (!spPr) continue;
      const xfrm = spPr.getElementsByTagNameNS(drawNS,'xfrm')[0]; if (!xfrm) continue;
      const off = xfrm.getElementsByTagNameNS(drawNS,'off')[0]; const ext = xfrm.getElementsByTagNameNS(drawNS,'ext')[0]; if (!off || !ext) continue;
      const x = parseInt(off.getAttribute('x')||'0') * EMU; const y = parseInt(off.getAttribute('y')||'0') * EMU; const w = parseInt(ext.getAttribute('cx')||'0') * EMU; const h = parseInt(ext.getAttribute('cy')||'0') * EMU;
      await drawZipImage(ctx, zip, mediaPath, x, y, w, h);
    } catch (e) { /* skip */ } }
}

function normalizePptxTypeface(typeface){
  const clean = (typeface || '').trim();
  if (!clean || clean.startsWith('+')) return '';
  return clean.replace(/["\\]/g, '');
}

function getTypefaceFromNode(node, drawNS){
  if (!node) return '';
  for (const localName of ['latin', 'ea', 'cs', 'sym']){
    const fontNode = node.getElementsByTagNameNS(drawNS, localName)[0];
    const typeface = normalizePptxTypeface(fontNode?.getAttribute('typeface'));
    if (typeface) return typeface;
  }
  return '';
}

function getTextStyleFromProperties(rPr, drawNS, fallback, scale){
  const style = {...fallback};
  if (!rPr) return style;
  const sz = parseInt(rPr.getAttribute('sz') || '', 10);
  if (Number.isFinite(sz) && sz > 0) style.fontSize = sz / 100 * scale;
  if (rPr.hasAttribute('b')) style.bold = ['1', 'true'].includes((rPr.getAttribute('b') || '').toLowerCase());
  if (rPr.hasAttribute('i')) style.italic = ['1', 'true'].includes((rPr.getAttribute('i') || '').toLowerCase());
  const typeface = getTypefaceFromNode(rPr, drawNS);
  if (typeface) style.typeface = typeface;
  const fillEl = rPr.getElementsByTagNameNS(drawNS, 'solidFill')[0];
  if (fillEl) {
    const color = extractColor(fillEl, drawNS);
    if (color) style.color = color;
  }
  return style;
}

function getRunText(run, drawNS){
  return Array.from(run.getElementsByTagNameNS(drawNS, 't')).map(t => t.textContent || '').join('');
}

function buildCanvasFont(style){
  const family = style.typeface
    ? `"${style.typeface}", "Segoe UI", Arial, sans-serif`
    : '"Segoe UI", Arial, sans-serif';
  const fontStyle = style.italic ? 'italic ' : '';
  const weight = style.bold ? '700' : '400';
  return `${fontStyle}${weight} ${Math.max(style.fontSize, 8)}px ${family}`;
}

function collectPptxFontsFromXml(xml, families){
  for (const match of xml.matchAll(/\btypeface="([^"]+)"/g)){
    const typeface = normalizePptxTypeface(match[1]);
    if (typeface) families.add(typeface);
  }
}

async function loadPptxFonts(zip){
  if (!document.fonts) return;
  const families = new Set();
  const xmlPaths = Object.keys(zip.files).filter(path =>
    (/^ppt\/(slides|slideLayouts|slideMasters)\//.test(path) && path.endsWith('.xml')) || path === 'ppt/presentation.xml'
  );
  for (const path of xmlPaths){
    const file = zip.file(path);
    if (!file) continue;
    try {
      collectPptxFontsFromXml(await file.async('string'), families);
    } catch {
      // Ignore unreadable non-slide parts.
    }
  }

  const loads = [];
  for (const family of families){
    if (loadedPptxFontFamilies.has(family)) continue;
    loadedPptxFontFamilies.add(family);
    loads.push(document.fonts.load(`400 24px "${family}"`));
    loads.push(document.fonts.load(`700 24px "${family}"`));
    loads.push(document.fonts.load(`italic 400 24px "${family}"`));
    loads.push(document.fonts.load(`italic 700 24px "${family}"`));
  }
  if (!loads.length) return;
  await Promise.race([
    Promise.allSettled(loads),
    new Promise(resolve => setTimeout(resolve, 1600))
  ]);
}

function renderTextShapes(ctx, slideDoc, W, H, ewEmu, ehEmu, scale){
  const drawNS = PPTX_DRAW_NS;
  const presNS = PPTX_PRES_NS;
  const EMU    = 1 / 914400 * 96 * scale;
  const shapes = slideDoc.getElementsByTagNameNS(presNS, 'sp');
  for (const sp of shapes){
    try{
      const spPr = sp.getElementsByTagNameNS(drawNS,'spPr')[0] || sp.getElementsByTagNameNS(presNS,'spPr')[0];
      const txBody = sp.getElementsByTagNameNS(presNS,'txBody')[0] || sp.getElementsByTagNameNS(drawNS,'txBody')[0];
      if (!spPr || !txBody) continue;
      const xfrm = spPr.getElementsByTagNameNS(drawNS,'xfrm')[0];
      if (!xfrm) continue;
      const off = xfrm.getElementsByTagNameNS(drawNS,'off')[0];
      const ext = xfrm.getElementsByTagNameNS(drawNS,'ext')[0];
      if (!off || !ext) continue;

      const x = parseInt(off.getAttribute('x')||'0') * EMU;
      const y = parseInt(off.getAttribute('y')||'0') * EMU;
      const w = parseInt(ext.getAttribute('cx')||'0') * EMU;
      const h = parseInt(ext.getAttribute('cy')||'0') * EMU;
      const solidFill = spPr.getElementsByTagNameNS(drawNS,'solidFill')[0];
      if (solidFill){
        const color = extractColor(solidFill, drawNS);
        if (color){ ctx.fillStyle = color; ctx.fillRect(x,y,w,h); }
      }

      const paras = txBody.getElementsByTagNameNS(drawNS,'p');
      let curY = y + 4 * scale;
      const baseStyle = {fontSize:18 * scale, bold:false, italic:false, color:'#222222', typeface:''};
      for (const para of paras){
        const runs = para.getElementsByTagNameNS(drawNS,'r');
        if (runs.length===0){ curY += 14 * scale; continue; }
        const endParaRPr = para.getElementsByTagNameNS(drawNS, 'endParaRPr')[0];
        const paraStyle = getTextStyleFromProperties(endParaRPr, drawNS, baseStyle, scale);
        const fragments = [];

        for (const run of runs){
          const text = getRunText(run, drawNS);
          if (!text) continue;
          const rPr = run.getElementsByTagNameNS(drawNS,'rPr')[0];
          fragments.push({text, style:getTextStyleFromProperties(rPr, drawNS, paraStyle, scale)});
        }

        const paraText = fragments.map(fragment => fragment.text).join('');
        const textStyle = fragments.find(fragment => fragment.text.trim())?.style || paraStyle;
        if (!paraText.trim()){ curY += textStyle.fontSize * 1.2; continue; }

        ctx.save();
        ctx.font = buildCanvasFont(textStyle);
        ctx.fillStyle = textStyle.color;
        ctx.textBaseline = 'top';
        const words = paraText.split(/\s+/);
        let line = '';
        const lineHeight = textStyle.fontSize * 1.35;
        for (const word of words){
          const test = line ? line + ' ' + word : word;
          const metrics = ctx.measureText(test);
          if (metrics.width > w - 8 * scale && line){
            if (curY + lineHeight < y + h){
              ctx.fillText(line, x + 4 * scale, curY);
              curY += lineHeight;
            }
            line = word;
          } else {
            line = test;
          }
        }
        if (line && curY + lineHeight < y + h){
          ctx.fillText(line, x + 4 * scale, curY);
          curY += lineHeight;
        }
        ctx.restore();
      }
    } catch(e){ /* skip */ }
  }
}

function setStatus(message){
  if (statusEl) statusEl.textContent = message;
}

function getElementsByTagNameAnyNS(parent, localName){
  const found = Array.from(parent.getElementsByTagName(localName));
  return found.length ? found : Array.from(parent.getElementsByTagNameNS('*', localName));
}

function getElementByTagNameAnyNS(parent, localName){
  const found = getElementsByTagNameAnyNS(parent, localName);
  return found[0] || null;
}

function normalizePptxPath(base, relative){
  const parts = base.split('/');
  if (parts.length && !base.endsWith('/')) parts.pop();
  for (const segment of relative.split('/')){
    if (segment === '..') parts.pop();
    else if (segment && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

function resolvePptxPath(base, target){
  const clean = (target || '').replace(/\\/g,'/').split('#')[0];
  if (!clean) return '';
  if (clean.startsWith('/')) return clean.slice(1);
  if (clean.startsWith('ppt/')) return clean;
  return normalizePptxPath(base, clean);
}

function getPptxRelsPath(partPath){
  const clean = partPath.replace(/\\/g,'/');
  const slash = clean.lastIndexOf('/');
  const dir = slash === -1 ? '' : clean.slice(0, slash);
  const filename = slash === -1 ? clean : clean.slice(slash + 1);
  return dir ? `${dir}/_rels/${filename}.rels` : `_rels/${filename}.rels`;
}

function getPptxRelationshipId(node, name){
  return node.getAttributeNS(PPTX_REL_NS, name) || node.getAttribute(`r:${name}`) || node.getAttribute(name);
}

async function readPptxRelationships(zip, relsPath, parser){
  const relsXml = await zip.file(relsPath)?.async('string');
  if (!relsXml) return {};
  const relsDoc = parser.parseFromString(relsXml, 'application/xml');
  const map = {};
  for (const rel of getElementsByTagNameAnyNS(relsDoc, 'Relationship')){
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) map[id] = target;
  }
  return map;
}

function getPptxSlideRelIds(presDoc, presXml){
  let ids = getElementsByTagNameAnyNS(presDoc, 'sldId')
    .map(node => node.getAttributeNS(PPTX_REL_NS, 'id') || node.getAttribute('r:id'))
    .filter(Boolean);
  if (!ids.length) ids = Array.from(presXml.matchAll(/<[^>]*sldId[^>]*\sr:id="([^"]+)"/g), m => m[1]);
  return ids;
}

function getPptxSlideNumber(path){
  return parseInt(/\/slide(\d+)\.xml$/i.exec(path)?.[1] || '0', 10);
}

async function getPptxSlideEntries(zip, parser){
  const presXml = await zip.file('ppt/presentation.xml')?.async('string');
  if (!presXml) throw new Error('Not a valid PPTX file (missing ppt/presentation.xml)');
  const presDoc = parser.parseFromString(presXml, 'application/xml');
  const slideRelIds = getPptxSlideRelIds(presDoc, presXml);
  const relMap = await readPptxRelationships(zip, 'ppt/_rels/presentation.xml.rels', parser);
  let entries = slideRelIds
    .map(relId => relMap[relId] ? resolvePptxPath('ppt/presentation.xml', relMap[relId]) : '')
    .filter(path => path && zip.file(path))
    .map(path => ({ path, relsPath: getPptxRelsPath(path) }));

  if (!entries.length) {
    entries = Object.keys(zip.files)
      .filter(path => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort((a,b)=>getPptxSlideNumber(a)-getPptxSlideNumber(b))
      .map(path => ({ path, relsPath: getPptxRelsPath(path) }));
  }
  if (!entries.length) throw new Error('No slides found in this PPTX.');
  return entries;
}

function getImageMimeFromPath(path){
  const ext = path.split('.').pop().toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/jpeg';
}

async function drawZipImage(ctx, zip, imagePath, x, y, width, height){
  if (!imagePath || width <= 0 || height <= 0) return false;
  const mediaFile = zip.file(imagePath);
  if (!mediaFile) return false;
  const imgBytes = await mediaFile.async('uint8array');
  const imgBlob = new Blob([imgBytes], { type: getImageMimeFromPath(imagePath) });
  const imgUrl = URL.createObjectURL(imgBlob);
  return new Promise(resolve=>{
    const img = new Image();
    img.onload = ()=>{
      ctx.drawImage(img, x, y, width, height);
      URL.revokeObjectURL(imgUrl);
      resolve(true);
    };
    img.onerror = ()=>{
      URL.revokeObjectURL(imgUrl);
      resolve(false);
    };
    img.src = imgUrl;
  });
}

function emuToPx(value){
  return Math.round((parseInt(value,10) || 0) / EMU_PER_PX);
}

function getColorFromNode(node){
  if (!node) return null;
  const srgb = node.querySelector('a\:srgbClr, srgbClr');
  if (srgb?.getAttribute('val')) return `#${srgb.getAttribute('val')}`;
  const scheme = node.querySelector('a\:schemeClr, schemeClr');
  const val = scheme?.getAttribute('val');
  if (val === 'bg1') return '#111';
  if (val === 'tx1') return '#eee';
  if (val === 'accent1') return '#7a4fff';
  return null;
}

function getSolidFillColor(node){
  if (!node) return null;
  const solidFill = getElementByTagNameAnyNS(node, 'solidFill');
  return getColorFromNode(solidFill);
}

async function getBackgroundImage(srcTarget, zip){
  if (!srcTarget) return null;
  const targetPath = srcTarget.replace(/^\//,'');
  const file = zip.file(targetPath);
  if (!file) return null;
  const ext = targetPath.split('.').pop().toLowerCase();
  const data = await file.async('base64');
  return `data:image/${ext === 'emf' ? 'png' : ext};base64,${data}`;
}

function getShapeBounds(node){
  const xfrm = getElementByTagNameAnyNS(node, 'xfrm');
  if (!xfrm) return null;
  const off = getElementByTagNameAnyNS(xfrm, 'off');
  const ext = getElementByTagNameAnyNS(xfrm, 'ext');
  if (!off || !ext) return null;
  return {
    x: emuToPx(off.getAttribute('x')),
    y: emuToPx(off.getAttribute('y')),
    width: emuToPx(ext.getAttribute('cx')),
    height: emuToPx(ext.getAttribute('cy'))
  };
}

function getSlideBackgroundColor(doc){
  const bg = getElementByTagNameAnyNS(doc, 'bg');
  if (!bg) return '#111';
  const fill = getElementByTagNameAnyNS(bg, 'solidFill');
  const color = getColorFromNode(fill);
  return color || '#111';
}

function collectSlideText(node){
  return getElementsByTagNameAnyNS(node, 't').map(t=>t.textContent || '').join(' ').trim();
}

async function createImageFromZip(zip, target){
  const file = zip.file(target);
  if (!file) return null;
  const ext = target.split('.').pop().toLowerCase();
  const data = await file.async('base64');
  return `data:image/${ext === 'emf' ? 'png' : ext};base64,${data}`;
}

async function extractPptxSlides(file){
  return convertPptxFromFile(file, 1, 'jpeg');
}

async function processMediaFile(file){
  const lower = file.name.toLowerCase();
  try {
    if (lower.endsWith('.pdf')){
      setStatus(`Loading PDF: ${file.name}`);
      const pages = await convertPdfFromFile(file, 1.5, 'jpeg');
      if (pages.length){
        media.push(...pages);
      } else {
        console.warn('PDF conversion produced no pages for', file.name);
        media.push({name:file.name,type:'image/pdf',url:'',source:'pdf',pageNumber:0,pages:0,notes:''});
      }
      renderQueues();
    } else if (lower.endsWith('.pptx')){
      setStatus(`Loading PPTX: ${file.name}`);
      const slides = await convertPptxFromFile(file, 1, 'jpeg');
      if (slides.length){
        media.push(...slides);
      } else {
        console.warn('PPTX conversion produced no slides for', file.name);
        media.push({name:file.name,type:'image/pptx',url:'',source:'pptx',pageNumber:0,pages:0,notes:''});
      }
      renderQueues();
    } else {
      const url = URL.createObjectURL(file);
      const item = {name:file.name,url,type:file.type,file:file,durationFormatted:'Loading...',pages:1,notes:''};
      media.push(item);
      loadFileMetadata(item, renderQueues);
      renderQueues();
    }
  } catch (error) {
    console.error('Media processing failed for', file.name, error);
    setStatus(`Failed to load ${file.name}: ${error.message || 'unknown error'}`);
    const fallback = {name:`${file.name} (failed)`,url:'',type:'error',source:'error',pageNumber:0,pages:0,notes:''};
    media.push(fallback);
    renderQueues();
  } finally {
    setTimeout(()=> setStatus(''), 4000);
  }
}

function faIcon(name) {
  const el = document.createElement('span');
  el.className = 'fa-icon';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `-webkit-mask-image:url(icons/${name}.svg);mask-image:url(icons/${name}.svg)`;
  return el;
}

function createListItem(item, index, type){
  const li = document.createElement('li');
  li.dataset.index = index;
  li.classList.toggle('active', index === (type === 'music'? currentSongIndex : currentMediaIndex));
  if (item.skip && (type === 'music' || type === 'media')) li.classList.add('skipped');
  if (item.breakpoint && (type === 'music' || type === 'media')) li.classList.add('has-breakpoint');

  // Stream items (YouTube/Spotify/embed) get a warning highlight
  if (type === 'music' && (item.source === 'youtube' || item.source === 'spotify')) {
    li.classList.add('stream-item');
  }
  if (type === 'media' && (item.source === 'youtube-media' || item.source === 'gdrive')) {
    li.classList.add('stream-item');
  }

  const underlay = document.createElement('div');
  underlay.className = 'progress-underlay';
  li.appendChild(underlay);

  const content = document.createElement('div');
  content.className = 'item-content';

  const info = document.createElement('div');
  info.className = 'item-info';
  const title = document.createElement('div');
  title.textContent = item.name;
  title.style.fontWeight = '700';
  const details = document.createElement('div');
  details.className = 'detail-group';
  const typeText = document.createElement('span');
  if (item.source === 'youtube') {
    const ytLabel = item.youtubeType === 'playlist' ? 'YouTube Playlist' : item.youtubeType === 'video-in-playlist' ? 'YouTube' : 'YouTube';
    typeText.textContent = ytLabel;
    typeText.className = 'source-badge badge-youtube';
  } else if (item.source === 'spotify') {
    typeText.textContent = 'Spotify';
    typeText.className = 'source-badge badge-spotify';
  } else if (item.type.startsWith('audio/')) {
    typeText.textContent = item.durationFormatted || 'Loading...';
  } else if (item.source === 'youtube-media') {
    typeText.textContent = 'YouTube';
    typeText.className = 'source-badge badge-youtube';
  } else if (item.source === 'gdrive') {
    typeText.textContent = 'Google Drive';
    typeText.className = 'source-badge badge-gdrive';
  } else if (item.source === 'gslides') {
    typeText.textContent = 'Google Slides';
    typeText.className = 'source-badge badge-gslides';
  } else if (item.source === 'image-url') {
    typeText.textContent = 'Web Image';
    typeText.className = 'source-badge badge-web';
  } else if (item.type.startsWith('video/')) {
    typeText.textContent = item.durationFormatted || 'Loading...';
  } else if (item.source === 'pdf') {
    typeText.textContent = `Page ${item.pageNumber}/${item.pages}`;
  } else if (item.source === 'pptx') {
    typeText.textContent = `Slide ${item.pageNumber}/${item.pages}`;
  } else if (item.pages) {
    typeText.textContent = `${item.pages} slide${item.pages===1?'':'s'}`;
  } else {
    typeText.textContent = 'Image';
  }
  details.appendChild(typeText);

  // Warning badges
  if (type === 'music') {
    if (item.source === 'spotify') {
      const warn = document.createElement('span');
      warn.className = 'stream-warning stream-warning-amber';
      warn.appendChild(document.createTextNode('⚠ Full playback requires a Spotify login  '));
      const loginLink = document.createElement('a');
      loginLink.href = 'https://accounts.spotify.com/';
      loginLink.target = '_blank';
      loginLink.rel = 'noopener noreferrer';
      loginLink.className = 'spotify-login-link';
      loginLink.textContent = 'Log in to Spotify →';
      warn.appendChild(loginLink);
      details.appendChild(warn);
    } else if (item.source === 'youtube' && item.youtubeType === 'playlist') {
      const warn = document.createElement('span');
      warn.className = 'stream-warning';
      warn.textContent = '⚠ Expanding playlist...';
      details.appendChild(warn);
    }
  }
  if (type === 'media') {
    const warns = [];
    if (item.source === 'youtube-media') {
      warns.push({ text: '⚠ Autoplay may be blocked; no auto-advance detection', cls: 'stream-warning' });
    } else if (item.source === 'gdrive') {
      warns.push({ text: '⚠ File must be publicly shared in Google Drive', cls: 'stream-warning stream-warning-amber' });
    } else if (item.source === 'gslides') {
      warns.push({ text: '⚠ Presentation must be published to the web in Google Slides', cls: 'stream-warning stream-warning-red' });
      warns.push({ text: '⚠ Slide navigation and timing are controlled by Google Slides, not ECP', cls: 'stream-warning stream-warning-red' });
    } else if (item.source === 'image-url') {
      warns.push({ text: '⚠ Served from an external URL — may break if the source changes or goes offline', cls: 'stream-warning stream-warning-amber' });
    }
    warns.forEach(({ text, cls }) => {
      const warn = document.createElement('span');
      warn.className = cls;
      warn.textContent = text;
      details.appendChild(warn);
    });
  }

  info.appendChild(title);
  info.appendChild(details);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  if (type === 'music' || type === 'media') {
    const skipLabel = document.createElement('label');
    skipLabel.className = 'skip-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!item.skip;
    checkbox.addEventListener('click', e => {
      e.stopPropagation();
      item.skip = checkbox.checked;
      li.classList.toggle('skipped', !!item.skip);
      updateButtonStates();
    });
    skipLabel.appendChild(checkbox);
    skipLabel.appendChild(document.createTextNode('Skip'));
    actions.appendChild(skipLabel);
  }

  if (type === 'music') {
    const isMQueued = queuedMusicNext === item;
    const mqBtn = document.createElement('button');
    mqBtn.className = 'queue-next-btn' + (isMQueued ? ' queued' : '');
    mqBtn.title = 'Queue this to play next after current song finishes';
    mqBtn.appendChild(faIcon('forward-step'));
    mqBtn.appendChild(document.createTextNode(isMQueued ? ' Queued' : ' Queue'));
    mqBtn.addEventListener('click', e => {
      e.stopPropagation();
      queuedMusicNext = (queuedMusicNext === item) ? null : item;
      renderMusicQueue();
    });
    actions.appendChild(mqBtn);
  }

  if (type === 'media') {
    const isQueued = queuedMediaNext === item;
    const queueBtn = document.createElement('button');
    queueBtn.className = 'queue-next-btn' + (isQueued ? ' queued' : '');
    queueBtn.title = 'Queue this to play next after current item finishes';
    queueBtn.appendChild(faIcon('forward-step'));
    queueBtn.appendChild(document.createTextNode(isQueued ? ' Queued' : ' Queue'));
    queueBtn.addEventListener('click', e => {
      e.stopPropagation();
      queuedMediaNext = (queuedMediaNext === item) ? null : item;
      renderMediaQueue();
    });
    actions.appendChild(queueBtn);
  }

  if (type === 'music' || type === 'media') {
    const bpBtn = document.createElement('button');
    bpBtn.type = 'button';
    bpBtn.className = 'breakpoint-btn' + (item.breakpoint ? ' bp-active' : '');
    bpBtn.title = item.breakpoint ? 'Remove breakpoint' : 'Set breakpoint — autoplay stops here';
    bpBtn.appendChild(faIcon('hand'));
    bpBtn.addEventListener('click', e => {
      e.stopPropagation();
      const setting = !item.breakpoint;
      item.breakpoint = setting;
      const queue = type === 'music' ? musicQueue : mediaQueue;
      if (type === 'music') renderMusicQueue(); else renderMediaQueue();
      if (setting) {
        const newLi = queue.querySelector(`[data-index="${index}"]`);
        if (newLi) { newLi.classList.add('bp-just-set'); }
      }
    });
    actions.appendChild(bpBtn);
  }

  const up = document.createElement('button'); up.title = 'Move up'; up.appendChild(faIcon('arrow-up'));
  const down = document.createElement('button'); down.title = 'Move down'; down.appendChild(faIcon('arrow-down'));
  const remove = document.createElement('button'); remove.title = 'Delete'; remove.appendChild(faIcon('trash'));
  up.addEventListener('click', e=>{ e.stopPropagation(); moveItem(type, index, -1); });
  down.addEventListener('click', e=>{ e.stopPropagation(); moveItem(type, index, 1); });
  remove.addEventListener('click', e=>{ e.stopPropagation(); removeItem(type, index); });
  actions.append(up, down, remove);

  content.append(info, actions);
  li.appendChild(content);

  li.addEventListener('click', ()=>{
    if (type === 'music') {
      if (item.breakpoint && !confirm(`⛔ "${item.name}" is a breakpoint.\n\nProceed past this breakpoint?`)) return;
      playSongAt(index);
    } else {
      if (item.breakpoint && !confirm(`⛔ "${item.name}" is a breakpoint.\n\nProceed past this breakpoint?`)) return;
      showMediaAt(index);
    }
  });

  return li;
}

function moveItem(type, index, offset){
  const list = type === 'music' ? songs : media;
  let currentIndex = type === 'music' ? currentSongIndex : currentMediaIndex;
  const newIndex = index + offset;
  if (newIndex < 0 || newIndex >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(newIndex, 0, item);
  if (currentIndex === index) {
    currentIndex = newIndex;
  } else if (currentIndex > index && currentIndex <= newIndex) {
    currentIndex -= 1;
  } else if (currentIndex < index && currentIndex >= newIndex) {
    currentIndex += 1;
  }
  if (type === 'music') currentSongIndex = currentIndex;
  else currentMediaIndex = currentIndex;
  renderQueues();
}

function removeItem(type, index){
  const list = type === 'music' ? songs : media;
  const currentIndex = type === 'music' ? currentSongIndex : currentMediaIndex;
  if (type === 'music' && queuedMusicNext === list[index]) queuedMusicNext = null;
  if (type === 'media' && queuedMediaNext === list[index]) queuedMediaNext = null;
  list.splice(index, 1);
  if (type === 'music') {
    if (currentIndex === index) { musicAudio.pause(); musicPlaying = false; currentSongIndex = -1; }
    else if (currentIndex > index) currentSongIndex--;
  } else {
    if (currentIndex === index) { stopMediaLoop(); currentMediaIndex = -1; }
    else if (currentIndex > index) currentMediaIndex--;
  }
  renderQueues();
}

function renderQueues(){
  renderMusicQueue();
  renderMediaQueue();
  updateMediaNotesUI();
}

function getSelectedMediaItem(){
  return currentMediaIndex >= 0 && currentMediaIndex < media.length ? media[currentMediaIndex] : null;
}

function updateMediaNotesUI(){
  if (!mediaNotes) return;
  const item = getSelectedMediaItem();
  mediaNotes.disabled = !item;
  mediaNotes.value = item?.notes || '';
  mediaNotes.placeholder = item ? `Notes for ${item.name}` : 'Select an image or slide to edit notes';
}

if (mediaNotes) {
  mediaNotes.addEventListener('input', ()=>{
    const item = getSelectedMediaItem();
    if (item) item.notes = mediaNotes.value;
  });
}

musicFiles.addEventListener('change', e=>{
  const files = Array.from(e.target.files);
  files.forEach(f=>{
    const url = URL.createObjectURL(f);
    const item = {name:f.name,url, type:f.type,file:f, durationFormatted:'Loading...'};
    songs.push(item);
    loadFileMetadata(item, renderQueues);
  });
  renderQueues();
});

const musicUrlInput = document.getElementById('musicUrlInput');
const musicUrlAdd = document.getElementById('musicUrlAdd');
if (musicUrlAdd) {
  musicUrlAdd.addEventListener('click', () => {
    const url = musicUrlInput?.value?.trim();
    if (!url) return;
    addUrlToQueue(url);
    if (musicUrlInput) musicUrlInput.value = '';
  });
}
if (musicUrlInput) {
  musicUrlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const url = musicUrlInput.value.trim();
      if (!url) return;
      addUrlToQueue(url);
      musicUrlInput.value = '';
    }
  });
}

const mediaUrlInput = document.getElementById('mediaUrlInput');
const mediaUrlAdd = document.getElementById('mediaUrlAdd');
if (mediaUrlAdd) {
  mediaUrlAdd.addEventListener('click', () => {
    const url = mediaUrlInput?.value?.trim();
    if (!url) return;
    addMediaUrl(url);
    if (mediaUrlInput) mediaUrlInput.value = '';
  });
}
if (mediaUrlInput) {
  mediaUrlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const url = mediaUrlInput.value.trim();
      if (!url) return;
      addMediaUrl(url);
      mediaUrlInput.value = '';
    }
  });
}

soundboardFiles.addEventListener('change', e=>{
  const files = Array.from(e.target.files);
  files.forEach(f=>{
    const url = URL.createObjectURL(f);
    const item = {name:f.name,url, type:f.type,file:f, durationFormatted:'Loading...'};
    soundboardSounds.push(item);
    loadFileMetadata(item, renderSoundboardGrid);
    analyzeSbPeak(item); // begin analysis in background so dB label appears quickly
  });
  renderSoundboardGrid();
});

function renderMusicQueue(){
  musicQueue.innerHTML = '';
  songs.forEach((s,i)=>{
    const li = createListItem(s,i,'music');
    musicQueue.appendChild(li);
  });
  updateQueueProgress('music');
}

function makeSoundboardButton(s) {
  const item = document.createElement('div');
  item.className = 'soundboard-item';
  item.dataset.sbUrl = s.url;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'soundboard-button';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'sb-filename';
  nameSpan.textContent = addSoftHyphens(s.name);

  const normSpan = document.createElement('span');
  normSpan.className = 'sb-norm-label';
  applyNormLabel(normSpan, s);

  const durSpan = document.createElement('span');
  durSpan.className = 'sb-duration-label';
  durSpan.textContent = s.duration !== undefined ? formatSbDuration(s.duration) : '…';

  // Lazy-load duration for sounds whose metadata hasn't been read yet (e.g. preset imports)
  if (s.duration === undefined && s.url && !s._loadingDuration) {
    s._loadingDuration = true;
    const a = new Audio();
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => {
      s.duration = a.duration;
      s._loadingDuration = false;
      updateSbDurationLabel(s.url, s.duration);
      a.src = '';
    });
    a.src = s.url;
  }

  button.append(nameSpan, normSpan, durSpan);
  button.addEventListener('click', () => { playSoundboardItem(s); });

  const sbActions = document.createElement('div');
  sbActions.className = 'sb-actions';

  const starBtn = document.createElement('button');
  starBtn.type = 'button';
  starBtn.className = 'sb-star-btn' + (s.starred ? ' starred' : '');
  starBtn.title = s.starred ? 'Unstar' : 'Star';
  starBtn.appendChild(faIcon('star'));
  starBtn.addEventListener('click', e => {
    e.stopPropagation();
    s.starred = !s.starred;
    renderSoundboardGrid();
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'sb-delete-btn';
  deleteBtn.title = 'Delete';
  deleteBtn.appendChild(faIcon('xmark'));
  deleteBtn.addEventListener('click', e => {
    e.stopPropagation();
    const idx = soundboardSounds.indexOf(s);
    if (idx !== -1) soundboardSounds.splice(idx, 1);
    renderSoundboardGrid();
  });

  sbActions.append(starBtn, deleteBtn);
  item.append(button, sbActions);
  return item;
}

function renderSoundboardGrid(){
  if (soundboardGrid) {
    soundboardGrid.innerHTML = '';
    soundboardSounds.forEach(s => soundboardGrid.appendChild(makeSoundboardButton(s)));
  }
  if (announceSoundboardGrid) {
    announceSoundboardGrid.innerHTML = '';
    soundboardSounds.forEach(s => announceSoundboardGrid.appendChild(makeSoundboardButton(s)));
  }
  updateIntercomSoundCueSelect();
  renderStarredSoundsCP();
}

function renderStarredSoundsCP() {
  const grid = document.getElementById('cpStarredGrid');
  const section = document.getElementById('cpStarredSection');
  if (!grid || !section) return;
  const starred = soundboardSounds.filter(s => s.starred);
  section.style.display = starred.length ? '' : 'none';
  grid.innerHTML = '';
  starred.forEach(s => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'soundboard-button sb-cp-btn';
    btn.dataset.sbUrl = s.url;
    btn.textContent = addSoftHyphens(s.name);
    btn.addEventListener('click', () => { playSoundboardItem(s); });
    grid.appendChild(btn);
  });
}

function updateIntercomSoundCueSelect() {
  const select = document.getElementById('intercomSoundCueSelect');
  if (!select) return;
  const prev = select.value;
  select.innerHTML = '<option value="">None</option>';
  soundboardSounds.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
  if (prev && soundboardSounds.some(s => s.name === prev)) select.value = prev;
}

function playIntercomSoundCue(callback) {
  const cueSelect = document.getElementById('intercomSoundCueSelect');
  const cueName = cueSelect?.value || '';
  if (!cueName) { if (callback) callback(); return; }
  const sound = soundboardSounds.find(s => s.name === cueName);
  if (!sound) { if (callback) callback(); return; }
  playSoundboardItem(sound, callback);
}

function playSongAt(i){
  if (i<0 || i>=songs.length) return;

  const song = songs[i];

  // Whether we're navigating within an already-expanded YouTube playlist (no full re-init needed)
  const stayingInYtPlaylist = song.source === 'youtube' &&
    song.youtubeType === 'video-in-playlist' &&
    ytExpandedStart >= 0;

  // Set currentSongIndex BEFORE deactivating so updateStreamVisibility sees the new song
  currentSongIndex = i;

  // Deactivate outgoing source players when switching type
  if (song.source !== 'youtube') deactivateYouTubePlayer();
  if (song.source !== 'spotify') deactivateSpotifyPlayer();

  if (song.source === 'youtube') {
    if (stayingInYtPlaylist && ytPlayerReady) {
      loadYouTubeItem(song);
      musicPlaying = true;
      updateMusicUI();
      updateButtonStates();
    } else {
      activateYouTubeItem(song);
      musicPlaying = true;
      updateMusicUI();
      updateButtonStates();
    }
    return;
  }
  if (song.source === 'spotify') {
    activateSpotifyItem(song);
    musicPlaying = true;
    updateMusicUI();
    updateButtonStates();
    return;
  }

  const useTransition = musicTransition && musicTransition.checked;
  const isPlaying = musicPlaying && musicAudio.src && !musicAudio.paused;

  if (useTransition && isPlaying) {
    // Fade out current song
    const oldVolume = musicAudio.volume;
    const steps = 15;
    let step = 0;
    const fadeInterval = setInterval(() => {
      step++;
      musicAudio.volume = Math.max(0, oldVolume * (1 - step / steps));
      if (step >= steps) {
        clearInterval(fadeInterval);
        
        musicAudio.src = songs[i].url;
        if (musicGainNode) musicGainNode.gain.value = 0; else try { musicAudio.volume = 0; } catch {}
        musicAudio.play().catch(() => {});
        musicAudioContext?.resume().catch(() => {});
        
        // Fade in new song
        const targetVolume = (parseFloat(masterVolume?.value) || 1) * (parseFloat(musicVolume?.value) || 1);
        let inStep = 0;
        const fadeInInterval = setInterval(() => {
          inStep++;
          const v = Math.min(targetVolume, targetVolume * (inStep / steps));
          if (musicGainNode) musicGainNode.gain.value = v; else try { musicAudio.volume = v; } catch {}
          if (inStep >= steps) {
            clearInterval(fadeInInterval);
            if (musicGainNode) musicGainNode.gain.value = targetVolume; else try { musicAudio.volume = targetVolume; } catch {}
          }
        }, 300 / steps);
      }
    }, 300 / steps);
  } else {
    musicAudio.src = songs[i].url;
    musicAudio.play().catch(() => {});
    musicAudioContext?.resume().catch(() => {});
    applyVolumeSettings();
  }
  
  musicPlaying = true;
  updateMusicUI();
  updateButtonStates();
}

function findNextPlayableSongIndex(startIndex){
  let i = startIndex + 1;
  while (i < songs.length){
    if (!songs[i].skip) return i;
    i += 1;
  }
  return -1;
}

function findPreviousPlayableSongIndex(startIndex){
  let i = startIndex - 1;
  while (i >= 0){
    if (!songs[i].skip) return i;
    i -= 1;
  }
  return -1;
}

musicPlay.addEventListener('click', ()=>{
  if (currentSongIndex === -1 || songs[currentSongIndex]?.skip) {
    const startIndex = findNextPlayableSongIndex(currentSongIndex);
    if (startIndex !== -1) playSongAt(startIndex);
  } else {
    const current = songs[currentSongIndex];
    if (current?.source === 'youtube' && ytPlayerReady && ytPlayer?.playVideo) {
      try { ytPlayer.playVideo(); } catch {}
    } else if (current?.source === 'spotify' && spotifyController) {
      try { spotifyController.play(); } catch {}
    } else {
      musicAudio.play();
    }
  }
  musicPlaying = true;
  updateMusicUI();
  updateButtonStates();
});
musicPause.addEventListener('click', ()=>{
  const current = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  if (current?.source === 'youtube' && ytPlayerReady && ytPlayer?.pauseVideo) {
    try { ytPlayer.pauseVideo(); } catch {}
  } else if (current?.source === 'spotify' && spotifyController) {
    try { spotifyController.pause(); } catch {}
  } else {
    musicAudio.pause();
  }
  musicPlaying = false;
  updateButtonStates();
});

if (musicLoopModeSelect) {
  musicLoopModeSelect.addEventListener('change', ()=>{
    musicLoopMode = musicLoopModeSelect.value || 'off';
  });
}

musicShuffleButton.addEventListener('click', ()=>{
  const currentSong = songs[currentSongIndex];
  songs = songs.sort(()=>Math.random()-0.5);
  currentSongIndex = currentSong ? songs.indexOf(currentSong) : -1;
  renderMusicQueue();
});

// Music previous/next navigation
musicPrev.addEventListener('click', ()=>{
  const current = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  if (current?.source === 'youtube' && current.youtubeType === 'video-in-playlist' && ytPlayerReady && ytPlayer?.previousVideo) {
    try { ytPlayer.previousVideo(); return; } catch {}
  }
  const prevIndex = currentSongIndex === -1 ? findPreviousPlayableSongIndex(songs.length) : findPreviousPlayableSongIndex(currentSongIndex);
  if (prevIndex !== -1) {
    if (songs[prevIndex].breakpoint && !confirm(`⛔ "${songs[prevIndex].name}" is a breakpoint.\n\nProceed past this breakpoint?`)) return;
    playSongAt(prevIndex);
  }
});
musicNext.addEventListener('click', ()=>{
  const current = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  if (current?.source === 'youtube' && current.youtubeType === 'video-in-playlist' && ytPlayerReady && ytPlayer?.nextVideo) {
    try { ytPlayer.nextVideo(); return; } catch {}
  }
  const nextIndex = currentSongIndex === -1 ? findNextPlayableSongIndex(-1) : findNextPlayableSongIndex(currentSongIndex);
  if (nextIndex !== -1) {
    if (songs[nextIndex].breakpoint && !confirm(`⛔ "${songs[nextIndex].name}" is a breakpoint.\n\nProceed past this breakpoint?`)) return;
    playSongAt(nextIndex);
  }
});

musicAudio.addEventListener('timeupdate', ()=>{
  updateQueueProgress('music');
  updateMusicProgression();
});

musicAudio.addEventListener('ended', ()=>{
  if (musicLoopMode === 'single'){
    musicAudio.currentTime = 0;
    musicAudio.play();
    return;
  }
  if (queuedMusicNext) {
    const idx = songs.indexOf(queuedMusicNext);
    queuedMusicNext = null;
    if (idx !== -1) { playSongAt(idx); return; }
  }
  // Play on finish logic
  const next = findNextPlayableSongIndex(currentSongIndex);
  if (next !== -1) {
    if (songs[next].breakpoint) {
      musicPlaying = false; updateMusicUI(); updateButtonStates();
      setStatus('⛔ Stopped at breakpoint: ' + songs[next].name);
      setTimeout(() => setStatus(''), 5000);
      return;
    }
    playSongAt(next);
    return;
  }
  if (musicLoopMode === 'all') {
    const first = findNextPlayableSongIndex(-1);
    if (first !== -1) {
      if (songs[first].breakpoint) {
        musicPlaying = false; updateMusicUI(); updateButtonStates();
        setStatus('⛔ Stopped at breakpoint: ' + songs[first].name);
        setTimeout(() => setStatus(''), 5000);
        return;
      }
      playSongAt(first);
      return;
    }
  }
  musicPlaying=false;
  updateMusicUI();
  updateButtonStates();
});

musicAudio.addEventListener('play', ()=>{ updateMusicUI(); updateButtonStates(); });
musicAudio.addEventListener('pause', ()=>{ updateMusicUI(); updateButtonStates(); });

function updateMusicProgression(){
  const cpProgression = document.getElementById('cpMusicProgression');
  if (!cpProgression) return;
  const currentSong = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  if (currentSong?.source === 'youtube' && ytPlayer?.getCurrentTime) {
    try {
      const cur = ytPlayer.getCurrentTime() || 0;
      const dur = ytPlayer.getDuration() || 0;
      cpProgression.textContent = `${cur > 0 ? formatDuration(cur) : '0:00'} / ${dur > 0 ? formatDuration(dur) : '0:00'}`;
      return;
    } catch {}
  }
  if (currentSong?.source === 'spotify') {
    const pos = (currentSong.spotifyPosition || 0) / 1000;
    const dur = (currentSong.spotifyDuration || 0) / 1000;
    cpProgression.textContent = `${pos > 0 ? formatDuration(pos) : '0:00'} / ${dur > 0 ? formatDuration(dur) : '0:00'}`;
    return;
  }
  const current = musicAudio.currentTime || 0;
  const duration = musicAudio.duration || 0;
  const currentStr = current > 0 ? formatDuration(current) : '0:00';
  const durationStr = duration > 0 ? formatDuration(duration) : '0:00';
  cpProgression.textContent = `${currentStr} / ${durationStr}`;
}

// ===== API-LIMITATION CONTROL STATES =====

let _lastControlSource = undefined;

function setControlState(el, state, tooltip) {
  if (!el) return;
  // Clean previous state
  el.classList.remove('control-unavailable', 'control-limited-warn');
  el.disabled = false;
  el.title = '';
  // Also clean parent label if relevant
  const label = el.closest('label') || (el.parentElement?.tagName === 'LABEL' ? el.parentElement : null);
  if (label) {
    label.classList.remove('control-unavailable-label', 'control-limited-warn-label');
    label.title = '';
  }

  if (state === 'unavailable') {
    el.classList.add('control-unavailable');
    el.disabled = true;
    el.title = tooltip;
    if (label) { label.classList.add('control-unavailable-label'); label.title = tooltip; }
  } else if (state === 'limited') {
    el.classList.add('control-limited-warn');
    el.title = tooltip;
    if (label) { label.classList.add('control-limited-warn-label'); label.title = tooltip; }
  }
}

function updateStreamControlStates() {
  const song = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  const src = song?.source ?? null;
  if (src === _lastControlSource) return; // nothing changed
  _lastControlSource = src;

  const isYT = src === 'youtube';
  const isSp = src === 'spotify';
  const isStream = isYT || isSp;

  // Crossfade — unavailable for both YouTube and Spotify (no audio-element crossfade possible)
  const fadeState = isStream ? 'unavailable' : 'normal';
  const fadeTip = 'Audio crossfade is not available for stream sources (YouTube / Spotify)';
  setControlState(musicTransition, fadeState, fadeTip);
  setControlState(cpMusicTransition, fadeState, fadeTip);

  // Volume slider — unavailable for Spotify (embed API exposes no volume setter)
  const volState = isSp ? 'unavailable' : 'normal';
  const volTip = 'Volume cannot be controlled via the Spotify embed API';
  setControlState(musicVolume, volState, volTip);
  setControlState(cpMusicVolume, volState, volTip);

  // Next / Prev — functional (advances ECP queue) but cannot navigate inside the Spotify playlist
  const navState = isSp ? 'limited' : 'normal';
  const navTip = 'Advances the ECP queue — to skip within the Spotify playlist, use the embed controls';
  setControlState(musicNext, navState, navTip);
  setControlState(musicPrev, navState, navTip);
  setControlState(cpMusicNext, navState, navTip);
  setControlState(cpMusicPrev, navState, navTip);

  // Shuffle — functional for ECP queue but has no effect on Spotify's internal order
  const shuffleState = isSp ? 'limited' : 'normal';
  const shuffleTip = 'Shuffles the ECP queue order only — does not affect the Spotify playlist shuffle';
  setControlState(musicShuffleButton, shuffleState, shuffleTip);

  // Loop mode — functional at queue level but cannot loop within Spotify's internal playlist
  const loopState = isSp ? 'limited' : 'normal';
  const loopTip = 'Loop mode applies to the ECP queue only — it does not control Spotify\'s internal playback loop';
  setControlState(musicLoopModeSelect, loopState, loopTip);

  // Play on finish — functional but Spotify track-end detection is approximate
  const pofState = isSp ? 'limited' : 'normal';
  const pofTip = 'Spotify track-end detection is approximate; auto-advance may not trigger reliably';
}

function updateMusicUI(){
  const song = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  const name = song ? (song.currentTitle || song.name) : 'No song';
  if (currentSongEl) currentSongEl.textContent = name;
  // Sync CP mini panel
  const cpSong = document.getElementById('cpCurrentSong');
  if (cpSong) cpSong.textContent = name;
  const lis = musicQueue.querySelectorAll('li');
  lis.forEach(li => {
    const isActive = parseInt(li.dataset.index) === currentSongIndex;
    const wasActive = li.classList.contains('active');
    li.classList.toggle('active', isActive);
    if (isActive && !wasActive) {
      li.classList.remove('item-just-selected');
      void li.offsetWidth;
      li.classList.add('item-just-selected');
    }
  });
  updateMusicProgression();
  updateStreamControlStates();
}


function updateButtonStates(){
  musicPlay.classList.toggle('active-play', musicPlaying);
  musicPlay.classList.toggle('inactive', !musicPlaying);
  musicPause.classList.toggle('active-pause', !musicPlaying);
  musicPause.classList.toggle('inactive', musicPlaying);

  if (cpMusicPlay) {
    cpMusicPlay.classList.toggle('active-play', musicPlaying);
    cpMusicPlay.classList.toggle('inactive', !musicPlaying);
  }
  if (cpMusicPause) {
    cpMusicPause.classList.toggle('active-pause', !musicPlaying);
    cpMusicPause.classList.toggle('inactive', musicPlaying);
  }

  mediaPlay.classList.toggle('active-play', mediaPlaying);
  mediaPlay.classList.toggle('inactive', !mediaPlaying);
  mediaPause.classList.toggle('active-pause', !mediaPlaying);
  mediaPause.classList.toggle('inactive', mediaPlaying);

  intercomToggle.classList.toggle('active-announcement', intercomActive);
  intercomToggle.classList.toggle('inactive', !intercomActive);
  if (anIntercomToggle) {
    anIntercomToggle.textContent = getIntercomButtonText(intercomActive);
    anIntercomToggle.classList.toggle('active-announcement', intercomActive);
    anIntercomToggle.classList.toggle('inactive', !intercomActive);
  }
}

// MEDIA
mediaFiles.addEventListener('change', async e=>{
  const files = Array.from(e.target.files);
  for (const f of files) {
    await processMediaFile(f);
  }
});

function renderMediaQueue(){
  mediaQueue.innerHTML='';
  media.forEach((m,i)=>{
    const li = createListItem(m,i,'media');
    mediaQueue.appendChild(li);
  });
  updateQueueProgress('media');
}

function isPlayableMediaIndex(index){
  return index >= 0 && index < media.length && !media[index].skip;
}

function findNextPlayableMediaIndex(startIndex, direction){
  let i = startIndex + direction;
  while (i >= 0 && i < media.length){
    if (!media[i].skip) return i;
    i += direction;
  }
  return -1;
}

function openDisplayWindow(){
  if (displayWindow && !displayWindow.closed) { displayWindow.focus(); return; }
  displayWindow = window.open('media.html','EventDisplay','width=1280,height=720');
  if (displayHidden) {
    setTimeout(() => {
      if (displayWindow && !displayWindow.closed) displayWindow.postMessage({type:'displayHide'},'*');
    }, 600);
  }
}

openDisplay.addEventListener('click', openDisplayWindow);
mediaPrevPreview?.addEventListener('click', () => {
  const idx = Math.max(0, currentMediaIndex - 1);
  if (media[idx]?.breakpoint && !confirm(`⛔ "${media[idx].name}" is a breakpoint.\n\nProceed past this breakpoint?`)) return;
  showMediaAt(idx);
});
mediaNextPreview?.addEventListener('click', () => {
  const idx = Math.min(media.length - 1, currentMediaIndex + 1);
  if (media[idx]?.breakpoint && !confirm(`⛔ "${media[idx].name}" is a breakpoint.\n\nProceed past this breakpoint?`)) return;
  showMediaAt(idx);
});
window.addEventListener('resize', refreshMediaPreviewSize);

window.addEventListener('message', e => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'videoEnded') {
    advanceMedia();
  }
});

function showMediaAt(i, autoplay = true){
  if (i<0 || i>=media.length) return;
  currentMediaIndex = i;
  updateMediaUI();
  
  const useTransition = mediaTransition && mediaTransition.checked;
  if (useTransition) {
    const mirror1 = mediaMirrorContent;
    const mirror2 = document.getElementById('cpMediaMirrorContent');
    [mirror1, mirror2].forEach(m => {
      if (m) {
        m.style.transition = 'opacity 0.15s ease';
        m.style.opacity = '0';
      }
    });
    setTimeout(() => {
      updateMediaMirror(media[i], autoplay);
      [mirror1, mirror2].forEach(m => {
        if (m) m.style.opacity = '1';
      });
    }, 150);
  } else {
    updateMediaMirror(media[i], autoplay);
  }
  
  sendMediaToDisplay(media[i], autoplay, useTransition);
  if (mediaLooping) scheduleMediaAdvance();
  updateButtonStates();
}

function sendMediaToDisplay(item, autoplay = true, transition = false){
  if (displayFrozen) { frozenPendingItem = { item, autoplay, transition }; return; }
  if (!displayWindow || displayWindow.closed) openDisplayWindow();
  const msg = {type:'show', item:{name:item.name,url:item.url,type:item.type, muted: (mediaMuteAudio ? !!mediaMuteAudio.checked : true), autoplay, embedUrl: item.embedUrl || null}, transition};
  setTimeout(()=> { if (displayWindow && !displayWindow.closed) displayWindow.postMessage(msg,'*'); },200);
}

function updateDisplayControlButtons() {
  const frozen = displayFrozen;
  const hidden = displayHidden;
  ['freezeDisplay','cpFreezeDisplay'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('active-freeze', frozen);
    btn.classList.toggle('inactive', !frozen);
    if (!document.body.classList.contains('icons-mode'))
      btn.textContent = frozen ? 'Unfreeze' : 'Freeze';
  });
  ['hideDisplay','cpHideDisplay'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('active-hide', hidden);
    btn.classList.toggle('inactive', !hidden);
    if (!document.body.classList.contains('icons-mode'))
      btn.textContent = hidden ? 'Show' : 'Hide';
  });
}

function toggleDisplayFreeze() {
  displayFrozen = !displayFrozen;
  updateDisplayControlButtons();
  if (!displayFrozen && frozenPendingItem) {
    const { item, autoplay, transition } = frozenPendingItem;
    frozenPendingItem = null;
    sendMediaToDisplay(item, autoplay, transition);
  } else if (!displayFrozen) {
    frozenPendingItem = null;
  }
}

function toggleDisplayHide() {
  displayHidden = !displayHidden;
  updateDisplayControlButtons();
  if (!displayWindow || displayWindow.closed) openDisplayWindow();
  const msg = { type: displayHidden ? 'displayHide' : 'displayUnhide' };
  setTimeout(() => { if (displayWindow && !displayWindow.closed) displayWindow.postMessage(msg,'*'); }, 250);
}

function updateMediaUI(){
  const name = (currentMediaIndex>=0 && media[currentMediaIndex])? media[currentMediaIndex].name : 'No media';
  if (currentMediaEl) currentMediaEl.textContent = name;
  // Sync CP mini panel
  const cpMedia = document.getElementById('cpCurrentMedia');
  if (cpMedia) cpMedia.textContent = name;
  const lis = mediaQueue.querySelectorAll('li');
  lis.forEach(li => {
    const isActive = parseInt(li.dataset.index) === currentMediaIndex;
    const wasActive = li.classList.contains('active');
    li.classList.toggle('active', isActive);
    if (isActive && !wasActive) {
      li.classList.remove('item-just-selected');
      void li.offsetWidth;
      li.classList.add('item-just-selected');
    }
  });
  updateMediaNotesUI();
  updateQueueProgress('media');
  refreshMediaPreviewSize();
  updateMediaPreviewCards();
  syncCpMirror();
}

function updateQueueProgress(type){
  if (type === 'music'){
    const activeIndex = currentSongIndex;
    const duration = musicAudio.duration || 0;
    const percent = duration > 0 ? (musicAudio.currentTime / duration) * 100 : 0;
    musicQueue.querySelectorAll('li').forEach(li => {
      const underlay = li.querySelector('.progress-underlay');
      if (!underlay) return;
      if (parseInt(li.dataset.index) === activeIndex){
        underlay.style.width = `${percent}%`;
      } else {
        underlay.style.width = '0%';
      }
    });
  } else {
    const activeIndex = currentMediaIndex;
    mediaQueue.querySelectorAll('li').forEach(li => {
      const underlay = li.querySelector('.progress-underlay');
      if (!underlay) return;
      if (parseInt(li.dataset.index) !== activeIndex){
        underlay.style.width = '0%';
        return;
      }
      const current = media[activeIndex];
      if (!current){ underlay.style.width = '0%'; return; }
      if (current.type.startsWith('video/')){
        const videoEl = mediaMirrorContent.querySelector('video');
        const duration = videoEl?.duration || 0;
        const percent = duration > 0 ? (videoEl.currentTime / duration) * 100 : 0;
        underlay.style.width = `${percent}%`;
      } else {
        const transition = Math.max(1, parseFloat(transitionTimeEl.value) || 5);
        if (mediaProgressStart > 0){
          const elapsed = Date.now() - mediaProgressStart;
          const percent = Math.min(100, (elapsed / (transition * 1000)) * 100);
          underlay.style.width = `${percent}%`;
        } else {
          underlay.style.width = '0%';
        }
      }
    });
  }
}

let mediaProgressStart = 0;

function updateMediaMirror(item, autoplay = true){
  if (mediaMirrorContent) {
    mediaMirrorContent.innerHTML = '';
    if (!item) {
      mediaMirrorContent.textContent = 'Nothing displayed';
      refreshMediaPreviewSize();
    } else if (item.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = item.name;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      mediaMirrorContent.appendChild(img);
    } else if (item.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = item.url;
      video.controls = false;
      video.autoplay = autoplay;
      video.muted = (mediaMuteAudio ? !!mediaMuteAudio.checked : true);
      video.loop = false;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      video.addEventListener('timeupdate', ()=> updateQueueProgress('media'));
      mediaMirrorContent.appendChild(video);
    } else if (item.type === 'youtube-embed' || item.type === 'gdrive-embed' || item.type === 'gslides-embed') {
      const iframe = document.createElement('iframe');
      iframe.src = item.embedUrl || '';
      iframe.style.cssText = 'width:100%;height:100%;border:0;border-radius:8px;';
      iframe.allow = 'autoplay; fullscreen; encrypted-media';
      iframe.allowFullscreen = true;
      mediaMirrorContent.appendChild(iframe);
    } else {
      mediaMirrorContent.textContent = item.name;
    }
    refreshMediaPreviewSize();
  }
  // Show/hide mirror unsync warning for web embeds
  const isEmbed = !!(item && (item.type === 'youtube-embed' || item.type === 'gdrive-embed' || item.type === 'gslides-embed'));
  if (mediaMirror) mediaMirror.classList.toggle('mirror-unsync', isEmbed);
  const unsyncEl = document.getElementById('mirrorUnsyncWarning');
  if (unsyncEl) unsyncEl.style.display = isEmbed ? '' : 'none';
  syncCpMirror(item);
}

function updateMediaPreviewCards(){
  refreshMediaPreviewSize();
  const prevItem = currentMediaIndex > 0 ? media[currentMediaIndex - 1] : null;
  const nextItem = currentMediaIndex >= 0 && currentMediaIndex < media.length - 1 ? media[currentMediaIndex + 1] : null;
  renderPreviewCard(mediaPrevPreview, prevItem, 'Previous');
  renderPreviewCard(mediaNextPreview, nextItem, 'Next');
}

function refreshMediaPreviewSize(){
  if (!mediaMirror || !mediaMirrorContent) return;
  const rect = mediaMirrorContent.getBoundingClientRect();
  mediaMirror.style.setProperty('--mirror-display-width', `${rect.width}px`);
  mediaMirror.style.setProperty('--mirror-display-height', `${rect.height}px`);
}

function renderPreviewCard(button, item, label){
  if (!button) return;
  button.style.width = '';
  button.style.height = '';
  button.style.flex = '0 0 auto';
  const rect = mediaMirrorContent ? mediaMirrorContent.getBoundingClientRect() : null;
  if (rect && rect.width > 0 && rect.height > 0) {
    const halfWidth = Math.max(0, Math.round(rect.width / 2 - 5));
    const halfHeight = Math.max(0, Math.round(rect.height / 2 - 5));
    button.style.width = `${halfWidth}px`;
    button.style.height = `${halfHeight}px`;
  }
  button.disabled = !item;
  const labelEl = button.querySelector('.preview-label');
  const contentEl = button.querySelector('.preview-content');
  if (labelEl) labelEl.textContent = label;
  if (!contentEl) return;
  contentEl.innerHTML = '';
  if (!item){
    contentEl.textContent = 'No preview';
    return;
  }
  const thumbWrapper = document.createElement('div');
  thumbWrapper.className = 'preview-thumb';
  if (item.type.startsWith('image/')){
    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.name || 'Image preview';
    thumbWrapper.appendChild(img);
  } else {
    const icon = document.createElement('div');
    icon.className = 'preview-icon';
    icon.textContent = item.type.startsWith('video/') ? 'Video' : item.type === 'youtube-embed' ? 'YouTube' : item.type === 'gdrive-embed' ? 'Drive' : item.type === 'gslides-embed' ? 'Slides' : item.type === 'slide' ? 'Slide' : 'Media';
    thumbWrapper.appendChild(icon);
  }
  const title = document.createElement('div');
  title.className = 'preview-title';
  title.textContent = item.name || 'Untitled';
  contentEl.appendChild(thumbWrapper);
  contentEl.appendChild(title);
}

function sendMediaControlToDisplay(command){
  if (!displayWindow || displayWindow.closed) return;
  displayWindow.postMessage({type: command}, '*');
}

function scheduleMediaAdvance(){
  if (mediaTimer) clearTimeout(mediaTimer);
  if (media.length===0 || currentMediaIndex < 0) return;
  const current = media[currentMediaIndex];
  if (!current) return;
  if (current.type.startsWith('video/') || current.type === 'youtube-embed' || current.type === 'gdrive-embed' || current.type === 'gslides-embed') {
    // wait for video ended event; embeds have no ended detection on static sites
    return;
  }
  const transition = Math.max(1, parseFloat(transitionTimeEl.value) || 5) * 1000;
  mediaProgressStart = Date.now();
  mediaTimer = setTimeout(()=> {
    advanceMedia();
  }, transition);
}

function advanceMedia(){
  if (media.length===0) return;
  if (mediaLoopMode === 'single') {
    showMediaAt(currentMediaIndex);
    return;
  }
  // Queue next override
  if (queuedMediaNext) {
    const idx = media.indexOf(queuedMediaNext);
    queuedMediaNext = null;
    if (idx !== -1) { showMediaAt(idx); return; }
  }
  const nextIndex = findNextPlayableMediaIndex(currentMediaIndex, 1);
  if (nextIndex !== -1) {
    if (media[nextIndex].breakpoint) {
      mediaPlaying = false; mediaLooping = false; stopMediaLoop(); updateButtonStates();
      setStatus('⛔ Stopped at breakpoint: ' + media[nextIndex].name);
      setTimeout(() => setStatus(''), 5000);
      return;
    }
    currentMediaIndex = nextIndex;
    showMediaAt(currentMediaIndex);
    return;
  }
  if (mediaLoopMode === 'all') {
    const firstIndex = findNextPlayableMediaIndex(-1, 1);
    if (firstIndex !== -1) {
      if (media[firstIndex].breakpoint) {
        mediaPlaying = false; mediaLooping = false; stopMediaLoop(); updateButtonStates();
        setStatus('⛔ Stopped at breakpoint: ' + media[firstIndex].name);
        setTimeout(() => setStatus(''), 5000);
        return;
      }
      currentMediaIndex = firstIndex;
      showMediaAt(currentMediaIndex);
      return;
    }
  }
  mediaPlaying = false;
  mediaLooping = false;
  stopMediaLoop();
  updateButtonStates();
}

mediaPlay.addEventListener('click', ()=>{
  if (media.length===0) return;
  if (currentMediaIndex === -1 || media[currentMediaIndex]?.skip) {
    const startIndex = findNextPlayableMediaIndex(currentMediaIndex, 1);
    if (startIndex === -1) return;
    currentMediaIndex = startIndex;
  }
  mediaPlaying = true;
  mediaLooping = true;
  showMediaAt(currentMediaIndex);
  updateButtonStates();
});
mediaPause.addEventListener('click', ()=>{
  mediaPlaying = false;
  mediaLooping = false;
  stopMediaLoop();
  mediaProgressStart = 0;
  sendMediaControlToDisplay('pause');
  updateButtonStates();
});

if (mediaLoopModeSelect) {
  mediaLoopModeSelect.addEventListener('change', ()=>{
    mediaLoopMode = mediaLoopModeSelect.value || 'off';
  });
}

// Media previous/next navigation
mediaPrev.addEventListener('click', ()=>{
  const prevIndex = currentMediaIndex === -1 ? findNextPlayableMediaIndex(media.length, -1) : findNextPlayableMediaIndex(currentMediaIndex, -1);
  if (prevIndex !== -1) {
    if (media[prevIndex].breakpoint && !confirm(`⛔ "${media[prevIndex].name}" is a breakpoint.\n\nProceed past this breakpoint?`)) return;
    showMediaAt(prevIndex);
  }
});
mediaNext.addEventListener('click', ()=>{
  const nextIndex = currentMediaIndex === -1 ? findNextPlayableMediaIndex(-1, 1) : findNextPlayableMediaIndex(currentMediaIndex, 1);
  if (nextIndex !== -1) {
    if (media[nextIndex].breakpoint && !confirm(`⛔ "${media[nextIndex].name}" is a breakpoint.\n\nProceed past this breakpoint?`)) return;
    showMediaAt(nextIndex);
  }
});

function stopMediaLoop(){
  if (mediaTimer) clearTimeout(mediaTimer);
  mediaTimer = null;
  mediaProgressStart = 0;
}

// INTERCOM
function getIntercomButtonText(active) {
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'live';
  if (active) return mode === 'recorded' ? 'Stop Recording' : 'Stop Announcement';
  return mode === 'recorded' ? 'Start Recording' : 'Start Announcement';
}

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let intercomActive = false;
let intercomAudioEl = null;
// Live passthrough runs through the Web Audio graph (low latency) rather than an
// HTMLAudioElement, which buffers a live MediaStream by 150-500ms.
let intercomCtx = null;
let intercomSourceNode = null;
let intercomGainNode = null;

async function startIntercom(){
  // Disable the mic DSP (echo cancellation / noise suppression / AGC) — each adds
  // tens of ms of processing delay — and request the lowest-latency capture path.
  const audioConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    latency: 0,
  };
  if (selectedInputDeviceId) audioConstraints.deviceId = {exact:selectedInputDeviceId};
  const constraints = {audio: audioConstraints};
  try{
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  }catch(err){ alert('Microphone access denied or not available: '+err.message); return; }

  const mode = document.querySelector('input[name="mode"]:checked').value;
  if (mode==='live'){
    // Low-latency passthrough via Web Audio: mic -> gain -> destination.
    try {
      intercomCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      // Route to the chosen output device when AudioContext.setSinkId is available.
      if (selectedOutputDeviceId && typeof intercomCtx.setSinkId === 'function'){
        try { await intercomCtx.setSinkId(selectedOutputDeviceId); } catch (err) { console.warn('Failed to set output device:', err); }
      }
      intercomSourceNode = intercomCtx.createMediaStreamSource(mediaStream);
      intercomGainNode = intercomCtx.createGain();
      intercomGainNode.gain.value = parseFloat(intercomVolume.value);
      intercomSourceNode.connect(intercomGainNode).connect(intercomCtx.destination);
      await intercomCtx.resume().catch(()=>{});
    } catch (err) {
      // Fallback to the media-element path (higher latency) if Web Audio fails or
      // an output device is selected but AudioContext.setSinkId is unsupported.
      console.warn('Web Audio passthrough unavailable, falling back to media element:', err);
      if (intercomCtx){ try { intercomCtx.close(); } catch {} intercomCtx = null; }
      intercomSourceNode = null; intercomGainNode = null;
      intercomAudioEl = new Audio();
      intercomAudioEl.srcObject = mediaStream;
      intercomAudioEl.autoplay = true;
      intercomAudioEl.volume = parseFloat(intercomVolume.value);
      if (selectedOutputDeviceId && typeof intercomAudioEl.setSinkId === 'function'){
        try { await intercomAudioEl.setSinkId(selectedOutputDeviceId); } catch (e) { console.warn('Failed to set output device:', e); }
      }
      await intercomAudioEl.play().catch(()=>{});
    }
  } else {
    // recorded mode - start recording
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = e=>{ if (e.data && e.data.size) recordedChunks.push(e.data); };
    mediaRecorder.start();
  }

  intercomActive = true;
  intercomToggle.textContent = getIntercomButtonText(true);
  updateButtonStates();
  // pause/fade music
  handleMusicForAnnouncement(true);
  // play soundboard cue when toggled on in live mode
  if (mode === 'live') playIntercomSoundCue(null);
}

async function stopIntercom(){
  const mode = document.querySelector('input[name="mode"]:checked').value;
  if (mode==='live'){
    if (intercomSourceNode){ try { intercomSourceNode.disconnect(); } catch {} intercomSourceNode = null; }
    if (intercomGainNode){ try { intercomGainNode.disconnect(); } catch {} intercomGainNode = null; }
    if (intercomCtx){ intercomCtx.close().catch(()=>{}); intercomCtx = null; }
    if (intercomAudioEl){ intercomAudioEl.pause(); intercomAudioEl.srcObject = null; intercomAudioEl = null; }
  } else {
    if (mediaRecorder && mediaRecorder.state !== 'inactive'){
      mediaRecorder.onstop = ()=>{
        const blob = new Blob(recordedChunks,{type:'audio/webm'});
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        a.volume = parseFloat(intercomVolume.value);
        if (selectedOutputDeviceId && typeof a.setSinkId === 'function') a.setSinkId(selectedOutputDeviceId).catch(()=>{});
        a.onended = ()=> handleMusicForAnnouncement(false);
        // play soundboard cue before the recording
        playIntercomSoundCue(() => a.play().catch(()=>{}));
      };
      mediaRecorder.stop();
    }
  }
  // if live, restore music now
  if (mode==='live') handleMusicForAnnouncement(false);
  // stop tracks
  if (mediaStream){ mediaStream.getTracks().forEach(t=>t.stop()); mediaStream=null; }
  intercomActive=false;
  intercomToggle.textContent=getIntercomButtonText(false);
  updateButtonStates();
}

intercomToggle.addEventListener('click', ()=>{
  if (!intercomActive) startIntercom(); else stopIntercom();
});

function handleMusicForAnnouncement(starting){
  const shouldPause = pauseMusicDuring.checked;
  const shouldFade = fadeMusic.checked;
  if (!shouldPause && !shouldFade) return;
  if (starting){
    if (shouldFade){
      fadeOutMusic(0.5);
    } else if (shouldPause){
      if (!musicAudio.paused) musicAudio.pause();
    }
  } else {
    if (shouldFade){
      fadeInMusic(0.5);
    } else if (shouldPause){
      if (musicPlaying) musicAudio.play();
    }
  }
}

function fadeOutMusic(durationSec=0.5){
  const currentSong = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  if (currentSong?.source === 'youtube' && ytPlayer?.getVolume) {
    const startVol = ytPlayer.getVolume();
    const steps = 20; let i = 0;
    const iv = setInterval(() => {
      i++; const t = i/steps;
      try { ytPlayer.setVolume(Math.max(0, Math.round(startVol*(1-t)))); } catch {}
      if (i >= steps) { clearInterval(iv); try { ytPlayer.pauseVideo(); ytPlayer.setVolume(startVol); } catch {} }
    }, durationSec*1000/steps);
    return;
  }
  if (currentSong?.source === 'spotify') {
    try { spotifyController?.pause(); } catch {}
    return;
  }
  const gainTarget = musicGainNode ? musicGainNode.gain.value : (musicAudio.volume || 1);
  const steps = 20;
  let i=0;
  const iv = setInterval(()=>{
    i++; const t=i/steps;
    if (musicGainNode) musicGainNode.gain.value = gainTarget*(1-t);
    else try { musicAudio.volume = gainTarget*(1-t); } catch {}
    if (i>=steps){
      clearInterval(iv); musicAudio.pause();
      if (musicGainNode) musicGainNode.gain.value = gainTarget;
      else try { musicAudio.volume = gainTarget; } catch {}
    }
  }, durationSec*1000/steps);
}
function fadeInMusic(durationSec=0.5){
  const currentSong = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  if (currentSong?.source === 'youtube' && ytPlayer?.setVolume) {
    const target = Math.round((parseFloat(masterVolume?.value)||1) * (parseFloat(musicVolume?.value)||1) * 100);
    try { ytPlayer.setVolume(0); ytPlayer.playVideo(); } catch {}
    const steps = 20; let i = 0;
    const iv = setInterval(() => {
      i++; try { ytPlayer.setVolume(Math.min(target, Math.round(target*(i/steps)))); } catch {}
      if (i >= steps) { clearInterval(iv); try { ytPlayer.setVolume(target); } catch {} }
    }, durationSec*1000/steps);
    return;
  }
  if (currentSong?.source === 'spotify') {
    try { spotifyController?.play(); } catch {}
    return;
  }
  const target = (parseFloat(masterVolume.value)||1) * (parseFloat(musicVolume?.value)||1);
  if (musicGainNode) musicGainNode.gain.value = 0; else try { musicAudio.volume = 0; } catch {}
  musicAudio.play().catch(()=>{});
  musicAudioContext?.resume().catch(() => {});
  const steps=20; let i=0;
  const iv=setInterval(()=>{
    i++;
    if (musicGainNode) musicGainNode.gain.value = target*(i/steps);
    else try { musicAudio.volume = target*(i/steps); } catch {}
    if (i>=steps){ clearInterval(iv); }
  }, durationSec*1000/steps);
}

// set intercom volume control
intercomVolume.addEventListener('input', ()=>{
  const v = parseFloat(intercomVolume.value);
  if (intercomGainNode) intercomGainNode.gain.value = v;
  if (intercomAudioEl) intercomAudioEl.volume = v;
});

// Desktop app: load a .ecp handed to us by the OS (double-click / "open with").
// Harmless no-op in the browser, where window.ecpBridge is undefined.
window.ecpBridge?.onOpenPreset(({ name, content }) => {
  try {
    openIncomingPreset(name, content);
  } catch (err) {
    console.error(err);
    setStatus(`Failed to open preset: ${err.message || 'unknown error'}`);
    setTimeout(() => setStatus(''), 5000);
  }
});

// initial UI
applyVolumeSettings();
updateMusicUI();
updateMediaUI();
updateButtonStates();
ensureDeviceAccess();
setInterval(()=>{
  updateQueueProgress('music');
  updateQueueProgress('media');
}, 250);

// Resume music AudioContext when the tab regains focus
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && musicAudioContext?.state === 'suspended') {
    musicAudioContext.resume().catch(() => {});
  }
});

// Cleanup on unload
window.addEventListener('beforeunload', ()=>{
  if (displayWindow && !displayWindow.closed) displayWindow.close();
});

// simple status
setInterval(()=>{
  const s = `music:${musicPlaying? 'playing':'stopped'} songs:${songs.length} media:${media.length}`;
  const statusEl2 = document.getElementById('status');
  if (statusEl2) statusEl2.textContent = s;
},1000);

// ===== PAGE NAVIGATION =====
(function initPageNav(){
  const tabs = document.querySelectorAll('.page-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Hide all pages
      document.querySelectorAll('.page').forEach(p => p.classList.add('page--hidden'));
      // Deactivate all tabs
      tabs.forEach(t => t.classList.remove('page-tab--active'));
      // Show target page
      const target = tab.dataset.page;
      const page = document.getElementById(target);
      if (page) page.classList.remove('page--hidden');
      tab.classList.add('page-tab--active');
      activePage = target;
      updateStreamVisibility();
      // Trigger resize for mirror display after page switch
      setTimeout(refreshMediaPreviewSize, 50);
    });
  });
})();

// ===== CP MINI PANEL SYNC =====

// Sync CP mirror display with current media
function syncCpMirror(item){
  const cpMirrorContent = document.getElementById('cpMediaMirrorContent');
  if (!cpMirrorContent) return;
  const current = item !== undefined ? item : (currentMediaIndex >= 0 ? media[currentMediaIndex] : null);
  cpMirrorContent.innerHTML = '';
  if (!current) {
    cpMirrorContent.textContent = 'Nothing displayed';
    return;
  }
  if (current.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = current.url;
    img.alt = current.name;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
    cpMirrorContent.appendChild(img);
  } else if (current.type.startsWith('video/')) {
    const icon = document.createElement('div');
    icon.textContent = '▶ ' + current.name;
    icon.style.cssText = 'color:#888;font-size:.75rem;text-align:center;padding:8px';
    cpMirrorContent.appendChild(icon);
  } else {
    cpMirrorContent.textContent = current.name;
  }
}

// CP Music controls
if (cpMusicPlay) cpMusicPlay.addEventListener('click', () => musicPlay.click());
if (cpMusicPause) cpMusicPause.addEventListener('click', () => musicPause.click());
if (cpMusicPrev) cpMusicPrev.addEventListener('click', () => musicPrev.click());
if (cpMusicNext) cpMusicNext.addEventListener('click', () => musicNext.click());
function setMusicVolume(val) {
  const clamped = Math.max(0, Math.min(2, val));
  if (musicVolume) musicVolume.value = clamped;
  if (cpMusicVolume) cpMusicVolume.value = clamped;
  const pct = Math.round(clamped * 100);
  const mvi  = document.getElementById('musicVolumeInput');
  const cmvi = document.getElementById('cpMusicVolumeInput');
  if (mvi) mvi.value = pct;
  if (cmvi) cmvi.value = pct;
  applyVolumeSettings();
}

if (musicVolume)   musicVolume.addEventListener('input',   () => setMusicVolume(parseFloat(musicVolume.value)));
if (cpMusicVolume) cpMusicVolume.addEventListener('input', () => setMusicVolume(parseFloat(cpMusicVolume.value)));

function handleMusicVolInput(pctVal) {
  const clamped = Math.max(0, Math.min(200, parseInt(pctVal) || 0));
  const mvi  = document.getElementById('musicVolumeInput');
  const cmvi = document.getElementById('cpMusicVolumeInput');
  if (mvi) mvi.value = clamped;
  if (cmvi) cmvi.value = clamped;
  setMusicVolume(clamped / 100);
}
document.getElementById('musicVolumeInput')?.addEventListener('input',  function () { handleMusicVolInput(this.value); });
document.getElementById('musicVolumeInput')?.addEventListener('change', function () { this.value = Math.max(0, Math.min(200, parseInt(this.value) || 0)); handleMusicVolInput(this.value); });
document.getElementById('cpMusicVolumeInput')?.addEventListener('input',  function () { handleMusicVolInput(this.value); });
document.getElementById('cpMusicVolumeInput')?.addEventListener('change', function () { this.value = Math.max(0, Math.min(200, parseInt(this.value) || 0)); handleMusicVolInput(this.value); });

// CP Media controls
if (cpMediaPrev) cpMediaPrev.addEventListener('click', () => mediaPrev.click());
if (cpMediaNext) cpMediaNext.addEventListener('click', () => mediaNext.click());

// Sync CP notes with the main notes textarea
if (cpMediaNotes && mediaNotes) {
  // When main notes change, sync to CP
  mediaNotes.addEventListener('input', () => {
    cpMediaNotes.value = mediaNotes.value;
  });
  // When CP notes change, sync back to main
  cpMediaNotes.addEventListener('input', () => {
    mediaNotes.value = cpMediaNotes.value;
    const item = getSelectedMediaItem();
    if (item) item.notes = cpMediaNotes.value;
  });
}

// Patch updateMediaNotesUI to also update CP notes
const _origUpdateMediaNotesUI = updateMediaNotesUI;
updateMediaNotesUI = function(){
  _origUpdateMediaNotesUI();
  if (!cpMediaNotes || !mediaNotes) return;
  cpMediaNotes.disabled = mediaNotes.disabled;
  cpMediaNotes.value = mediaNotes.value;
  cpMediaNotes.placeholder = mediaNotes.placeholder;
};

if (musicTransition && cpMusicTransition) {
  musicTransition.addEventListener('change', () => { cpMusicTransition.checked = musicTransition.checked; });
  cpMusicTransition.addEventListener('change', () => { musicTransition.checked = cpMusicTransition.checked; });
}

// Sync Slides checkboxes
if (mediaTransition && cpMediaTransition) {
  mediaTransition.addEventListener('change', () => { cpMediaTransition.checked = mediaTransition.checked; });
  cpMediaTransition.addEventListener('change', () => { mediaTransition.checked = cpMediaTransition.checked; });
}

// Clock Widget tab toggling
function showClockPane(pane) {
  [clockDisplay, stopwatchDisplay, timerDisplay].forEach(d => d?.classList.add('hidden'));
  [btnClockMode, btnStopwatchMode, btnTimerMode].forEach(b => b?.classList.remove('active'));
  [anClockDisplay, anStopwatchDisplay, anTimerDisplay].forEach(d => d?.classList.add('hidden'));
  [anBtnClockMode, anBtnStopwatchMode, anBtnTimerMode].forEach(b => b?.classList.remove('active'));

  if (pane === 'clock') {
    clockDisplay?.classList.remove('hidden');
    btnClockMode?.classList.add('active');
    anClockDisplay?.classList.remove('hidden');
    anBtnClockMode?.classList.add('active');
  } else if (pane === 'stopwatch') {
    stopwatchDisplay?.classList.remove('hidden');
    btnStopwatchMode?.classList.add('active');
    anStopwatchDisplay?.classList.remove('hidden');
    anBtnStopwatchMode?.classList.add('active');
  } else if (pane === 'timer') {
    timerDisplay?.classList.remove('hidden');
    btnTimerMode?.classList.add('active');
    anTimerDisplay?.classList.remove('hidden');
    anBtnTimerMode?.classList.add('active');
  }
}

btnClockMode?.addEventListener('click', () => showClockPane('clock'));
btnStopwatchMode?.addEventListener('click', () => showClockPane('stopwatch'));
btnTimerMode?.addEventListener('click', () => showClockPane('timer'));
anBtnClockMode?.addEventListener('click', () => showClockPane('clock'));
anBtnStopwatchMode?.addEventListener('click', () => showClockPane('stopwatch'));
anBtnTimerMode?.addEventListener('click', () => showClockPane('timer'));

// Stopwatch Logic
let stopwatchRunning = false;
let stopwatchTimeMs = 0;
let stopwatchInterval = null;
let lapTimes = [];

function formatStopwatchMs(ms) {
  const elapsedSec = Math.floor(ms / 1000);
  const min = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
  const sec = (elapsedSec % 60).toString().padStart(2, '0');
  const tenths = Math.floor((ms % 1000) / 100).toString();
  return `${min}:${sec}.${tenths}`;
}

function updateStopwatchDisplay() {
  const text = formatStopwatchMs(stopwatchTimeMs);
  if (stopwatchTime) stopwatchTime.textContent = text;
  if (anStopwatchTimeEl) anStopwatchTimeEl.textContent = text;
}

function renderLaps() {
  function fillLapList(el) {
    if (!el) return;
    el.innerHTML = '';
    lapTimes.forEach((ms, i) => {
      const div = document.createElement('div');
      div.className = 'lap-item';
      div.textContent = `Lap ${i + 1}  ${formatStopwatchMs(ms)}`;
      el.appendChild(div);
    });
  }
  fillLapList(document.getElementById('lapList'));
  fillLapList(anLapList);
}

btnStopwatchStart?.addEventListener('click', () => {
  if (!stopwatchRunning) {
    stopwatchRunning = true;
    if (btnStopwatchStart) { btnStopwatchStart.textContent = 'Pause'; btnStopwatchStart.classList.add('btn-running'); }
    if (btnStopwatchLap) btnStopwatchLap.disabled = false;
    const startTime = Date.now() - stopwatchTimeMs;
    stopwatchInterval = setInterval(() => {
      stopwatchTimeMs = Date.now() - startTime;
      updateStopwatchDisplay();
    }, 100);
  } else {
    stopwatchRunning = false;
    if (btnStopwatchStart) { btnStopwatchStart.textContent = 'Start'; btnStopwatchStart.classList.remove('btn-running'); }
    if (btnStopwatchLap) btnStopwatchLap.disabled = true;
    clearInterval(stopwatchInterval);
  }
});

btnStopwatchLap?.addEventListener('click', () => {
  if (!stopwatchRunning) return;
  lapTimes.push(stopwatchTimeMs);
  renderLaps();
});

btnStopwatchReset?.addEventListener('click', () => {
  stopwatchRunning = false;
  clearInterval(stopwatchInterval);
  stopwatchTimeMs = 0;
  lapTimes = [];
  updateStopwatchDisplay();
  renderLaps();
  if (btnStopwatchStart) { btnStopwatchStart.textContent = 'Start'; btnStopwatchStart.classList.remove('btn-running'); }
  if (btnStopwatchLap) btnStopwatchLap.disabled = true;
});

// Timer Logic
let timerRunning = false;
let timerSecondsRemaining = 300;
let timerInterval = null;
let timerFlashInterval = null;

function readTimerInputs() {
  const minVal = parseInt(timerInputMin?.value, 10);
  const secVal = parseInt(timerInputSec?.value, 10);
  return (isNaN(minVal) ? 0 : minVal) * 60 + (isNaN(secVal) ? 0 : secVal);
}

function updateTimerDisplay() {
  const min = Math.floor(timerSecondsRemaining / 60).toString().padStart(2, '0');
  const sec = (timerSecondsRemaining % 60).toString().padStart(2, '0');
  const text = `${min}:${sec}`;
  if (timerTime) timerTime.textContent = text;
  if (anTimerTimeEl) anTimerTimeEl.textContent = text;
}

// Live-update display when user edits inputs while timer is stopped
timerInputMin?.addEventListener('input', () => {
  if (anTimerInputMin) anTimerInputMin.value = timerInputMin.value;
  if (!timerRunning) { timerSecondsRemaining = readTimerInputs(); updateTimerDisplay(); stopFlashTimerAlert(); }
});
timerInputSec?.addEventListener('input', () => {
  if (anTimerInputSec) anTimerInputSec.value = timerInputSec.value;
  if (!timerRunning) { timerSecondsRemaining = readTimerInputs(); updateTimerDisplay(); stopFlashTimerAlert(); }
});

btnTimerStart?.addEventListener('click', () => {
  if (!timerRunning) {
    if (timerSecondsRemaining <= 0) {
      timerSecondsRemaining = readTimerInputs();
    }
    if (timerSecondsRemaining <= 0) return;

    timerRunning = true;
    if (btnTimerStart) { btnTimerStart.textContent = 'Pause'; btnTimerStart.classList.add('btn-running'); }

    timerInterval = setInterval(() => {
      timerSecondsRemaining--;
      updateTimerDisplay();

      if (timerSecondsRemaining <= 0) {
        clearInterval(timerInterval);
        timerRunning = false;
        if (btnTimerStart) { btnTimerStart.textContent = 'Start'; btnTimerStart.classList.remove('btn-running'); }
        flashTimerAlert();
      }
    }, 1000);
  } else {
    timerRunning = false;
    if (btnTimerStart) { btnTimerStart.textContent = 'Start'; btnTimerStart.classList.remove('btn-running'); }
    clearInterval(timerInterval);
  }
});

btnTimerReset?.addEventListener('click', () => {
  timerRunning = false;
  clearInterval(timerInterval);
  timerSecondsRemaining = readTimerInputs();
  updateTimerDisplay();
  if (btnTimerStart) { btnTimerStart.textContent = 'Start'; btnTimerStart.classList.remove('btn-running'); }
  stopFlashTimerAlert();
});

function flashTimerAlert() {
  stopFlashTimerAlert();
  stopwatchPanel?.classList.add('timer-alarm');
  anStopwatchPanel?.classList.add('timer-alarm');
}

function stopFlashTimerAlert() {
  stopwatchPanel?.classList.remove('timer-alarm');
  anStopwatchPanel?.classList.remove('timer-alarm');
}

// ===== ANNOUNCE PAGE WIRING =====

// --- Intercom sync (announce page ↔ control panel) ---
// Mode radios: announce → CP
document.querySelectorAll('input[name="an-mode"]').forEach(r => {
  r.addEventListener('change', () => {
    document.querySelectorAll('input[name="mode"]').forEach(m => { m.checked = m.value === r.value; });
    if (intercomToggle) intercomToggle.textContent = getIntercomButtonText(intercomActive);
    if (anIntercomToggle) anIntercomToggle.textContent = getIntercomButtonText(intercomActive);
  });
});
// Mode radios: CP → announce
document.querySelectorAll('input[name="mode"]').forEach(r => {
  r.addEventListener('change', () => {
    document.querySelectorAll('input[name="an-mode"]').forEach(m => { m.checked = m.value === r.value; });
    if (intercomToggle) intercomToggle.textContent = getIntercomButtonText(intercomActive);
    if (anIntercomToggle) anIntercomToggle.textContent = getIntercomButtonText(intercomActive);
  });
});

// Volume sync
anIntercomVolume?.addEventListener('input', () => {
  if (intercomVolume) intercomVolume.value = anIntercomVolume.value;
  const v = parseFloat(anIntercomVolume.value);
  if (intercomGainNode) intercomGainNode.gain.value = v;
  if (intercomAudioEl) intercomAudioEl.volume = v;
});
intercomVolume?.addEventListener('input', () => {
  if (anIntercomVolume) anIntercomVolume.value = intercomVolume.value;
});

// Pause/fade checkboxes sync
anPauseMusicDuring?.addEventListener('change', () => { if (pauseMusicDuring) pauseMusicDuring.checked = anPauseMusicDuring.checked; });
pauseMusicDuring?.addEventListener('change', () => { if (anPauseMusicDuring) anPauseMusicDuring.checked = pauseMusicDuring.checked; });
anFadeMusic?.addEventListener('change', () => { if (fadeMusic) fadeMusic.checked = anFadeMusic.checked; });
fadeMusic?.addEventListener('change', () => { if (anFadeMusic) anFadeMusic.checked = fadeMusic.checked; });

// Device selects sync: announce → CP
anInputDeviceSelect?.addEventListener('change', () => {
  if (inputDeviceSelect) { inputDeviceSelect.value = anInputDeviceSelect.value; inputDeviceSelect.dispatchEvent(new Event('change')); }
});
anOutputDeviceSelect?.addEventListener('change', () => {
  if (outputDeviceSelect) { outputDeviceSelect.value = anOutputDeviceSelect.value; outputDeviceSelect.dispatchEvent(new Event('change')); }
});
// Device selects: CP → announce (update in refreshAudioDeviceLists already handles initial population)
inputDeviceSelect?.addEventListener('change', () => {
  if (anInputDeviceSelect && anInputDeviceSelect.value !== inputDeviceSelect.value) anInputDeviceSelect.value = inputDeviceSelect.value;
});
outputDeviceSelect?.addEventListener('change', () => {
  if (anOutputDeviceSelect && anOutputDeviceSelect.value !== outputDeviceSelect.value) anOutputDeviceSelect.value = outputDeviceSelect.value;
});

// Announce page intercom toggle
anIntercomToggle?.addEventListener('click', () => {
  // Sync mode from announce page to CP before starting
  const anMode = document.querySelector('input[name="an-mode"]:checked')?.value;
  if (anMode) document.querySelectorAll('input[name="mode"]').forEach(m => { m.checked = m.value === anMode; });
  if (!intercomActive) startIntercom(); else stopIntercom();
});

// --- Clock proxy buttons (announce → main, then main update functions update both displays) ---
anBtnStopwatchStart?.addEventListener('click', () => btnStopwatchStart?.click());
anBtnStopwatchLap?.addEventListener('click', () => btnStopwatchLap?.click());
anBtnStopwatchReset?.addEventListener('click', () => btnStopwatchReset?.click());
anBtnTimerStart?.addEventListener('click', () => btnTimerStart?.click());
anBtnTimerReset?.addEventListener('click', () => btnTimerReset?.click());

// Sync announce timer inputs → main inputs
anTimerInputMin?.addEventListener('input', () => {
  if (timerInputMin) timerInputMin.value = anTimerInputMin.value;
  if (!timerRunning) { timerSecondsRemaining = readTimerInputs(); updateTimerDisplay(); stopFlashTimerAlert(); }
});
anTimerInputSec?.addEventListener('input', () => {
  if (timerInputSec) timerInputSec.value = anTimerInputSec.value;
  if (!timerRunning) { timerSecondsRemaining = readTimerInputs(); updateTimerDisplay(); stopFlashTimerAlert(); }
});

// Sync announce clock button text/disabled/icon states from main buttons (100ms poll)
setInterval(() => {
  if (anBtnStopwatchStart && btnStopwatchStart) {
    anBtnStopwatchStart.textContent = btnStopwatchStart.textContent;
    anBtnStopwatchStart.classList.toggle('btn-running', btnStopwatchStart.classList.contains('btn-running'));
  }
  if (anBtnStopwatchLap && btnStopwatchLap) anBtnStopwatchLap.disabled = btnStopwatchLap.disabled;
  if (anBtnTimerStart && btnTimerStart) {
    anBtnTimerStart.textContent = btnTimerStart.textContent;
    anBtnTimerStart.classList.toggle('btn-running', btnTimerStart.classList.contains('btn-running'));
  }
}, 100);

// --- Announce page soundboard ---
const announceSoundboardFiles = document.getElementById('announceSoundboardFiles');
const announceSoundboardVolume = document.getElementById('announceSoundboardVolume');

announceSoundboardFiles?.addEventListener('change', e => {
  Array.from(e.target.files).forEach(f => {
    const url = URL.createObjectURL(f);
    const item = {name: f.name, url, type: f.type, file: f, durationFormatted: 'Loading...'};
    soundboardSounds.push(item);
    loadFileMetadata(item, renderSoundboardGrid);
    analyzeSbPeak(item);
  });
  renderSoundboardGrid();
});

// Volume sync: announce ↔ audio page (slider + number input)
const soundboardVolumeInput = document.getElementById('soundboardVolumeInput');
const announceSoundboardVolumeInput = document.getElementById('announceSoundboardVolumeInput');

function syncSbVolumeInputs(sliderVal) {
  const pct = Math.round(sliderVal * 100);
  if (soundboardVolumeInput) soundboardVolumeInput.value = pct;
  if (announceSoundboardVolumeInput) announceSoundboardVolumeInput.value = pct;
}
function setSbVolume(val) {
  const clamped = Math.max(0, Math.min(2, val));
  if (soundboardVolume) soundboardVolume.value = clamped;
  if (announceSoundboardVolume) announceSoundboardVolume.value = clamped;
  syncSbVolumeInputs(clamped);
}

announceSoundboardVolume?.addEventListener('input', () => setSbVolume(parseFloat(announceSoundboardVolume.value)));
soundboardVolume?.addEventListener('input', () => setSbVolume(parseFloat(soundboardVolume.value)));

soundboardVolumeInput?.addEventListener('input', () => setSbVolume(parseFloat(soundboardVolumeInput.value || 0) / 100));
soundboardVolumeInput?.addEventListener('change', () => {
  const clamped = Math.max(0, Math.min(200, parseInt(soundboardVolumeInput.value) || 0));
  soundboardVolumeInput.value = clamped;
  setSbVolume(clamped / 100);
});
announceSoundboardVolumeInput?.addEventListener('input', () => setSbVolume(parseFloat(announceSoundboardVolumeInput.value || 0) / 100));
announceSoundboardVolumeInput?.addEventListener('change', () => {
  const clamped = Math.max(0, Math.min(200, parseInt(announceSoundboardVolumeInput.value) || 0));
  announceSoundboardVolumeInput.value = clamped;
  setSbVolume(clamped / 100);
});

// Stable volume toggle sync
async function applyStableVolume(enabled) {
  stableVolumeEnabled = enabled;
  const elA = document.getElementById('stableVolume');
  const elB = document.getElementById('announceStableVolume');
  if (elA) elA.checked = enabled;
  if (elB) elB.checked = enabled;
  if (enabled) {
    for (const s of soundboardSounds) {
      if (s.url && s.peakAmplitude === undefined) await analyzeSbPeak(s);
    }
  }
  // Refresh all labels (show adjustments when on, reset to 0.0 dB when off)
  updateAllSbNormLabels();
}
document.getElementById('stableVolume')?.addEventListener('change', function () { applyStableVolume(this.checked); });
document.getElementById('announceStableVolume')?.addEventListener('change', function () { applyStableVolume(this.checked); });

// --- Typed Announcement ---
let announcementLingerTimeout = null;

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function sendAnnouncement(text, textColor, bgColor, bgAlpha, lingerSec) {
  if (announcementLingerTimeout) { clearTimeout(announcementLingerTimeout); announcementLingerTimeout = null; }
  if (!displayWindow || displayWindow.closed) openDisplayWindow();
  const bgRgba = hexToRgba(bgColor, parseFloat(bgAlpha));
  const msg = {type: 'announcement', text, textColor, bgColor: bgRgba};
  setTimeout(() => { if (displayWindow && !displayWindow.closed) displayWindow.postMessage(msg, '*'); }, 200);
  const linger = parseFloat(lingerSec) || 0;
  if (linger > 0) {
    announcementLingerTimeout = setTimeout(() => clearAnnouncement(), linger * 1000 + 200);
  }
}

function clearAnnouncement() {
  if (announcementLingerTimeout) { clearTimeout(announcementLingerTimeout); announcementLingerTimeout = null; }
  if (!displayWindow || displayWindow.closed) return;
  displayWindow.postMessage({type: 'clearAnnouncement'}, '*');
}

document.getElementById('announcementBgAlpha')?.addEventListener('input', function() {
  const pct = Math.round(parseFloat(this.value) * 100);
  const label = document.getElementById('announcementBgAlphaVal');
  if (label) label.textContent = pct + '%';
});

document.getElementById('showAnnouncementBtn')?.addEventListener('click', () => {
  const text = document.getElementById('announcementTextInput')?.value?.trim() || '';
  if (!text) return;
  const textColor = document.getElementById('announcementTextColor')?.value || '#ffffff';
  const bgColor = document.getElementById('announcementBgColor')?.value || '#000000';
  const bgAlpha = document.getElementById('announcementBgAlpha')?.value || '0.85';
  const linger = document.getElementById('announcementLinger')?.value || '0';
  sendAnnouncement(text, textColor, bgColor, bgAlpha, linger);
});

document.getElementById('clearAnnouncementBtn')?.addEventListener('click', clearAnnouncement);

// --- Initialize announce page state from CP ---
(function initAnnouncePage() {
  // Sync intercom controls
  if (anIntercomVolume && intercomVolume) anIntercomVolume.value = intercomVolume.value;
  if (anPauseMusicDuring && pauseMusicDuring) anPauseMusicDuring.checked = pauseMusicDuring.checked;
  if (anFadeMusic && fadeMusic) anFadeMusic.checked = fadeMusic.checked;
  const cpMode = document.querySelector('input[name="mode"]:checked')?.value;
  if (cpMode) document.querySelectorAll('input[name="an-mode"]').forEach(r => { r.checked = r.value === cpMode; });
  // Sync timer inputs
  if (anTimerInputMin && timerInputMin) anTimerInputMin.value = timerInputMin.value;
  if (anTimerInputSec && timerInputSec) anTimerInputSec.value = timerInputSec.value;
  // Sync soundboard volume + number inputs
  if (announceSoundboardVolume && soundboardVolume) announceSoundboardVolume.value = soundboardVolume.value;
  syncSbVolumeInputs(parseFloat(soundboardVolume?.value) || 1);
})();

// ===== SETTINGS PAGE =====
(function initSettings() {
  function applyTheme(lightMode, highContrast, iconsMode, realisticMode, advancedMode) {
    document.body.classList.toggle('light-mode',     lightMode);
    document.body.classList.toggle('high-contrast',  highContrast);
    document.body.classList.toggle('icons-mode',     iconsMode);
    document.body.classList.toggle('realistic-mode', realisticMode);
    document.body.classList.toggle('advanced-mode',  advancedMode);
  }

  const lightMode     = localStorage.getItem('ecp-light-mode')      === 'true';
  const highContrast  = localStorage.getItem('ecp-high-contrast')    === 'true';
  const iconsMode     = localStorage.getItem('ecp-icons-mode')       === 'true';
  const realisticMode = localStorage.getItem('ecp-realistic-mode')   === 'true';
  const advancedMode  = localStorage.getItem('ecp-advanced-mode')    === 'true';
  applyTheme(lightMode, highContrast, iconsMode, realisticMode, advancedMode);

  const chkLight     = document.getElementById('settingLightMode');
  const chkContrast  = document.getElementById('settingHighContrast');
  const chkIcons     = document.getElementById('settingIconsMode');
  const chkRealistic = document.getElementById('settingRealisticMode');

  if (chkLight)     chkLight.checked     = lightMode;
  if (chkContrast)  chkContrast.checked  = highContrast;
  if (chkIcons)     chkIcons.checked     = iconsMode;
  if (chkRealistic) chkRealistic.checked = realisticMode;

  // Complexity radio
  document.querySelectorAll('input[name="complexity"]').forEach(r => {
    r.checked = (r.value === 'advanced') === advancedMode;
    r.addEventListener('change', () => {
      const isAdv = r.value === 'advanced';
      localStorage.setItem('ecp-advanced-mode', isAdv);
      document.body.classList.toggle('advanced-mode', isAdv);
    });
  });

  chkLight?.addEventListener('change', function () {
    localStorage.setItem('ecp-light-mode', this.checked);
    document.body.classList.toggle('light-mode', this.checked);
  });
  chkContrast?.addEventListener('change', function () {
    localStorage.setItem('ecp-high-contrast', this.checked);
    document.body.classList.toggle('high-contrast', this.checked);
  });
  chkIcons?.addEventListener('change', function () {
    localStorage.setItem('ecp-icons-mode', this.checked);
    document.body.classList.toggle('icons-mode', this.checked);
  });
  chkRealistic?.addEventListener('change', function () {
    localStorage.setItem('ecp-realistic-mode', this.checked);
    document.body.classList.toggle('realistic-mode', this.checked);
  });
})();


// ===== (Spotify Connect PKCE/SDK removed — using iframe embed instead) =====
(function _noop() { return;
  let scToken = null;
  let scRefreshToken = null;
  let scTokenExpiry = 0;
  let scPlayer = null;
  let scDeviceId = null;

  // PKCE helpers
  async function genVerifier() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const arr = crypto.getRandomValues(new Uint8Array(128));
    return Array.from(arr, x => chars[x % chars.length]).join('');
  }
  async function genChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function getRedirectUri() {
    return window.location.origin + window.location.pathname.replace(/index\.html$/, '');
  }

  async function startAuth() {
    const inputEl = document.getElementById('spotifyClientIdInput');
    const clientId = (inputEl?.value.trim()) || localStorage.getItem('ecp-spotify-client-id') || '';
    if (!clientId) { alert('Paste your Spotify App Client ID first.'); return; }
    localStorage.setItem('ecp-spotify-client-id', clientId);

    const verifier = await genVerifier();
    const challenge = await genChallenge(verifier);
    sessionStorage.setItem('ecp-spotify-verifier', verifier);
    sessionStorage.setItem('ecp-spotify-client-id-tmp', clientId);

    const scopes = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private user-library-read';
    const params = new URLSearchParams({
      client_id: clientId, response_type: 'code',
      redirect_uri: getRedirectUri(),
      code_challenge_method: 'S256', code_challenge: challenge,
      scope: scopes, show_dialog: 'true'
    });
    window.location.href = 'https://accounts.spotify.com/authorize?' + params;
  }

  async function exchangeCode(code) {
    const clientId = sessionStorage.getItem('ecp-spotify-client-id-tmp') || localStorage.getItem('ecp-spotify-client-id');
    const verifier = sessionStorage.getItem('ecp-spotify-verifier');
    if (!clientId || !verifier) return false;

    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, grant_type: 'authorization_code',
        code, redirect_uri: getRedirectUri(), code_verifier: verifier
      })
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    saveTokens(data);
    sessionStorage.removeItem('ecp-spotify-verifier');
    sessionStorage.removeItem('ecp-spotify-client-id-tmp');
    return true;
  }

  async function refreshTokens() {
    const clientId = localStorage.getItem('ecp-spotify-client-id');
    const rt = scRefreshToken || localStorage.getItem('ecp-spotify-refresh');
    if (!clientId || !rt) return false;
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: rt })
    });
    if (!resp.ok) return false;
    saveTokens(await resp.json());
    return true;
  }

  function saveTokens(data) {
    scToken = data.access_token;
    if (data.refresh_token) scRefreshToken = data.refresh_token;
    scTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    localStorage.setItem('ecp-spotify-token', scToken);
    if (scRefreshToken) localStorage.setItem('ecp-spotify-refresh', scRefreshToken);
    localStorage.setItem('ecp-spotify-expiry', String(scTokenExpiry));
  }

  async function api(endpoint, method = 'GET', body = null) {
    if (Date.now() > scTokenExpiry) { const ok = await refreshTokens(); if (!ok) return null; }
    if (!scToken) return null;
    const opts = { method, headers: { Authorization: 'Bearer ' + scToken } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const resp = await fetch('https://api.spotify.com/v1' + endpoint, opts);
    if (resp.status === 204) return {};
    if (!resp.ok) return null;
    return resp.json();
  }

  function loadSDK() {
    if (window.Spotify) { initPlayer(); return; }
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    document.head.appendChild(s);
    window.onSpotifyWebPlaybackSDKReady = initPlayer;
  }

  function initPlayer() {
    scPlayer = new window.Spotify.Player({
      name: 'Event Control Panel',
      getOAuthToken: async cb => {
        if (Date.now() > scTokenExpiry) await refreshTokens();
        cb(scToken);
      },
      volume: 0.8
    });
    scPlayer.addListener('ready', ({ device_id }) => {
      scDeviceId = device_id;
      setDeviceStatus('Ready · ' + device_id.slice(0, 8) + '…');
      api('/me/player', 'PUT', { device_ids: [device_id] });
    });
    scPlayer.addListener('not_ready', () => { scDeviceId = null; setDeviceStatus('Device offline'); });
    scPlayer.addListener('player_state_changed', updatePlayerUI);
    scPlayer.addListener('authentication_error', disconnect);
    scPlayer.addListener('account_error', () => {
      setDeviceStatus('Spotify Premium required for full playback');
    });
    scPlayer.connect().then(ok => {
      if (!ok) setDeviceStatus('Failed to connect — check token');
    });
    showPlayer();
  }

  function updatePlayerUI(state) {
    if (!state) return;
    const track = state.track_window?.current_track;
    if (track) {
      const nameEl = document.getElementById('spotifyTrackName');
      const artistEl = document.getElementById('spotifyArtistName');
      const albumEl = document.getElementById('spotifyAlbumName');
      const artEl = document.getElementById('spotifyAlbumArt');
      if (nameEl) nameEl.textContent = track.name;
      if (artistEl) artistEl.textContent = track.artists.map(a => a.name).join(', ');
      if (albumEl) albumEl.textContent = track.album?.name || '';
      if (artEl && track.album?.images?.[0]) artEl.style.backgroundImage = `url(${track.album.images[0].url})`;
    }
    const ppBtn = document.getElementById('spotifyPlayPauseBtn');
    if (ppBtn) {
      ppBtn.textContent = state.paused ? 'Play' : 'Pause';
      ppBtn.classList.toggle('active-play', !state.paused);
      ppBtn.classList.toggle('active-pause', !!state.paused);
      ppBtn.classList.toggle('inactive', false);
    }
  }

  function setDeviceStatus(msg) {
    const el = document.getElementById('spotifyDeviceStatus');
    if (el) el.textContent = msg;
  }

  function showPlayer() {
    const cs = document.getElementById('spotifyConnectSection');
    const ps = document.getElementById('spotifyPlayerSection');
    if (cs) cs.style.display = 'none';
    if (ps) ps.style.display = '';
  }

  function showConnect() {
    const cs = document.getElementById('spotifyConnectSection');
    const ps = document.getElementById('spotifyPlayerSection');
    if (cs) cs.style.display = '';
    if (ps) ps.style.display = 'none';
  }

  function disconnect() {
    if (scPlayer) { try { scPlayer.disconnect(); } catch {} scPlayer = null; }
    scToken = null; scRefreshToken = null; scDeviceId = null;
    localStorage.removeItem('ecp-spotify-token');
    localStorage.removeItem('ecp-spotify-refresh');
    localStorage.removeItem('ecp-spotify-expiry');
    showConnect();
  }

  async function search(query) {
    const data = await api('/search?q=' + encodeURIComponent(query) + '&type=track&limit=12');
    if (!data) return;
    const container = document.getElementById('spotifySearchResults');
    if (!container) return;
    container.innerHTML = '';
    (data.tracks?.items || []).forEach(track => {
      const row = document.createElement('div');
      row.className = 'spotify-result-item';
      const art = document.createElement('div');
      art.className = 'spotify-result-art';
      if (track.album?.images?.[1]) art.style.backgroundImage = `url(${track.album.images[1].url})`;
      const info = document.createElement('div');
      info.className = 'spotify-result-info';
      const tn = document.createElement('div'); tn.className = 'spotify-result-name'; tn.textContent = track.name;
      const ta = document.createElement('div'); ta.className = 'spotify-result-artist';
      ta.textContent = track.artists.map(a => a.name).join(', ') + ' · ' + (track.album?.name || '');
      info.append(tn, ta);
      const playBtn = document.createElement('button');
      playBtn.className = 'action-button spotify-result-play'; playBtn.type = 'button'; playBtn.title = 'Play'; playBtn.textContent = '▶';
      playBtn.addEventListener('click', () => {
        if (scDeviceId) api('/me/player/play?device_id=' + scDeviceId, 'PUT', { uris: [track.uri] });
      });
      row.append(art, info, playBtn);
      container.appendChild(row);
    });
  }

  // ---- Boot ----
  // Show redirect URI in the UI
  const uriEl = document.getElementById('spotifyRedirectUri');
  if (uriEl) uriEl.textContent = getRedirectUri();

  // Restore saved client ID to input
  const savedClientId = localStorage.getItem('ecp-spotify-client-id');
  if (savedClientId) {
    const inp = document.getElementById('spotifyClientIdInput');
    if (inp) inp.value = savedClientId;
  }

  // Handle OAuth callback code stored before app loaded
  const authCode = sessionStorage.getItem('spotify-auth-code');
  if (authCode) {
    sessionStorage.removeItem('spotify-auth-code');
    exchangeCode(authCode).then(ok => { if (ok) loadSDK(); });
  } else {
    // Restore existing session
    const savedToken = localStorage.getItem('ecp-spotify-token');
    const savedRefresh = localStorage.getItem('ecp-spotify-refresh');
    const savedExpiry = parseInt(localStorage.getItem('ecp-spotify-expiry') || '0');
    if (savedToken && savedRefresh) {
      scToken = savedToken; scRefreshToken = savedRefresh; scTokenExpiry = savedExpiry;
      if (Date.now() < scTokenExpiry) {
        loadSDK();
      } else {
        refreshTokens().then(ok => { if (ok) loadSDK(); });
      }
    }
  }

  // Wire up buttons
  document.getElementById('spotifyConnectBtn')?.addEventListener('click', startAuth);
  document.getElementById('spotifyDisconnectBtn')?.addEventListener('click', disconnect);
  document.getElementById('spotifyPlayPauseBtn')?.addEventListener('click', () => scPlayer?.togglePlay());
  document.getElementById('spotifyPrevBtn')?.addEventListener('click', () => scPlayer?.previousTrack());
  document.getElementById('spotifyNextBtn')?.addEventListener('click', () => scPlayer?.nextTrack());
  document.getElementById('spotifyVolumeSlider')?.addEventListener('input', function () {
    scPlayer?.setVolume(this.value / 100);
  });
  document.getElementById('spotifySearchBtn')?.addEventListener('click', () => {
    const q = document.getElementById('spotifySearchInput')?.value.trim();
    if (q) search(q);
  });
  document.getElementById('spotifySearchInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const q = e.target.value.trim(); if (q) search(q); }
  });
})();

// ===== VERSION TAG =====
// Static version for the packaged desktop apps (they do not self-update).
// Keep this in sync with the "version" field in package.json.
const APP_VERSION = 'v26.6.7';
(function initVersionTag() {
  const el = document.querySelector('.version-tag');
  if (!el) return;
  el.textContent = APP_VERSION;
})();

// ===== DISPLAY FREEZE / HIDE =====
document.getElementById('freezeDisplay')?.addEventListener('click', toggleDisplayFreeze);
document.getElementById('cpFreezeDisplay')?.addEventListener('click', toggleDisplayFreeze);
document.getElementById('hideDisplay')?.addEventListener('click', toggleDisplayHide);
document.getElementById('cpHideDisplay')?.addEventListener('click', toggleDisplayHide);

// ===== GLOBAL BUTTON CLICK FLASH =====
document.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  btn.classList.remove('btn-clicked');
  void btn.offsetWidth; // restart animation if clicked in quick succession
  btn.classList.add('btn-clicked');
}, { passive: true });
