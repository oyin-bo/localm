const http = require('http'), fs = require('fs'), path = require('path');

http.createServer((req, res) => {
  const file = '.' + (req.url === '/' ? '/index.html' : req.url);

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end(String(err));
    }

    const ext = path.extname(file);
    const contentType = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css'
    }[ext] || 'text/plain';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}).listen(8000, () => console.log('Serving on port 8000'));
