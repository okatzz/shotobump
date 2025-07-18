const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Try to find the dist directory
let DIST_DIR;
const possiblePaths = [
  path.join(__dirname, 'dist'),
  path.join(__dirname, 'Shotobump', 'dist'),
  path.join(process.cwd(), 'dist'),
  path.join(process.cwd(), 'Shotobump', 'dist')
];

for (const possiblePath of possiblePaths) {
  if (fs.existsSync(possiblePath)) {
    DIST_DIR = possiblePath;
    break;
  }
}

if (!DIST_DIR) {
  console.error('❌ ERROR: Could not find dist directory');
  console.error('Tried paths:', possiblePaths);
  console.error('Current working directory:', process.cwd());
  console.error('__dirname:', __dirname);
  process.exit(1);
}

console.log('✅ Found dist directory at:', DIST_DIR);

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  console.log(`📝 Request: ${req.method} ${req.url}`);
  
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);
  
  // Handle routes by serving index.html (for React Router)
  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const extname = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // File not found, serve index.html for SPA routing
        const indexPath = path.join(DIST_DIR, 'index.html');
        fs.readFile(indexPath, (err, content) => {
          if (err) {
            console.error('❌ Error reading index.html:', err);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            console.log('✅ Served index.html for SPA routing');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
          }
        });
      } else {
        console.error('❌ Server error:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
    } else {
      console.log(`✅ Served: ${filePath}`);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}/`);
  console.log(`📁 Serving files from: ${DIST_DIR}`);
  
  // List files in dist directory for debugging
  try {
    const files = fs.readdirSync(DIST_DIR);
    console.log('📂 Files in dist directory:', files);
  } catch (err) {
    console.error('❌ Error listing dist directory:', err);
  }
});

// Handle process termination gracefully
process.on('SIGTERM', () => {
  console.log('👋 Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('👋 Received SIGINT, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
}); 