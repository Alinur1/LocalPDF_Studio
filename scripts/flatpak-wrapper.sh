#!/bin/sh
export PATH="/app/main/resources/assets/backend_linux/compiled-ghostscript/bin:$PATH"

# "$@" ensures that the file path (e.g. /home/user/file.pdf) is passed to the app
exec /app/main/localpdf-studio --no-sandbox "$@"