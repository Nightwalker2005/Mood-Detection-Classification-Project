// ── State ─────────────────────────────────────────────────
let mode = 'camera';
let cameraActive = false;
let cameraInterval = null;
let frameCount = 0;
let selectedFile = null;
let sendingFrame = false;
let lastFaces = [];
let rafId = null;

// ── Helpers ───────────────────────────────────────────────
function getServerUrl() {
  return window.location.origin;
}

// ── Health check ──────────────────────────────────────────
async function checkHealth() {
  const dot = document.getElementById('server-dot');
  const label = document.getElementById('server-status');
  try {
    const res = await fetch(getServerUrl() + '/health', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.className = 'dot online';
      label.textContent = 'connected';
      return true;
    }
  } catch {}
  dot.className = 'dot';
  label.textContent = 'offline';
  return false;
}

// ── Mode switching ────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.getElementById('btn-camera').classList.toggle('active', m === 'camera');
  document.getElementById('btn-upload').classList.toggle('active', m === 'upload');
  document.getElementById('camera-panel').style.display = m === 'camera' ? 'block' : 'none';
  document.getElementById('upload-panel').style.display = m === 'upload' ? 'block' : 'none';
  document.getElementById('cam-controls').style.display = m === 'camera' ? 'flex' : 'none';
  document.getElementById('upload-controls').style.display = m === 'upload' ? 'flex' : 'none';
  document.getElementById('viewer-label').textContent = m === 'camera' ? 'LIVE FEED' : 'IMAGE';
  document.getElementById('stat-mode').textContent = m === 'camera' ? 'Camera' : 'Upload';

  if (m === 'upload' && cameraActive) stopCamera();
  clearResults();
}

// ── Camera ────────────────────────────────────────────────
async function startCamera() {
  if (!(await checkHealth())) { showToast('Cannot reach API server. Is it running?'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = document.getElementById('webcam-raw');
    video.srcObject = stream;
    document.getElementById('cam-placeholder').style.display = 'none';
    document.getElementById('btn-start-cam').style.display = 'none';
    document.getElementById('btn-stop-cam').style.display = 'inline-flex';
    document.getElementById('live-badge').style.display = 'flex';
    cameraActive = true;
    sendingFrame = false;
    lastFaces = [];

    video.onloadedmetadata = () => {
      const canvas = document.getElementById('overlay-canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.style.display = 'block';
      drawLoop();
      cameraInterval = setInterval(pollApi, 500); // API call every 0.5s
    };
  } catch (e) {
    showToast('Camera access denied. Please allow camera permissions.');
  }
}

function stopCamera() {
  clearInterval(cameraInterval);
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  cameraActive = false;
  sendingFrame = false;
  lastFaces = [];
  const video = document.getElementById('webcam-raw');
  if (video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  const canvas = document.getElementById('overlay-canvas');
  canvas.style.display = 'none';
  document.getElementById('cam-placeholder').style.display = 'flex';
  document.getElementById('btn-start-cam').style.display = 'inline-flex';
  document.getElementById('btn-stop-cam').style.display = 'none';
  document.getElementById('live-badge').style.display = 'none';
  clearResults();
}

// Runs at 60fps — draws live video + cached face labels onto the canvas
function drawLoop() {
  const video = document.getElementById('webcam-raw');
  const canvas = document.getElementById('overlay-canvas');
  const ctx = canvas.getContext('2d');

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  for (const face of lastFaces) {
    const { x, y, w, h } = face.box;
    const color = face.mood === 'Positive' ? '#00e5a0'
                : face.mood === 'Negative' ? '#ff4d6d'
                : face.mood === 'Neutral'  ? '#7b61ff'
                : '#6b6b80';

    // Box
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Label background
    const label = `${face.mood} (${face.confidence}%)`;
    ctx.font = 'bold 14px Syne, sans-serif';
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 24, textW + 12, 22);

    // Label text
    ctx.fillStyle = face.mood === 'Neutral' ? '#fff' : '#000';
    ctx.fillText(label, x + 6, y - 7);
  }

  if (cameraActive) rafId = requestAnimationFrame(drawLoop);
}

// Sends a frame to the API in the background — doesn't block the render loop
async function pollApi() {
  if (sendingFrame) return;
  const video = document.getElementById('webcam-raw');
  if (video.readyState < 2 || video.videoWidth === 0) return;

  const canvas = document.getElementById('capture-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

  sendingFrame = true;
  try {
    const res = await fetch(getServerUrl() + '/analyze/frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame: dataUrl }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    lastFaces = data.faces || [];

    frameCount++;
    document.getElementById('stat-frames').textContent = frameCount;
    document.getElementById('stat-faces').textContent = lastFaces.length;
    document.getElementById('frame-counter').textContent = `frame #${frameCount}`;
    renderResults(lastFaces);
  } catch (e) {
    console.warn('Frame analysis failed:', e);
  } finally {
    sendingFrame = false;
  }
}

// ── Image upload ──────────────────────────────────────────
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  loadFile(file);
}

function loadFile(file) {
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('preview-img');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('btn-analyze-img').disabled = false;
  };
  reader.readAsDataURL(file);
}

async function analyzeImage() {
  if (!selectedFile) return;
  if (!(await checkHealth())) { showToast('Cannot reach API server. Is it running?'); return; }

  document.getElementById('spinner').classList.add('show');
  document.getElementById('btn-analyze-img').disabled = true;

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const res = await fetch(getServerUrl() + '/analyze/image', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    if (data.error) { showToast(data.error); return; }

    if (data.labeled_image) {
      const img = document.getElementById('preview-img');
      const src = 'data:image/jpeg;base64,' + data.labeled_image;

      // Draw colour-coded boxes on top of the returned image
      const tempImg = new Image();
      tempImg.onload = () => {
        // Create a canvas the same size as the image
        const canvas = document.createElement('canvas');
        canvas.width = tempImg.naturalWidth;
        canvas.height = tempImg.naturalHeight;
        const ctx = canvas.getContext('2d');

        // Draw the base image (without OpenCV boxes)
        ctx.drawImage(tempImg, 0, 0);

        // Draw colour-coded boxes and labels
        for (const face of data.faces) {
          const { x, y, w, h } = face.box;
          const color = face.mood === 'Positive' ? '#00e5a0'
                      : face.mood === 'Negative' ? '#ff4d6d'
                      : face.mood === 'Neutral'  ? '#7b61ff'
                      : '#6b6b80';

          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);

          const label = `${face.mood} (${face.confidence}%)`;
          ctx.font = 'bold 14px Syne, sans-serif';
          const textW = ctx.measureText(label).width;
          ctx.fillStyle = color;
          ctx.fillRect(x, y - 24, textW + 12, 22);
          ctx.fillStyle = face.mood === 'Neutral' ? '#fff' : '#000';
          ctx.fillText(label, x + 6, y - 7);
        }

        img.src = canvas.toDataURL('image/jpeg', 0.95);
        img.style.display = 'block';
      };
      tempImg.src = src;
    }

    frameCount++;
    document.getElementById('stat-frames').textContent = frameCount;
    document.getElementById('stat-faces').textContent = data.faces?.length || 0;
    document.getElementById('frame-counter').textContent = `analyzed`;
    renderResults(data.faces || []);
  } catch (e) {
    showToast('Request failed. Is the server running?');
  } finally {
    document.getElementById('spinner').classList.remove('show');
    document.getElementById('btn-analyze-img').disabled = false;
  }
}

function clearImage() {
  selectedFile = null;
  document.getElementById('preview-img').style.display = 'none';
  document.getElementById('preview-img').src = '';
  document.getElementById('drop-zone').style.display = 'block';
  document.getElementById('file-input').value = '';
  document.getElementById('btn-analyze-img').disabled = true;
  document.getElementById('frame-counter').textContent = '—';
  clearResults();
}

// ── Drag and drop ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // Init
  checkHealth();
  setInterval(checkHealth, 15000);
});

// ── Results rendering ─────────────────────────────────────
function renderResults(faces) {
  const body = document.getElementById('results-body');
  if (!faces.length) {
    body.innerHTML = '<div class="no-results">No faces detected</div>';
    return;
  }
  body.innerHTML = faces.map((f, i) => `
    <div class="face-card">
      <div class="face-label">
        <span class="face-num">FACE ${i + 1}</span>
        <span class="mood-badge ${f.mood}">${f.mood}</span>
      </div>
      <div class="confidence-bar">
        <div class="confidence-fill ${f.mood}" style="width:${f.confidence}%"></div>
      </div>
      <div class="confidence-text">${f.confidence}% confidence</div>
    </div>
  `).join('');
}

function clearResults() {
  document.getElementById('results-body').innerHTML = '<div class="no-results">No faces detected yet</div>';
  document.getElementById('frame-counter').textContent = '—';
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}