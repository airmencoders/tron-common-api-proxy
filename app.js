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
const cwd = __dirname;

const REAL_PROXY_URL = process.env.REAL_PROXY_URL; // URL to proxy to
const WEB_PORT = process.env.WEB_PORT || 9001; // web config port
const LISTEN_ON_PORT = process.env.LISTEN_ON_PORT || 9000;  // port to listen on for traffic to proxy

var jwtToken = process.env.DEFAULT_JWT_FILE || "admin.jwt";
var namespace = process.env.DEFAULT_NAMESPACE || "istio-system";

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
  res.render("index", { title: 'Config', files, contents });
});

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
if (jwtToken && process.env.ENABLE_PROXY === 'true') {
  var tokenContents = jwt.encode(
    JSON.parse(fs.readFileSync(cwd + '/' + jwtToken)),
    "somesecretphrase",
    "HS256"
  );
  proxyReq.setHeader("Authorization", "Bearer " + tokenContents);
}

// this header is used for app-to-app in-cluster comms using cluster FQDNs
if (namespace && process.env.ENABLE_PROXY === 'true') {
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

