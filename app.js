import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { RefactorEngine } from './refactor-engine.js';

// Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const htmlInput = document.getElementById('htmlInput');
const processBtn = document.getElementById('processBtn');
const statusLog = document.getElementById('statusLog');
const fileMsg = document.querySelector('.file-msg');

// Engine
const engine = new RefactorEngine();

// --- Event Listeners ---

// Drag and Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');  
    
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

// Process Button
processBtn.addEventListener('click', async () => {
    const htmlContent = htmlInput.value;
    
    if (!htmlContent.trim()) {
        addLog("Error: No HTML content provided.", "error");
        return;
    }

    const options = {
        cssStrategy: document.querySelector('input[name="cssStrategy"]:checked').value,
        jsStrategy: document.querySelector('input[name="jsStrategy"]:checked').value,
        extremeMode: document.getElementById('extremeMode').checked
    };

    addLog("Initializing Refactor Engine...", "info");
    
    try {
        const result = engine.process(htmlContent, options);
        
        // Display engine logs
        result.logs.forEach(log => addLog(log.message, log.type));
        
        if (result.html) {
            await createAndDownloadZip(result);
        }
    } catch (err) {
        addLog(`Critical Error: ${err.message}`, "error");
        console.error(err);
    }
});

// --- Helpers ---

function handleFile(file) {
    if (file.type !== "text/html" && !file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
        addLog("Error: Please upload a valid .html file", "error");
        return;
    }

    fileMsg.textContent = `Selected: ${file.name} (${formatBytes(file.size)})`;
    addLog(`File loaded: ${file.name}`, "info");

    const reader = new FileReader();
    reader.onload = (e) => {
        htmlInput.value = e.target.result;
        addLog("HTML content loaded into editor.", "success");
    };
    reader.readAsText(file);
}

function addLog(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = `log-entry log-${type}`;
    const time = new Date().toLocaleTimeString();
    div.textContent = `[${time}] ${msg}`;
    statusLog.appendChild(div);
    statusLog.scrollTop = statusLog.scrollHeight;
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function createAndDownloadZip(result) {
    addLog("Generating ZIP archive...", "info");
    
    const zip = new JSZip();
    
    // Add modified index.html
    zip.file("index.html", result.html);
    
    // Add extracted files
    let cssCount = 0;
    let jsCount = 0;
    
    result.files.forEach(file => {
        zip.file(file.name, file.content);
        if (file.name.endsWith('.css')) cssCount++;
        if (file.name.endsWith('.js')) jsCount++;
    });

    addLog(`Packed index.html, ${cssCount} CSS files, ${jsCount} JS files.`, "info");

    try {
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "refactored-project.zip");
        addLog("Download started!", "success");
    } catch (err) {
        addLog(`ZIP Generation Error: ${err.message}`, "error");
    }
}