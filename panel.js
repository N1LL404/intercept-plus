// State
let requests = [];
let capturedRequests = []; // Stores the full HAR objects
let preserveLog = false;

// DOM Elements
const requestListEl = document.getElementById('request-list');
const urlFilterEl = document.getElementById('url-filter');
const preserveLogEl = document.getElementById('preserve-log');
const btnClear = document.getElementById('btn-clear');
const btnDownload = document.getElementById('btn-download');
const btnCopyLog = document.getElementById('btn-copy-log');
const btnCopyCurl = document.getElementById('btn-copy-curl');
const btnCopyResponse = document.getElementById('btn-copy-response');
const curlContentEl = document.getElementById('curl-content');
const responseContentEl = document.getElementById('response-content');

let selectedRequestId = null;

// Initialization
try {
    chrome.devtools.network.onRequestFinished.addListener(onRequestFinished);
    chrome.devtools.network.onNavigated.addListener(() => {
        if (!preserveLog) {
            clearLog();
        }
    });
} catch (e) {
    console.error("Fetch Extension Error adding listeners:", e);
    requestListEl.innerHTML = `<div style="padding:10px; color:red">Error: ${e.message}</div>`;
}

// Event Listeners
if (urlFilterEl) urlFilterEl.addEventListener('input', renderList);
if (preserveLogEl) preserveLogEl.addEventListener('change', (e) => preserveLog = e.target.checked);
if (btnClear) btnClear.addEventListener('click', clearLog);
if (btnDownload) btnDownload.addEventListener('click', downloadNetlog);
if (btnCopyLog) btnCopyLog.addEventListener('click', copyAllLog);
if (btnCopyCurl) btnCopyCurl.addEventListener('click', copyCurlToClipboard);
if (btnCopyResponse) btnCopyResponse.addEventListener('click', copyResponseToClipboard);

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = `tab-${btn.dataset.tab}`;
        const tabEl = document.getElementById(tabId);
        if (tabEl) tabEl.classList.add('active');
    });
});

function onRequestFinished(request) {
    try {
        // Add to state
        const id = Date.now() + Math.random().toString();
        const item = {
            id,
            request
        };
        capturedRequests.push(item);

        // Remove empty state message if it's the first item
        if (capturedRequests.length === 1) {
            // Check if we still have the placeholder
            const placeholder = requestListEl.querySelector('.empty-state');
            if (placeholder) {
                requestListEl.innerHTML = '';
            }
        }

        // Check filter before rendering
        if (matchesFilter(request.request.url)) {
            appendRequestRow(item);
        }
    } catch (err) {
        console.error("Error processing request:", err);
    }
}

function matchesFilter(url) {
    if (!urlFilterEl) return true;
    const filter = urlFilterEl.value.trim();
    if (!filter) return true;

    // Convert glob-like * to regex wildcard .*
    // Escape special regex chars except *
    const regexString = filter.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try {
        const regex = new RegExp(regexString, 'i');
        return regex.test(url);
    } catch (e) {
        return url.toLowerCase().includes(filter.toLowerCase());
    }
}

function clearLog() {
    capturedRequests = [];
    requestListEl.innerHTML = `
        <div class="empty-state" style="padding: 20px; text-align: center; color: #888;">
            Log Cleared. Waiting...
        </div>
    `;
    selectedRequestId = null;
    updateDetailsView(null);
}

function renderList() {
    requestListEl.innerHTML = '';

    const filtered = capturedRequests.filter(item => matchesFilter(item.request.request.url));

    if (filtered.length === 0) {
        if (capturedRequests.length === 0) {
            requestListEl.innerHTML = `
                <div class="empty-state" style="padding: 20px; text-align: center; color: #888;">
                    Waiting for network requests...
                </div>`;
        } else {
            requestListEl.innerHTML = `
                <div class="empty-state" style="padding: 20px; text-align: center; color: #888;">
                    No requests match filter.
                </div>`;
        }
        return;
    }

    filtered.forEach(item => {
        appendRequestRow(item);
    });
}

function appendRequestRow(item) {
    const req = item.request;
    const div = document.createElement('div');
    div.className = 'request-item';
    div.dataset.id = item.id;
    div.onclick = () => selectRequest(item);

    const statusClass = req.response.status >= 400 ? 'status-400' : 'status-200';
    let name = '/';
    try {
        name = new URL(req.request.url).pathname.split('/').pop() || req.request.url;
    } catch (e) { name = req.request.url.substring(0, 30); }

    const mime = req.response.content.mimeType ? req.response.content.mimeType.split('/')[1] : '-';

    div.innerHTML = `
        <span class="col-status ${statusClass}">${req.response.status}</span>
        <span class="col-method">${req.request.method}</span>
        <span class="col-name" title="${req.request.url}">${name}</span>
        <span class="col-type">${mime || '?'}</span>
        <span class="col-size">${formatBytes(req.response.bodySize)}</span>
        <span class="col-time">${Math.round(req.time)}ms</span>
    `;
    requestListEl.appendChild(div);
}

function selectRequest(item) {
    selectedRequestId = item.id;
    // Highlight UI
    document.querySelectorAll('.request-item').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`.request-item[data-id="${item.id}"]`);
    if (el) el.classList.add('selected');

    updateDetailsView(item.request);
}

function updateDetailsView(request) {
    if (!request) {
        curlContentEl.textContent = 'Select a request to view cURL...';
        responseContentEl.textContent = 'Select a request to view Response...';
        return;
    }

    // 1. Generate cURL
    try {
        const curl = generateCurl(request);
        curlContentEl.textContent = curl;
    } catch (e) {
        curlContentEl.textContent = "Error generating cURL: " + e.message;
    }

    // 2. Get Response Body
    try {
        request.getContent((content, encoding) => {
            if (chrome.runtime.lastError) {
                responseContentEl.textContent = "(Error loading content: " + chrome.runtime.lastError.message + ")";
            } else {
                responseContentEl.textContent = content || '(No content)';
            }
        });
    } catch (e) {
        responseContentEl.textContent = "(Exception loading content: " + e.message + ")";
    }
}

function generateCurl(har) {
    const req = har.request;
    const parts = [];

    // Helper to escape single quotes for bash: ' -> '\''
    const escapeQuote = (str) => str.replace(/'/g, "'\\''");

    // URL (escape quotes)
    parts.push(`curl '${escapeQuote(req.url)}'`);

    const cookiesHeader = req.headers.find(h => h.name.toLowerCase() === 'cookie');

    // Headers
    if (req.headers) {
        req.headers.forEach(h => {
            const name = h.name.toLowerCase();
            // Skip pseudo-headers, Cookie, and Content-Length (curl calculates it)
            if (name.startsWith(':') || name === 'cookie' || name === 'content-length') return;
            parts.push(`  -H '${escapeQuote(h.name)}: ${escapeQuote(h.value)}'`);
        });
    }

    // Cookies (-b)
    if (cookiesHeader) {
        parts.push(`  -b '${escapeQuote(cookiesHeader.value)}'`);
    }

    // Body
    if (req.postData) {
        // 1. Try raw text first (most accurate for multipart/custom payloads)
        if (req.postData.text) {
            let bodyText = req.postData.text;

            // ANSI-C quoting requirement check for newlines
            if (bodyText.includes('\n') || bodyText.includes('\r')) {
                const safeC = bodyText
                    .replace(/\\/g, '\\\\')
                    .replace(/'/g, "\\'")
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r');

                parts.push(`  --data-raw $'${safeC}'`);
            } else {
                parts.push(`  --data-raw '${escapeQuote(bodyText)}'`);
            }
        }
        // 2. Fallback to params if text is missing
        else if (req.postData.params && req.postData.params.length > 0) {
            const paramParts = req.postData.params.map(param => {
                const name = encodeURIComponent(param.name);
                const value = param.value ? encodeURIComponent(param.value) : '';
                return `${name}=${value}`;
            });
            const bodyStr = paramParts.join('&');
            parts.push(`  --data-raw '${escapeQuote(bodyStr)}'`);
        }
    }

    // Join all parts with backslash-newline, NO trailing backslash
    return parts.join(' \\\n');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Actions
async function downloadNetlog() {
    // Get only filtered requests
    const filtered = capturedRequests.filter(item => matchesFilter(item.request.request.url));

    if (filtered.length === 0) {
        alert('No requests to download.');
        return;
    }

    // Format each request like example.txt
    const separator = '\n\n==========================================================================================\n';
    const entries = [];

    for (const item of filtered) {
        const curl = generateCurl(item.request);

        // Get response content (async)
        let responseBody = '(No content)';
        try {
            responseBody = await new Promise((resolve) => {
                item.request.getContent((content, encoding) => {
                    resolve(content || '(No content)');
                });
            });
        } catch (e) {
            responseBody = '(Error getting content)';
        }

        const entry = `${curl}\n\nResponse :\n${responseBody}`;
        entries.push(entry);
    }

    const content = entries.join(separator) + separator;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netlog_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

async function copyAllLog() {
    // Get only filtered requests
    const filtered = capturedRequests.filter(item => matchesFilter(item.request.request.url));

    if (filtered.length === 0) {
        alert('No requests to copy.');
        return;
    }

    // Format each request like example.txt
    const separator = '\n\n==========================================================================================\n';
    const entries = [];

    for (const item of filtered) {
        const curl = generateCurl(item.request);

        // Get response content (async)
        let responseBody = '(No content)';
        try {
            responseBody = await new Promise((resolve) => {
                item.request.getContent((content, encoding) => {
                    resolve(content || '(No content)');
                });
            });
        } catch (e) {
            responseBody = '(Error getting content)';
        }

        const entry = `${curl}\n\nResponse :\n${responseBody}`;
        entries.push(entry);
    }

    const content = entries.join(separator) + separator;
    copyTextToClipboard(content, btnCopyLog);
}

function copyCurlToClipboard() {
    const text = curlContentEl.textContent;
    copyTextToClipboard(text, btnCopyCurl);
}

function copyResponseToClipboard() {
    const text = responseContentEl.textContent;
    copyTextToClipboard(text, btnCopyResponse);
}

// Resizable Splitter Logic
const resizer = document.getElementById('drag-handle');
const leftPane = requestListEl.parentElement; // .request-list-container

let x = 0;
let w = 0;

const mouseDownHandler = function (e) {
    x = e.clientX;
    const rect = leftPane.getBoundingClientRect();
    w = rect.width;

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
    resizer.classList.add('resizing');
    // Disable selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
};

const mouseMoveHandler = function (e) {
    const dx = e.clientX - x;
    const newWidth = w + dx;
    // Min/Max constraints
    if (newWidth > 100 && newWidth < document.body.clientWidth - 100) {
        leftPane.style.width = `${newWidth}px`;
    }
};

const mouseUpHandler = function () {
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
    resizer.classList.remove('resizing');
    document.body.style.removeProperty('user-select');
    document.body.style.removeProperty('cursor');
};

if (resizer) resizer.addEventListener('mousedown', mouseDownHandler);


function copyTextToClipboard(text, btnElement) {
    console.log('[Fetch Extension] copyTextToClipboard called, text length:', text ? text.length : 0);
    if (!text) {
        console.warn('[Fetch Extension] No text to copy');
        return;
    }

    // Use document.execCommand as primary - it works better in DevTools context
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    let success = false;
    try {
        success = document.execCommand('copy');
        console.log('[Fetch Extension] execCommand result:', success);
    } catch (err) {
        console.error('[Fetch Extension] execCommand error:', err);
    }

    document.body.removeChild(textArea);

    if (success) {
        showCopyFeedback(btnElement, true);
    } else {
        showCopyFeedback(btnElement, false);
    }
}

function showCopyFeedback(btn, success) {
    if (!btn) return;

    const originalHtml = btn.innerHTML;

    if (success) {
        btn.style.color = '#00ff9d';
        btn.style.borderColor = '#00ff9d';
        // Show checkmark
        const checkSvg = '<svg class="icon" viewBox="0 0 24 24" style="fill:#00ff9d"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        if (btn.innerText.trim().length > 0) {
            btn.innerHTML = checkSvg + ' Copied!';
        } else {
            btn.innerHTML = checkSvg;
        }
    } else {
        btn.style.color = '#ff4d4d';
        btn.style.borderColor = '#ff4d4d';
        btn.innerHTML = '<span>Failed</span>';
    }

    setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.style.color = '';
        btn.style.borderColor = '';
    }, 1500);
}

