const http = require('http');

const options = {
  hostname: 'localhost',
  port: 8000, // assuming backend is on 8000
  path: '/api/v1/hospitals/', // or whatever the api url is
  method: 'GET'
};

const req = http.request(options, res => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
