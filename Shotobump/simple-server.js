const http = require('http');

const PORT = 3000;

console.log('🚀 Starting simple server...');
console.log('📁 Current working directory:', process.cwd());
console.log('📂 __dirname:', __dirname);

const server = http.createServer((req, res) => {
  console.log(`📝 Request: ${req.method} ${req.url}`);
  
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
      <head><title>Shotobump Test</title></head>
      <body>
        <h1>🎉 Shotobump Server is Working!</h1>
        <p>This is a test page to verify the server is running.</p>
        <p>Current directory: ${process.cwd()}</p>
        <p>Time: ${new Date().toISOString()}</p>
      </body>
    </html>
  `);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Simple server running at http://0.0.0.0:${PORT}/`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});

console.log('🏁 Server setup complete'); 