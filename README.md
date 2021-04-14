## TRON COMMON API Proxy Util

This script is intended to be used with the TRON Common API's docker compose stack.

It exposes a web port for configuration of what JWT information it will inject into inbound requests.  

It respects the following ENV VARS:
    
    + REAL_PROXY_URL - the URL to forward requests to (i.e. http://localhost:8000/api/v1)
    + WEB_PORT - the localhost port to serve the configuration interface on
    + LISTEN_ON_PORT - the localhost port to listen for inbound traffic for proxying
    + DEFAULT_JWT_FILE - the filename of the .jwt file content to inject into the request Authorization header
    + DEFAULT_NAMESPACE - the namespace string to inject into the requests x-forwarded-client-cert header (only useful for mimicing app to app comms)
    + ENABLE_PROXY - whether to inject headers or not (just pass through)