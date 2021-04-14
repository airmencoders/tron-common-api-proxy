'use strict';
const express = require('express');
const fs = require('fs');
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser');
const eta_engine = require('eta');
const httpProxy = require("http-proxy");
const jwt = require('jwt-simple');
const app = express();
const cors = require('cors');

const REAL_PROXY_URL = process.env.REAL_PROXY_URL; // URL to proxy to
const WEB_PORT = process.env.WEB_PORT || 9001; // web config port
const LISTEN_ON_PORT = process.env.LISTEN_ON_PORT || 9000;  // port to listen on for traffic to proxy

var jwtToken = process.env.DEFAULT_JWT_FILE || "admin.jwt";
var namespace = process.env.DEFAULT_NAMESPACE || "istio-system";
var proxyEnabled = process.env.ENABLE_PROXY || 'true';

app.engine("html", eta_engine.renderFile);
app.set("view engine", "html");
app.set("views", "./views");
app.use(cors());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

// serve any static public content
app.use(/^\/public/, express.static("public"));

app.get("/", async(req, res) => {
  const files = fs.readdirSync("/app/jwts");
  const contents = {};
  files.forEach(file => contents[file] = fs.readFileSync("/app/jwts/" + file).toString());
  const namespaces = fs
                      .readFileSync('namespaces.txt')
                      .toString()
                      .split('\n')
                      .map(item => item.trim())
                      .filter(item => item != null && item !== '');

  res.render("index", { title: 'Config',
    files,
    contents,
    activeJwt: jwtToken,
    proxyEnabled,
    activeNamespace: namespace,
    namespaces
  });
});

app.post("/toggle-proxy", (req, res) => {
  proxyEnabled = (req.body['toggle-proxy'] === 'on' ? 'true' : 'false');
  res.redirect("/");
});

app.post("/change-jwt", (req, res) => {
  jwtToken = req.body['jwts'];
  res.redirect("/");
});

app.post("/change-ns", (req, res) => {
  namespace = req.body['namespaces'];
  res.redirect("/");
});

app.post("/new-ns", (req, res) => {
  fs.writeFileSync("namespaces.txt", "\n" + req.body['new-ns-name'], { flag: 'a+' });
  res.redirect("/");
});

app.post('/delete-ns', (req, res) => {
  let buffer = '';
  const namespaces = fs
      .readFileSync('namespaces.txt')
      .toString()
      .split('\n')
      .map(item => item.trim())
      .filter(item => item != null && item !== '');

  for (let item of namespaces) {
    if (item === 'istio-system') {
      buffer +=  item;
      continue;
    }

    if (item === req.body['ns-name']) continue;

    buffer += '\n' + item;
  }

  fs.writeFileSync("namespaces.txt", buffer, { flag: 'w+' });
  res.redirect('/');
});

app.post('/save-jwt', (req, res) => {
  if (jwtToken && proxyEnabled === 'true') {
      fs.writeFileSync("/app/jwts/" + jwtToken, req.body['jwt-contents'], { flag: 'w+' });
  }
  res.redirect("/");
});

app.post('/save-as-jwt', (req, res) => {
  if (jwtToken && proxyEnabled === 'true') {
      fs.writeFileSync("/app/jwts/" + req.body['new-jwt-name'], req.body['new-jwt-contents'], { flag: 'w+' });
  }
  res.redirect("/");
});

app.post('/delete-jwt', (req, res) => {
  if (jwtToken && proxyEnabled === 'true') {
      fs.unlinkSync("/app/jwts/" + req.body['jwt-name']);
      jwtToken = fs.readdirSync("/app/jwts")[0];
  }
  res.redirect("/");
})

app.use('*', function (req, res) {
  res.status(404).send('Not found!');
});

app.listen(Number(WEB_PORT), function () {
  console.log('Started at web port ' + WEB_PORT);
});

//**********************/
// set up proxy
const proxy = httpProxy.createProxyServer({
  target: REAL_PROXY_URL  
});

// inject the headers and auth token
proxy.on('proxyReq', function(proxyReq, req, res, options) {

// this header is the JWT from Keyclock/istio
if (jwtToken && proxyEnabled === 'true') {
  var tokenContents = jwt.encode(
    JSON.parse(fs.readFileSync('/app/jwts/' + jwtToken)),
    "somesecretphrase",
    "HS256"
  );
  proxyReq.setHeader("Authorization", "Bearer " + tokenContents);
}

// this header is used for app-to-app in-cluster comms using cluster FQDNs
if (namespace && proxyEnabled === 'true') {
  proxyReq.setHeader(
    "x-forwarded-client-cert",
    `By=spiffe://cluster.local/ns/tron-common-api/sa/default;Hash=blah;Subject="";URI=spiffe://cluster.local/ns/${namespace}/sa/default`
  );
}
});

// handle errors so we don't crash out, just return a 500 error
proxy.on('error', function (err, req, res) {
  console.log("Error: " + err);
  res.writeHead(500, {
    'Content-Type': 'text/plain'
  });   
  res.end('Something went wrong. Unable to proxy request. Check destination status. ' + err);
});

proxy.listen(LISTEN_ON_PORT);

